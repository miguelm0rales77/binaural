import { describe, expect, it } from 'vitest'
import { BilateralEngine, BILATERAL_DEFAULTS, lfoUnits, panGains, sanitizeBilateral } from '../src/dsp/bilateral'
import { mulberry32 } from '../src/dsp/noise'

const FS = 48000

/** Motor con una semilla fija; `start()` ya llamado. */
function engine(patch: Parameters<typeof sanitizeBilateral>[0] = {}) {
  const e = new BilateralEngine(FS, { ...BILATERAL_DEFAULTS, ...patch }, mulberry32(7))
  e.start()
  return e
}

/** Renderiza `sec` segundos en bloques de 128 muestras y devuelve los canales. */
function run(e: BilateralEngine, sec: number) {
  const n = Math.round(sec * FS)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const block = 128
  for (let i = 0; i < n; i += block) {
    const m = Math.min(block, n - i)
    e.renderBlock(L.subarray(i, i + m), R.subarray(i, i + m), m)
  }
  return { L, R }
}

const mean = (xs: Float32Array, from = 0, to = xs.length) => {
  let s = 0
  for (let i = from; i < to; i++) s += (xs[i] as number) ** 2
  return s / (to - from)
}

describe('ley de potencia constante', () => {
  it('L² + R² = 1 en todo el recorrido, también en el centro y en los extremos', () => {
    for (let p = -1; p <= 1.0001; p += 0.05) {
      const g = panGains(p)
      expect(g.l * g.l + g.r * g.r).toBeCloseTo(1, 12)
    }
  })

  it('en el centro cada canal vale 1/√2 (−3 dB) y los dos son iguales', () => {
    const g = panGains(0)
    expect(g.l).toBeCloseTo(Math.SQRT1_2, 12)
    expect(g.r).toBeCloseTo(Math.SQRT1_2, 12)
  })

  it('en los extremos el sonido va a un solo oído con ganancia 1', () => {
    const left = panGains(-1)
    const right = panGains(1)
    expect(left.l).toBeCloseTo(1, 12)
    expect(left.r).toBeCloseTo(0, 12)
    expect(right.l).toBeCloseTo(0, 12)
    expect(right.r).toBeCloseTo(1, 12)
  })

  it('el canal izquierdo baja de forma monótona de izquierda a derecha, y las posiciones fuera de rango se recortan', () => {
    let prev = Infinity
    for (let p = -1; p <= 1.0001; p += 0.1) {
      const l = panGains(p).l
      expect(l).toBeLessThanOrEqual(prev + 1e-12)
      prev = l
    }
    expect(panGains(5)).toEqual(panGains(1))
    expect(panGains(-5)).toEqual(panGains(-1))
  })
})

describe('motor: paneo continuo', () => {
  it('la potencia total se mantiene constante a lo largo del paneo (sin fundidos)', () => {
    const e = engine({ mode: 'continuous', lfoHz: 0.5, toneGain: 0.25, bgBinaural: false, bed: 'pink', bedGain: 0 })
    const { L, R } = run(e, 4)
    const block = 4800 // 100 ms ≈ 22 periodos del tono
    const expected = 0.25 * 0.25 / 2
    for (let from = 2 * FS; from + block <= 4 * FS; from += block) {
      const sum = mean(L, from, from + block) + mean(R, from, from + block)
      expect(sum / expected).toBeGreaterThan(0.97)
      expect(sum / expected).toBeLessThan(1.03)
    }
  })

  it('con el paneo al centro (p = 0) los dos canales tienen la misma potencia', () => {
    // Ley en el centro: cada canal vale 1/√2, así que la potencia es idéntica (la prueba del motor se hace con panGains).
    expect(panGains(0).l ** 2).toBeCloseTo(panGains(0).r ** 2, 12)
  })
})

describe('motor: pulsos alternos', () => {
  it('cada pulso va a un lado distinto, alternando izquierda y derecha', () => {
    const e = engine({ mode: 'pulses', lfoHz: 0.5, bed: 'pink', bedGain: 0 })
    const sides: number[] = []
    e.onSide = (s) => sides.push(s)
    run(e, 4)
    expect(sides.length).toBeGreaterThanOrEqual(4)
    expect(sides.length).toBeLessThanOrEqual(5)
    expect(sides[0]).toBe(-1)
    for (let i = 1; i < sides.length; i++) expect(sides[i]).toBe(-(sides[i - 1] as number))
  })

  it('ocupa la mitad de cada periodo: hay silencio entre pulsos', () => {
    const e = engine({ mode: 'pulses', lfoHz: 0.5, bed: 'pink', bedGain: 0, toneGain: 0.25 })
    const { L, R } = run(e, 4)
    let active = 0
    const from = 2 * FS
    const to = 4 * FS
    for (let i = from; i < to; i++) if (Math.abs(L[i] as number) + Math.abs(R[i] as number) > 1e-6) active++
    const fraction = active / (to - from)
    expect(fraction).toBeGreaterThan(0.45)
    expect(fraction).toBeLessThan(0.55)
  })
})

describe('motor: calma y corte rápido', () => {
  it('a los 30 s de «Calma» el paneo está casi quieto (profundidad ≤ 0,2) y la velocidad ≤ 0,3', () => {
    const e = engine({ mode: 'continuous' })
    e.setAlternation(true)
    const samples: number[] = []
    for (let s = 0; s < 30; s++) {
      run(e, 1)
      samples.push(e.getState().depth)
    }
    expect(samples[29]).toBeLessThanOrEqual(0.2)
    expect(samples[29]).toBeGreaterThanOrEqual(0.15)
    expect(e.getState().speedMul).toBeLessThanOrEqual(0.3)
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual((samples[i - 1] as number) + 1e-9)
  })

  it('el corte rápido llega a «Calma» en menos de 2 s', () => {
    const e = engine({ mode: 'continuous' })
    e.setAlternation(true, true)
    run(e, 2)
    expect(e.getState().depth).toBeLessThan(0.16)
  })

  it('al volver de «Calma» el paneo recupera su amplitud (≥ 99 % en 15 s)', () => {
    const e = engine({ mode: 'continuous' })
    e.setAlternation(true, true)
    run(e, 2)
    e.setAlternation(false)
    run(e, 15)
    expect(e.getState().depth).toBeGreaterThan(0.99)
    expect(e.getState().speedMul).toBeGreaterThan(0.99)
  })
})

describe('motor: calibración', () => {
  it('con «left» solo suena el oído izquierdo, y con «right» solo el derecho', () => {
    const left = engine({ mode: 'continuous', test: 'left' })
    const a = run(left, 1)
    expect(mean(a.L)).toBeGreaterThan(0.001)
    expect(mean(a.R)).toBe(0)

    const right = engine({ mode: 'continuous', test: 'right' })
    const b = run(right, 1)
    expect(mean(b.R)).toBeGreaterThan(0.001)
    expect(mean(b.L)).toBe(0)
  })
})

describe('motor: fondo binaural y cama', () => {
  it('el fondo binaural pone 200 Hz en el izquierdo y 206 Hz en el derecho, sin paneo', () => {
    const e = engine({ mode: 'none', bgBinaural: true, bgCarrierHz: 200, bgBeatHz: 6, bed: 'pink', bedGain: 0, bgGain: 0.15 })
    const { L, R } = run(e, 3)
    const crossings = (x: Float32Array, from: number, to: number) => {
      let c = 0
      for (let i = from + 1; i < to; i++) if ((x[i - 1] as number) <= 0 && (x[i] as number) > 0) c++
      return c
    }
    const cl = crossings(L, 2 * FS, 3 * FS)
    const cr = crossings(R, 2 * FS, 3 * FS)
    expect(cl).toBeGreaterThanOrEqual(199)
    expect(cl).toBeLessThanOrEqual(201)
    expect(cr).toBeGreaterThanOrEqual(205)
    expect(cr).toBeLessThanOrEqual(207)
  })

  it('el fondo no cambia con el paneo: su potencia es la misma en los dos canales', () => {
    const e = engine({ mode: 'none', bgBinaural: true, bed: 'pink', bedGain: 0 })
    const { L, R } = run(e, 3)
    const ratio = mean(L, 2 * FS, 3 * FS) / mean(R, 2 * FS, 3 * FS)
    expect(ratio).toBeGreaterThan(0.9)
    expect(ratio).toBeLessThan(1.1)
  })

  it('en los modos de paneo la cama suena solo en «Calma»', () => {
    const e = engine({ mode: 'continuous', toneGain: 0, bed: 'rain', bedGain: 0.25 })
    const quiet = run(e, 1)
    expect(mean(quiet.L)).toBe(0)
    e.setAlternation(true)
    run(e, 8)
    const calm = run(e, 1)
    expect(mean(calm.L)).toBeGreaterThan(1e-4)
    expect(mean(calm.R)).toBeGreaterThan(1e-4)
    expect(e.getState().bedLevel).toBeGreaterThan(0.9)
  })

  it('en el modo sin paneo (c) la cama suena durante la meditación, sin pasar por «Calma»', () => {
    const e = engine({ mode: 'none', bed: 'rain', bedGain: 0.25 })
    e.setAlternation(false)
    const med = run(e, 10)
    expect(mean(med.L, 8 * FS, 10 * FS)).toBeGreaterThan(1e-4)
    expect(mean(med.R, 8 * FS, 10 * FS)).toBeGreaterThan(1e-4)
    expect(e.getState().bedLevel).toBeGreaterThan(0.9)
  })

  it('con la configuración por defecto, el modo sin paneo no queda en silencio durante la meditación', () => {
    const e = engine({ ...BILATERAL_DEFAULTS, mode: 'none', test: null })
    e.setAlternation(false)
    const { L, R } = run(e, 6)
    expect(mean(L, 4 * FS, 6 * FS)).toBeGreaterThan(1e-4)
    expect(mean(R, 4 * FS, 6 * FS)).toBeGreaterThan(1e-4)
  })
})

describe('motor: inicio, fundido y parada', () => {
  it('antes de empezar está en silencio', () => {
    const e = new BilateralEngine(FS, BILATERAL_DEFAULTS, mulberry32(3))
    const { L } = run(e, 0.5)
    expect(mean(L)).toBe(0)
  })

  it('el fundido de salida dura 2,5 s, avisa una sola vez y después deja silencio', () => {
    const e = engine({ mode: 'continuous', bed: 'pink', bedGain: 0 })
    let stopped = 0
    e.onStopped = () => stopped++
    run(e, 3)
    e.stop()
    run(e, 2)
    expect(stopped).toBe(0)
    run(e, 0.7)
    expect(stopped).toBe(1)
    const tail = run(e, 1)
    expect(mean(tail.L)).toBe(0)
    expect(mean(tail.R)).toBe(0)
    run(e, 1)
    expect(stopped).toBe(1)
  })
})

describe('parámetros', () => {
  it('ajusta velocidades, modos y tonos fuera de rango', () => {
    const p = sanitizeBilateral({ lfoHz: 99, mode: 'inventado' as never, toneHz: -4, bed: 'x' as never, test: 'center' as never })
    expect(p.lfoHz).toBe(2)
    expect(p.mode).toBe(BILATERAL_DEFAULTS.mode)
    expect(p.toneHz).toBe(110)
    expect(p.bed).toBe(BILATERAL_DEFAULTS.bed)
    expect(p.test).toBeNull()
  })

  it('lfoUnits: 0,5 Hz son 30 ciclos por minuto y 60 barridos por minuto', () => {
    const u = lfoUnits(0.5)
    expect(u.bpm).toBeCloseTo(30, 10)
    expect(u.sweepsPerMin).toBeCloseTo(60, 10)
  })
})
