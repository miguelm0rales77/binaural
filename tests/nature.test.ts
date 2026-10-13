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

/** Envolvente de |x| con un paso bajo de constante `tau` (s). */
function envelope(x: ArrayLike<number>, tau = 0.08): Float64Array {
  const a = 1 - Math.exp(-1 / (tau * FS))
  const e = new Float64Array(x.length)
  let y = 0
  for (let i = 0; i < x.length; i++) {
    y += a * (Math.abs(x[i] as number) - y)
    e[i] = y
  }
  return e
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
    expect(max / median).toBeLessThan(3.5)
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

describe('truenos suaves', () => {
  const t = new Thunder(mulberry32(21), FS, 25)
  const n = FS * 90
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = t.tick()
  const env = envelope(x)
  const envSlow = envelope(x, 0.15)
  let peak = 0
  for (const v of env) peak = Math.max(peak, v)

  it('hay silencio absoluto al principio (primer trueno pasados 8 s) y hay truenos', () => {
    let silent = true
    for (let i = 0; i < FS * 7.9; i++) if (x[i] !== 0) silent = false
    expect(silent).toBe(true)
    expect(peak).toBeGreaterThan(0.02)
  })

  it('ninguna subida a 100 ms supera el 35 % del pico (un clic subiría ~100 % de golpe)', () => {
    const step = FS / 10
    let peakSlow = 0
    for (const v of envSlow) peakSlow = Math.max(peakSlow, v)
    let maxJump = 0
    for (let i = step; i < envSlow.length; i++) maxJump = Math.max(maxJump, ((envSlow[i] as number) - (envSlow[i - step] as number)) / peakSlow)
    console.log(`  subida máxima a 100 ms: ${(maxJump * 100).toFixed(1)} % del pico`)
    expect(maxJump).toBeLessThan(0.35)
  })

  it('el ataque dura al menos 0,4 s del 10 % al 90 % del pico', () => {
    const iMax = env.indexOf(peak)
    let i10 = iMax
    while (i10 > 0 && (env[i10] as number) > 0.1 * peak) i10--
    let i90 = iMax
    while (i90 > i10 && (env[i90] as number) > 0.9 * peak) i90--
    const sec = (i90 - i10) / FS
    console.log(`  ataque 10→90 %: ${sec.toFixed(2)} s`)
    expect(sec).toBeGreaterThan(0.4)
  })

  it('los truenos están separados al menos 10 s', () => {
    // pasos por debajo del umbral de silencio: cada trueno termina con 0 exacto y vuelve a empezar tras ≥ 10 s
    let silent = 0
    let minGap = Infinity
    let seen = false
    for (let i = 0; i < n; i++) {
      if (x[i] === 0) silent++
      else {
        if (seen && silent > FS) minGap = Math.min(minGap, silent / FS)
        silent = 0
        seen = true
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(9.5)
  })
})

describe('integración en el motor y en los parámetros', () => {
  it('todos los fondos están registrados y se aceptan; uno desconocido se rechaza', () => {
    expect(NOISE_TYPES).toEqual(['none', 'white', 'pink', 'brown', 'rain', 'wind', 'storm', 'river', 'forest', 'bowls', 'om'])
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
