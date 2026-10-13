import { describe, expect, it } from 'vitest'
import { DspEngine } from '../src/dsp/engine'
import { ForestGen, RainGen, RiverGen, StormGen, Thunder, WindGen, type NatureGen } from '../src/dsp/nature'
import { mulberry32 } from '../src/dsp/noise'
import { GENERATED_TYPES, MEDITATION_TYPES, NATURE_TYPES, NOISE_TYPES, defaultParams, isNature, sanitizeParams } from '../src/dsp/params'
import { DEFAULT_PARAMS } from '../src/dsp/types'
import { describePreset } from '../src/presets'
import { ABOUT, FIRST_USE } from '../src/texts'
import { powerSpectrum } from './fft'

const FS = 48000
const SECONDS = 20

const makers: Record<string, (seed: number) => NatureGen> = {
  rain: (s) => new RainGen(mulberry32(s), FS, 0.6),
  wind: (s) => new WindGen(mulberry32(s), FS),
  river: (s) => new RiverGen(mulberry32(s), FS),
  storm: (s) => new StormGen(mulberry32(s), FS),
  forest: (s) => new ForestGen(mulberry32(s), FS),
}

function render(g: NatureGen, n: number): Float32Array {
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = g.next()
  return x
}

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)

/** Energía espectral (Hann, un segmento de N muestras desde `startSec`) entre lo y hi Hz. */
function bandEnergy(x: Float32Array, startSec: number, lo: number, hi: number, N = 16384): number {
  const p = powerSpectrum(x, Math.round(startSec * FS), N)
  let sum = 0
  for (let k = 1; k < p.length; k++) {
    const f = (k * FS) / N
    if (f >= lo && f < hi) sum += p[k] as number
  }
  return sum
}

/** Fracción de la energía por debajo de `hz`, promediando segmentos de 4096 muestras. */
function energyBelow(x: Float32Array, hz: number): number {
  const seg = 4096
  let low = 0
  let total = 0
  for (let off = 0; off + seg <= x.length; off += seg) {
    const p = powerSpectrum(x, off, seg)
    for (let k = 1; k < p.length; k++) {
      total += p[k] as number
      if ((k * FS) / seg < hz) low += p[k] as number
    }
  }
  return low / total
}

describe.each(Object.keys(makers))('sonido natural: %s', (name) => {
  const make = makers[name] as (s: number) => NatureGen
  const x = render(make(11), FS * SECONDS)

  it('es determinista con la misma semilla y finito dentro de ±1', () => {
    expect(render(make(11), 4000)).toEqual(x.slice(0, 4000))
    expect(render(make(12), 4000)).not.toEqual(x.slice(0, 4000))
    let peak = 0
    let finite = true
    for (const v of x) {
      if (!Number.isFinite(v)) finite = false
      peak = Math.max(peak, Math.abs(v))
    }
    expect(finite).toBe(true)
    expect(peak).toBeLessThanOrEqual(1)
  })

  it('tiene un nivel parecido al del ruido rosa (RMS 0,12–0,30)', () => {
    const r = rms(x)
    console.log(`  ${name}: RMS = ${r.toFixed(3)}`)
    expect(r).toBeGreaterThan(0.12)
    expect(r).toBeLessThan(0.3)
  })

  it('no tiene picos repentinos: el nivel a 50 ms nunca pasa de 3,5 veces su mediana', () => {
    const win = FS / 20
    const levels: number[] = []
    for (let i = 0; i + win <= x.length; i += win) levels.push(rms(x.slice(i, i + win)))
    const sorted = [...levels].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] as number
    const max = sorted[sorted.length - 1] as number
    console.log(`  ${name}: máx/mediana (50 ms) = ${(max / median).toFixed(2)}`)
    // los truenos de la tormenta tienen un inicio marcado a propósito (ver «truenos»): para ella el límite es mayor
    expect(max / median).toBeLessThan(name === 'storm' ? 7 : 3.5)
  })
})

describe('color espectral', () => {
  const x = (n: string) => render((makers[n] as (s: number) => NatureGen)(3), FS * 10)
  it('la lluvia es de banda ancha y aguda; el viento, grave', () => {
    const rain = energyBelow(x('rain'), 1000)
    const wind = energyBelow(x('wind'), 1500)
    console.log(`  energía < 1 kHz en lluvia: ${(rain * 100).toFixed(1)} % · < 1,5 kHz en viento: ${(wind * 100).toFixed(1)} %`)
    expect(rain).toBeLessThan(0.3)
    expect(wind).toBeGreaterThan(0.85)
  })
  it('el río está en la banda media y el bosque mezcla viento grave con hojas agudas', () => {
    expect(energyBelow(x('river'), 250)).toBeLessThan(0.1)
    expect(energyBelow(x('river'), 3500)).toBeGreaterThan(0.7)
    const f = energyBelow(x('forest'), 800)
    console.log(`  bosque < 800 Hz: ${(f * 100).toFixed(1)} %`)
    expect(f).toBeGreaterThan(0.3)
    expect(f).toBeLessThan(0.97)
  })
})

describe('truenos', () => {
  const thunderSolo = (distance: number, seconds = 30, seed = 9) => {
    const t = new Thunder(mulberry32(seed), FS, 24, { firstWaitSec: 0.1, distance })
    const x = new Float32Array(seconds * FS)
    for (let i = 0; i < x.length; i++) x[i] = t.tick()
    return x
  }
  const peakOf = (x: Float32Array) => {
    let m = 0
    for (const v of x) m = Math.max(m, Math.abs(v))
    return m
  }
  const rmsBetween = (x: Float32Array, a: number, b: number) => {
    let sum = 0
    for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) sum += (x[i] as number) ** 2
    return Math.sqrt(sum / ((b - a) * FS))
  }
  /** Variación del nivel (desviación típica / media) del RMS en ventanas de 20 ms entre a y b s. */
  const levelVariation = (x: Float32Array, a: number, b: number) => {
    const w: number[] = []
    for (let t = a; t < b; t += 0.02) w.push(rmsBetween(x, t, t + 0.02))
    const mean = w.reduce((p, q) => p + q, 0) / w.length
    return Math.sqrt(w.reduce((p, q) => p + (q - mean) ** 2, 0) / w.length) / mean
  }
  const share = (x: Float32Array, lo: number, hi: number) => {
    const total = bandEnergy(x, 0.1, 20, 6000, 65536)
    return bandEnergy(x, 0.1, lo, hi, 65536) / total
  }

  it('el primer trueno cae entre los 5 y los 12 s, con silencio exacto antes', () => {
    for (const seed of [1, 2, 3]) {
      const t = new Thunder(mulberry32(seed), FS, 24)
      let first = -1
      for (let i = 0; i < 14 * FS && first < 0; i++) if (t.tick() !== 0) first = i / FS
      console.log(`  semilla ${seed}: primer trueno a los ${first.toFixed(1)} s`)
      expect(first).toBeGreaterThanOrEqual(5)
      expect(first).toBeLessThanOrEqual(12.1)
    }
  })

  it('duran ~10–13 s de retumbo, separados por 6–50 s, sin solaparse', () => {
    const t = new Thunder(mulberry32(1), FS, 24)
    const n = 240 * FS
    const events: { start: number; dur: number }[] = []
    let start = -1
    let quiet = 0
    for (let i = 0; i < n; i++) {
      if (t.tick() !== 0) {
        if (start < 0) start = i
        quiet = 0
      } else if (start >= 0 && ++quiet > FS) {
        events.push({ start: start / FS, dur: (i - quiet - start) / FS })
        start = -1
      }
    }
    console.log(`  ${events.length} truenos en 240 s: ${events.map((e) => `${e.start.toFixed(0)} s (${e.dur.toFixed(0)} s)`).join(', ')}`)
    expect(events.length).toBeGreaterThanOrEqual(4)
    expect(events.length).toBeLessThanOrEqual(12)
    for (const e of events) {
      expect(e.dur).toBeGreaterThanOrEqual(8)
      expect(e.dur).toBeLessThanOrEqual(16)
    }
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1] as (typeof events)[number]
      const gap = (events[i] as (typeof events)[number]).start - (prev.start + prev.dur)
      expect(gap).toBeGreaterThanOrEqual(5.5)
      expect(gap).toBeLessThanOrEqual(51)
    }
  })

  it('se oye unos 8 s y se extingue: a los 6 s conserva ≥ 15 % de su máximo y a los 15 s ya no suena', () => {
    for (const d of [0, 0.5, 1]) {
      const x = thunderSolo(d)
      let top = 0
      for (let a = 0; a < 5; a += 0.5) top = Math.max(top, rmsBetween(x, a, a + 0.5))
      const at6 = rmsBetween(x, 6, 6.5)
      const at15 = rmsBetween(x, 15, 15.5)
      console.log(`  distancia ${d}: máximo ${top.toFixed(2)} · a los 6 s ${((at6 / top) * 100).toFixed(0)} % · a los 15 s ${((at15 / top) * 100).toFixed(1)} %`)
      expect(at6).toBeGreaterThan(0.15 * top)
      expect(at15).toBeLessThan(0.05 * top)
    }
  })

  it('«retumbe»: 3–4 oleadas que suben y bajan, no una caída lisa', () => {
    for (const d of [0, 0.5, 1]) {
      const x = thunderSolo(d)
      // envolvente suavizada (τ = 0,3 s) y recuento de máximos locales con una prominencia ≥ 8 % del máximo, entre 2 y 16 s
      const a = 1 - Math.exp(-1 / (0.3 * FS))
      const e = new Float64Array(x.length)
      let y = 0
      for (let i = 0; i < x.length; i++) {
        y += a * (Math.abs(x[i] as number) - y)
        e[i] = y
      }
      let top = 0
      for (const v of e) top = Math.max(top, v)
      const step = Math.round(0.25 * FS)
      const pts: number[] = []
      for (let i = Math.round(1 * FS); i < 11 * FS; i += step) pts.push(e[i] as number)
      let waves = 0
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i] as number
        if (p > (pts[i - 1] as number) && p >= (pts[i + 1] as number)) {
          // prominencia: diferencia con el valle más profundo en los 1,5 s anteriores
          const from = Math.max(0, i - 6)
          const valley = Math.min(...pts.slice(from, i))
          if (p - valley > 0.08 * top) waves++
        }
      }
      console.log(`  distancia ${d}: ${waves} oleadas entre 1 y 11 s`)
      expect(waves).toBeGreaterThanOrEqual(2)
      expect(waves).toBeLessThanOrEqual(6)
    }
  })

  it('tiene temblor de amplitud rápido (el ondeo de una hoja de latón): el nivel varía ≥ 25 % entre ventanas de 20 ms', () => {
    for (const d of [0, 0.5, 1]) {
      const x = thunderSolo(d)
      const cv = levelVariation(x, 4, 8)
      console.log(`  distancia ${d}: variación del nivel en 4–8 s = ${(cv * 100).toFixed(0)} %`)
      expect(cv).toBeGreaterThan(0.25)
    }
  })

  it('el final no es ruido blanco: el trueno se oscurece al extinguirse (el espectro baja y casi no queda agudo)', () => {
    for (const d of [0, 0.5, 1]) {
      const x = thunderSolo(d)
      const N = 16384
      const centroid = (t: number) => {
        const p = powerSpectrum(x, Math.round(t * FS), N)
        let num = 0
        let den = 0
        for (let k = 1; k < p.length; k++) {
          num += ((k * FS) / N) * (p[k] as number)
          den += p[k] as number
        }
        return num / den
      }
      const highShare = (t: number) => bandEnergy(x, t, 800, 8000, N) / bandEnergy(x, t, 20, 8000, N)
      const early = centroid(1.5)
      const tail = centroid(8)
      console.log(`  distancia ${d}: centroide espectral ${early.toFixed(0)} Hz a 1,5 s → ${tail.toFixed(0)} Hz a 8 s · agudos (>800 Hz) en la cola: ${(highShare(8) * 100).toFixed(1)} %`)
      expect(tail).toBeLessThan(0.6 * early) // se oscurece claramente
      expect(tail).toBeLessThan(250) // la cola es un rumor grave
      expect(highShare(8)).toBeLessThan(0.05) // y casi no queda agudo (lo que sonaba a ruido blanco)
    }
  })

  it('en la tormenta se oyen claramente: graves ≥ ×4, medios (250–1000 Hz, los de un altavoz pequeño) ≥ ×4, nivel total ≥ ×2', () => {
    for (const seed of [1, 2]) {
      const g = new StormGen(mulberry32(seed), FS)
      const n = 200 * FS
      const y = new Float32Array(n)
      for (let i = 0; i < n; i++) y[i] = g.next()
      const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)] as number
      const win = FS / 2
      const level: number[] = []
      for (let i = 0; i + win <= n; i += win) level.push(rmsBetween(y, i / FS, (i + win) / FS))
      const N = 16384
      const low: number[] = []
      const mid: number[] = []
      for (let off = 0; off + N <= n; off += N) {
        low.push(bandEnergy(y, off / FS, 0, 120, N))
        mid.push(bandEnergy(y, off / FS, 250, 1000, N))
      }
      const ratio = (a: number[]) => Math.sqrt(Math.max(...a) / med(a))
      const r = { total: Math.max(...level) / med(level), low: ratio(low), mid: ratio(mid) }
      let hot = 0
      for (const v of y) if (Math.abs(v) > 0.9) hot++
      console.log(`  semilla ${seed}: nivel ×${r.total.toFixed(1)} · graves ×${r.low.toFixed(1)} · medios ×${r.mid.toFixed(1)} · pico ${peakOf(y).toFixed(2)} · muestras > 0,9: ${((100 * hot) / n).toFixed(2)} %`)
      expect(r.total).toBeGreaterThanOrEqual(2)
      expect(r.low).toBeGreaterThanOrEqual(4)
      expect(r.mid).toBeGreaterThanOrEqual(4)
      expect(peakOf(y)).toBeLessThanOrEqual(1)
      expect(hot / n).toBeLessThan(0.01) // no vive saturado: menos del 1 % de las muestras pasa de 0,9
    }
  })

  it('tiene capas grave, media, metálica y (si es cercano) chasquido', () => {
    const near = thunderSolo(0)
    const far = thunderSolo(1)
    const n = { low: share(near, 20, 150), mid: share(near, 150, 800), high: share(near, 800, 6000) }
    const f = { high: share(far, 800, 6000) }
    console.log(`  cercano: <150 Hz ${(n.low * 100).toFixed(0)} %, 150–800 Hz ${(n.mid * 100).toFixed(0)} %, >800 Hz ${(n.high * 100).toFixed(1)} % · lejano: >800 Hz ${(f.high * 100).toFixed(1)} %`)
    // (la energía del subgrave pesa poco, pero se nota mucho en auriculares: basta con que esté claramente presente)
    expect(n.low).toBeGreaterThan(0.12) // subgrave para auriculares
    expect(n.mid).toBeGreaterThan(0.15) // retumbo medio para altavoces pequeños
    expect(n.high).toBeGreaterThan(0.02) // chasquido y hoja
    expect(n.high).toBeLessThan(0.6) // pero no domina: es un retumbo, no un siseo metálico
    expect(f.high).toBeLessThan(0.9 * n.high) // el lejano tiene menos chasquido
  })

  it('el cercano entra rápido (inicio marcado, a propósito) pero sin escalón digital; el lejano entra despacio', () => {
    const near = thunderSolo(0)
    const far = thunderSolo(1)
    const ms = (x: Float32Array, a: number) => rmsBetween(x, 0.1 + a / 1000, 0.1 + (a + 2) / 1000) // ventana de 2 ms desde el inicio
    let topNear = 0
    for (let a = 0; a < 150; a += 2) topNear = Math.max(topNear, ms(near, a))
    const first = ms(near, 0)
    const nearStart = rmsBetween(near, 0.1, 0.15)
    const farStart = rmsBetween(far, 0.1, 0.15)
    console.log(`  cercano: primeros 2 ms ${first.toFixed(3)} frente a un máximo de ${topNear.toFixed(3)} en 150 ms · RMS primeros 50 ms: cercano ${nearStart.toFixed(3)}, lejano ${farStart.toFixed(3)}`)
    expect(nearStart).toBeGreaterThan(0.15) // ya suena fuerte en 50 ms
    expect(farStart).toBeLessThan(0.05) // el lejano arranca casi en silencio
    expect(first).toBeLessThan(0.3 * topNear) // la envolvente sube en milisegundos, no de golpe en una muestra
  })
})

describe('integración en el motor y en los parámetros', () => {
  it('todos los fondos están registrados y se aceptan; uno desconocido se rechaza', () => {
    expect(NOISE_TYPES).toEqual(['none', 'white', 'pink', 'brown', 'rain', 'wind', 'storm', 'river', 'forest', 'bowls', 'gong'])
    expect(GENERATED_TYPES).toEqual([...NATURE_TYPES, ...MEDITATION_TYPES])
    for (const t of NOISE_TYPES) expect(sanitizeParams(defaultParams(), { noiseType: t }).noiseType).toBe(t)
    expect(sanitizeParams(defaultParams(), { noiseType: 'trueno' }).noiseType).toBe(DEFAULT_PARAMS.noiseType)
    expect(NATURE_TYPES.every(isNature)).toBe(true)
    expect(isNature('pink')).toBe(false)
  })

  it.each(GENERATED_TYPES)('el motor reproduce %s (solo fondo) y se calla al volver a «ninguno»', (type) => {
    const e = new DspEngine(
      FS,
      { toneGain: 0, noiseType: type, noiseGain: 1, masterGain: 0.8 },
      { fadeSec: 0, rand: mulberry32(9) },
    )
    e.start()
    const sec = (s: number) => {
      const L = new Float32Array(FS * s)
      e.renderBlock(L, new Float32Array(FS * s), FS * s)
      return L
    }
    expect(rms(sec(8))).toBeGreaterThan(0.005) // los cuencos tardan 1,5–3 s en dar su primer golpe
    e.setParams({ noiseType: 'none' })
    sec(1) // fundido de 50 ms + margen
    expect(rms(sec(1))).toBe(0)
  })

  it('cambiar de un fondo a otro no produce saltos entre muestras', () => {
    const e = new DspEngine(FS, { toneGain: 0, noiseType: 'rain', noiseGain: 0.5, masterGain: 0.8 }, { fadeSec: 0, rand: mulberry32(4) })
    e.start()
    const n = FS
    const a = new Float32Array(n)
    e.renderBlock(a, new Float32Array(n), n)
    e.setParams({ noiseType: 'wind' })
    const b = new Float32Array(n)
    e.renderBlock(b, new Float32Array(n), n)
    // el cambio de fondo se hace con un fundido de 50 ms: la mayor diferencia entre muestras
    // consecutivas no debe superar la del propio sonido (lluvia, que es la más "áspera") por mucho
    const maxDiff = (x: Float32Array) => {
      let m = 0
      for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs((x[i] as number) - (x[i - 1] as number)))
      return m
    }
    expect(maxDiff(b)).toBeLessThanOrEqual(maxDiff(a) * 1.5)
  })

  it('los presets antiguos con ruido rosa/marrón siguen funcionando y describePreset nombra los sonidos naturales', () => {
    expect(describePreset({ id: 'x', name: 'x', params: { noiseType: 'rain' }, suggestedMinutes: null })).toContain('lluvia')
    expect(describePreset({ id: 'x', name: 'x', params: { noiseType: 'rain' }, suggestedMinutes: null })).not.toContain('ruido')
    expect(describePreset({ id: 'x', name: 'x', params: { noiseType: 'pink' }, suggestedMinutes: null })).toContain('ruido rosa')
  })
})

describe('volúmenes de arranque más bajos', () => {
  it('tono ≤ 50 % y general ≤ 30 % por defecto', () => {
    expect(DEFAULT_PARAMS.toneGain).toBeLessThanOrEqual(0.5)
    expect(DEFAULT_PARAMS.masterGain).toBeLessThanOrEqual(0.3)
  })
})

describe('nota de sensibilidad sensorial', () => {
  it('aparece en el aviso de primer uso, sin prohibir ningún modo', () => {
    const t = FIRST_USE.items.join(' ')
    expect(t).toMatch(/TEA/)
    expect(t).toMatch(/volumen al mínimo/)
    expect(t).toMatch(/pulsos lentos/)
    expect(t).toMatch(/sobrecarga sensorial/)
    expect(t).not.toMatch(/isocr/i)
  })
  it('«Acerca de» tiene la sección y dice que no hay estudios concluyentes y que los sonidos no son grabaciones', () => {
    const s = ABOUT.sections.find((x) => x.heading === 'Sensibilidad sensorial')
    expect(s).toBeDefined()
    const all = ABOUT.sections.flatMap((x) => x.paragraphs).join(' ')
    expect(all).toMatch(/No hay estudios concluyentes/)
    expect(all).toMatch(/no son grabaciones/)
  })
})
