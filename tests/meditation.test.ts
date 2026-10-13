import { describe, expect, it } from 'vitest'
import { BowlsGen, OmGen } from '../src/dsp/meditation'
import { mulberry32 } from '../src/dsp/noise'
import { isGenerated, isMeditation, isNature } from '../src/dsp/params'
import { describePreset, NOISE_LABELS } from '../src/presets'
import { powerSpectrum } from './fft'

const FS = 48000

function render(gen: { next(): number }, seconds: number): Float32Array {
  const n = Math.round(seconds * FS)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = gen.next()
  return x
}
const rms = (x: ArrayLike<number>, a = 0, b = x.length) => {
  let s = 0
  for (let i = a; i < b; i++) s += (x[i] as number) ** 2
  return Math.sqrt(s / (b - a))
}
const sec = (x: Float32Array, a: number, b: number) => rms(x, Math.round(a * FS), Math.round(b * FS))
const peak = (x: ArrayLike<number>) => {
  let m = 0
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] as number))
  return m
}
/** Envolvente de |x| con un paso bajo de constante `tau` (s). */
function envelope(x: ArrayLike<number>, tau: number): Float64Array {
  const a = 1 - Math.exp(-1 / (tau * FS))
  const e = new Float64Array(x.length)
  let y = 0
  for (let i = 0; i < x.length; i++) {
    y += a * (Math.abs(x[i] as number) - y)
    e[i] = y
  }
  return e
}
/** Mayor subida de la envolvente (τ = 150 ms) en 100 ms, como fracción de su máximo. */
function maxRiseFraction(x: ArrayLike<number>): number {
  const e = envelope(x, 0.15)
  let top = 0
  for (const v of e) top = Math.max(top, v)
  const step = FS / 10
  let rise = 0
  for (let i = step; i < e.length; i++) rise = Math.max(rise, ((e[i] as number) - (e[i - step] as number)) / top)
  return rise
}
/** Potencia espectral media (Hann, segmentos de 65536 muestras) entre `lo` y `hi` Hz. */
function bandPower(x: Float32Array, from: number, lo: number, hi: number, n = 65536): number {
  const p = powerSpectrum(x, Math.round(from * FS), n)
  let s = 0
  for (let k = 1; k < p.length; k++) {
    const f = (k * FS) / n
    if (f >= lo && f < hi) s += p[k] as number
  }
  return s
}

describe('cuencos tibetanos', () => {
  const single = (level = 0.3) =>
    new BowlsGen(mulberry32(5), FS, level, { pitches: [220], firstStrikeSec: 0.2, minGapSec: 1000, maxGapSec: 1000 })

  it('es determinista, finito y dentro de ±1', () => {
    const a = render(new BowlsGen(mulberry32(11), FS), 20)
    expect(render(new BowlsGen(mulberry32(11), FS), 3)).toEqual(a.slice(0, 3 * FS))
    expect(render(new BowlsGen(mulberry32(12), FS), 3)).not.toEqual(a.slice(0, 3 * FS))
    expect(a.every(Number.isFinite)).toBe(true)
    expect(peak(a)).toBeLessThanOrEqual(1)
  })

  it('tiene un nivel parecido al del ruido rosa (RMS 0,12–0,30) y alguna parte en silencio relativo entre golpes', () => {
    const x = render(new BowlsGen(mulberry32(3), FS), 90)
    const r = rms(x)
    console.log(`  cuencos: RMS = ${r.toFixed(3)} · pico = ${peak(x).toFixed(3)}`)
    expect(r).toBeGreaterThan(0.1)
    expect(r).toBeLessThan(0.3)
  })

  it('los parciales son inarmónicos: hay energía en 2,71·f y casi ninguna en 2·f', () => {
    const x = render(single(), 4)
    const at = (f: number) => bandPower(x, 1.0, f * 0.985, f * 1.015)
    const fund = at(220)
    const p271 = at(220 * 2.71)
    const harmonic2 = at(440)
    console.log(`  potencia relativa: f ${fund.toExponential(1)} · 2,71f ${p271.toExponential(1)} · 2f (armónico) ${harmonic2.toExponential(1)}`)
    expect(fund).toBeGreaterThan(0)
    expect(p271).toBeGreaterThan(10 * harmonic2)
    expect(at(220 * 5.31)).toBeGreaterThan(5 * at(220 * 5))
  })

  it('la fundamental bate lentamente (el par de frecuencias casi iguales hace «wah-wah»)', () => {
    const x = render(single(), 8)
    // demodulación en cuadratura a 220 Hz → envolvente lenta de la fundamental
    const n = x.length
    const I = new Float64Array(n)
    const Q = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      I[i] = (x[i] as number) * Math.cos((2 * Math.PI * 220 * i) / FS)
      Q[i] = (x[i] as number) * Math.sin((2 * Math.PI * 220 * i) / FS)
    }
    const a = 1 - Math.exp(-1 / (0.06 * FS)) // paso bajo ~ 2,6 Hz
    const env = new Float64Array(n)
    let li = 0
    let lq = 0
    for (let i = 0; i < n; i++) {
      li += a * ((I[i] as number) - li)
      lq += a * ((Q[i] as number) - lq)
      env[i] = Math.hypot(li, lq)
    }
    // mínimos locales de la envolvente entre 1 s y 7 s (cada valle es un nulo del batido)
    let valleys = 0
    const step = Math.round(0.05 * FS)
    for (let i = 1 * FS + step; i < 7 * FS - step; i += step) {
      if ((env[i] as number) < (env[i - step] as number) && (env[i] as number) <= (env[i + step] as number)) valleys++
    }
    console.log(`  valles del batido en 6 s: ${valleys}`)
    expect(valleys).toBeGreaterThanOrEqual(2)
  })

  it('entra con suavidad (≥ 150 ms del 10 al 90 %) y decae despacio', () => {
    const x = render(single(0.2), 12)
    const start = Math.round(0.2 * FS)
    const win = Math.round(0.005 * FS)
    const levels: number[] = []
    for (let i = start; i < start + 0.6 * FS; i += win) levels.push(peak(x.slice(i, i + win)))
    const top = Math.max(...levels)
    const t10 = levels.findIndex((v) => v >= 0.1 * top)
    const t90 = levels.findIndex((v) => v >= 0.9 * top)
    const ms = (t90 - t10) * 5
    console.log(`  subida 10→90 %: ${ms} ms`)
    expect(ms).toBeGreaterThanOrEqual(150)
    expect(sec(x, 0.8, 1.3)).toBeGreaterThan(2 * sec(x, 8, 8.5)) // el sonido se apaga
  })

  it('ninguna subida a 100 ms supera el 35 % del máximo, con varias semillas', () => {
    const rises = [1, 2, 3, 4, 5, 6].map((seed) => maxRiseFraction(render(new BowlsGen(mulberry32(seed), FS), 45)))
    console.log(`  subida máxima a 100 ms por semilla: ${rises.map((r) => (r * 100).toFixed(0) + ' %').join(', ')}`)
    for (const r of rises) expect(r).toBeLessThan(0.35)
  })
})

describe('«Om» coral', () => {
  // jitter 0 → ciclos idénticos de 15 s: subida 0–1,8 · «o» hasta 6,8 · paso a «m» hasta 8,3 · «m» hasta 11,5 · bajada hasta 13,7 · respiración
  const make = (seed = 4) => new OmGen(mulberry32(seed), FS, undefined, { jitter: 0 })
  const x = render(make(), 16)

  it('es determinista, finito y dentro de ±1', () => {
    expect(render(make(), 2)).toEqual(x.slice(0, 2 * FS))
    expect(render(new OmGen(mulberry32(5), FS), 2)).not.toEqual(x.slice(0, 2 * FS))
    expect(x.every(Number.isFinite)).toBe(true)
    expect(peak(x)).toBeLessThanOrEqual(1)
  })

  it('tiene un nivel parecido al del ruido rosa (RMS 0,12–0,30)', () => {
    const gen = new OmGen(mulberry32(3), FS)
    const y = render(gen, 60)
    console.log(`  Om: pico = ${peak(y).toFixed(3)}`)
    const r = rms(y)
    console.log(`  Om: RMS = ${r.toFixed(3)}`)
    expect(r).toBeGreaterThan(0.1)
    expect(r).toBeLessThan(0.3)
  })

  it('sigue el ciclo: sube despacio, se sostiene y hay una respiración en silencio', () => {
    const o = sec(x, 3, 6)
    const m = sec(x, 9, 11)
    const gap = sec(x, 14.0, 14.6)
    const start = sec(x, 0, 0.25)
    console.log(`  RMS: inicio ${start.toFixed(3)} · «o» ${o.toFixed(3)} · «m» ${m.toFixed(3)} · respiración ${gap.toFixed(4)}`)
    expect(o).toBeGreaterThan(0.1)
    expect(m).toBeGreaterThan(0.08)
    expect(gap).toBeLessThan(0.02 * o)
    expect(m).toBeGreaterThan(0.4 * o) // la «m» suena, pero más suave que la «o»
    expect(m).toBeLessThan(1.0 * o)
    expect(start).toBeLessThan(0.2 * o)
  })

  it('no tiene subidas bruscas (la subida dura ~1,8 s), con varias semillas', () => {
    const rises = [1, 2, 3, 4].map((seed) => maxRiseFraction(render(new OmGen(mulberry32(seed), FS), 45)))
    console.log(`  subida máxima a 100 ms por semilla: ${rises.map((r) => (r * 100).toFixed(0) + ' %').join(', ')}`)
    for (const r of rises) expect(r).toBeLessThan(0.35)
  })

  it('es una voz grave con armónicos de ~110 Hz', () => {
    // energía en bandas de ±5 % alrededor de k·110 Hz (k = 1–4) frente a todo el rango 80–500 Hz
    const total = bandPower(x, 3.3, 80, 500)
    let harmonic = 0
    for (let k = 1; k <= 4; k++) harmonic += bandPower(x, 3.3, k * 110 * 0.95, k * 110 * 1.05)
    console.log(`  fracción de energía en los armónicos de 110 Hz: ${(100 * harmonic / total).toFixed(1)} %`)
    expect(harmonic / total).toBeGreaterThan(0.6)
    // y la fundamental es de verdad ~110 Hz (no 220): hay energía en 100–120 Hz y ninguna por debajo de 95 Hz
    expect(bandPower(x, 3.3, 100, 120) / total).toBeGreaterThan(0.01)
    expect(bandPower(x, 3.3, 60, 95) / total).toBeLessThan(0.001)
  })

  it('los formantes pasan de «o» a «m»: la «m» concentra la energía en los graves', () => {
    const lowFrac = (from: number) => bandPower(x, from, 0, 400) / bandPower(x, from, 0, 4000)
    const midFrac = (from: number) => bandPower(x, from, 650, 1200) / bandPower(x, from, 0, 4000)
    const o = { low: lowFrac(3.3), mid: midFrac(3.3) }
    const m = { low: lowFrac(9.3), mid: midFrac(9.3) }
    console.log(`  «o»: <400 Hz ${(o.low * 100).toFixed(0)} %, 650–1200 Hz ${(o.mid * 100).toFixed(0)} % · «m»: <400 Hz ${(m.low * 100).toFixed(0)} %, 650–1200 Hz ${(m.mid * 100).toFixed(0)} %`)
    expect(m.low).toBeGreaterThan(o.low)
    expect(o.mid).toBeGreaterThan(2 * m.mid)
  })
})

describe('integración en parámetros y textos', () => {
  it('se reconocen como fondos de meditación y generados, no como naturaleza', () => {
    for (const t of ['bowls', 'om'] as const) {
      expect(isMeditation(t)).toBe(true)
      expect(isGenerated(t)).toBe(true)
      expect(isNature(t)).toBe(false)
    }
    expect(isMeditation('rain')).toBe(false)
    expect(isGenerated('pink')).toBe(false)
  })
  it('etiquetas y descripción de presets', () => {
    expect(NOISE_LABELS.bowls).toBe('Cuencos tibetanos')
    expect(NOISE_LABELS.om).toBe('Om (voz sintética)')
    const p = (noiseType: 'bowls' | 'pink') => describePreset({ id: 'x', name: 'x', params: { noiseType }, suggestedMinutes: null })
    expect(p('bowls')).toContain('cuencos tibetanos')
    expect(p('bowls')).not.toContain('ruido')
    expect(p('pink')).toContain('ruido rosa')
  })
})
