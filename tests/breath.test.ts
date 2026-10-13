import { describe, expect, it } from 'vitest'
import { breathState, breathStateInto, cyclesAt, RESONANCE_PATTERN, type BreathPattern, type BreathState } from '../src/dsp/breath'
import { DspEngine } from '../src/dsp/engine'
import { defaultParams, sanitizeParams } from '../src/dsp/params'
import { seeded } from './helpers'
import type { BreathConfig, BreathCues, EngineParams } from '../src/dsp/types'

const FS = 48000

const pat = (o: Partial<BreathPattern> = {}): BreathPattern => ({ ...RESONANCE_PATTERN, ...o })

function breath(o: { enabled?: boolean; maxSec?: number | null; pattern?: Partial<BreathPattern>; cues?: Partial<BreathCues> } = {}): BreathConfig {
  return {
    enabled: o.enabled ?? true,
    maxSec: o.maxSec ?? null,
    pattern: pat(o.pattern),
    cues: { swell: false, guideTone: false, chime: false, ...o.cues },
  }
}

function params(b: BreathConfig, over: Partial<EngineParams> = {}): Partial<EngineParams> {
  return {
    mode: 'binaural',
    carrierHz: 400,
    beatHz: 10,
    isoDepth: 0.8,
    toneGain: 1,
    noiseType: 'none',
    noiseGain: 1,
    loudnessComp: false,
    masterGain: 1,
    breath: b,
    ...over,
  }
}

/** Motor sin fundidos y sin tanh: permite restar dos renders y aislar una señal. */
function engine(p: Partial<EngineParams>, seed = 7): DspEngine {
  const e = new DspEngine(FS, p, { fadeSec: 0, rand: seeded(seed), masterCeiling: 1, softClip: false })
  e.start()
  return e
}

function renderSeconds(e: DspEngine, sec: number): { L: Float32Array; R: Float32Array } {
  const n = Math.round(sec * FS)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  e.renderBlock(L, R, n)
  return { L, R }
}

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0
  for (let i = from; i < to; i++) s += (x[i] as number) ** 2
  return Math.sqrt(s / Math.max(1, to - from))
}

/** Instantes (s) en los que cambia la fase, con resolución de `dt`. */
function transitions(p: BreathPattern, tEnd: number, dt: number) {
  const out: { t: number; phase: string }[] = []
  let prev = ''
  const st: BreathState = { phase: 'in', phaseProgress: 0, lung: 0, cycleIndex: 0 }
  for (let t = 0; t <= tEnd; t += dt) {
    breathStateInto(st, t, p)
    if (st.phase !== prev) out.push({ t, phase: st.phase })
    prev = st.phase
  }
  return out
}

describe('reloj respiratorio (funciones puras)', () => {
  it('6 rpm con inspiración 0.4: inspira 4,0 s y espira 6,0 s (±1 ms)', () => {
    const tr = transitions(pat({ rpm: 6, inhaleRatio: 0.4 }), 20, 0.0002)
    const out = tr.find((x) => x.phase === 'out' && x.t > 1)
    expect(out?.t ?? NaN).toBeGreaterThan(4 - 0.001)
    expect(out?.t ?? NaN).toBeLessThan(4 + 0.001)
    const nextIn = tr.find((x) => x.phase === 'in' && x.t > 4.5)
    expect(nextIn?.t ?? NaN).toBeGreaterThan(10 - 0.001)
    expect(nextIn?.t ?? NaN).toBeLessThan(10 + 0.001)
  })

  it('el pulmón es continuo: ningún salto entre muestras a 48 kHz supera 1e-3', () => {
    const patterns = [
      pat(),
      pat({ rpm: 12, inhaleRatio: 0.2, holdInSec: 1, holdOutSec: 1 }),
      pat({ rampFromRpm: 8, rampSec: 120 }),
    ]
    for (const p of patterns) {
      const st: BreathState = { phase: 'in', phaseProgress: 0, lung: 0, cycleIndex: 0 }
      let prev = 0
      let maxJump = 0
      for (let n = 0; n < 60 * FS; n++) {
        breathStateInto(st, n / FS, p)
        if (n > 0) maxJump = Math.max(maxJump, Math.abs(st.lung - prev))
        prev = st.lung
      }
      expect(maxJump).toBeLessThan(1e-3)
    }
  })

  it('con rampa de 8 a 6 rpm en 120 s: el primer ciclo dura ~7,5 s, cada ciclo es más largo que el anterior (el ritmo baja) y, tras 120 s, cada ciclo dura 10 s', () => {
    const p = pat({ rpm: 6, rampFromRpm: 8, rampSec: 120 })
    const dt = 0.0005
    const bounds: number[] = []
    let last = -1
    for (let t = 0; t <= 200; t += dt) {
      const k = Math.floor(cyclesAt(t, p))
      if (k !== last) {
        bounds.push(t)
        last = k
      }
    }
    const durations = bounds.slice(1).map((b, i) => b - (bounds[i] as number))
    expect(bounds[1]).toBeGreaterThan(7.4)
    expect(bounds[1]).toBeLessThan(7.7)
    const inRamp = durations.slice(0, 14)
    for (let i = 1; i < inRamp.length; i++) expect(inRamp[i]).toBeGreaterThan(inRamp[i - 1] as number)
    const late = durations.filter((_, i) => (bounds[i + 1] as number) > 121)
    for (const d of late) expect(Math.abs(d - 10)).toBeLessThan(0.002)
  })

  it('las retenciones mantienen el pulmón constante (lleno en holdIn, vacío en holdOut)', () => {
    const p = pat({ rpm: 6, inhaleRatio: 0.4, holdInSec: 2, holdOutSec: 2 })
    // Ciclo de 10 s: inspira 2,4 · retiene 2 · espira 3,6 · retiene 2
    expect(breathState(1, p).phase).toBe('in')
    expect(breathState(3, p).phase).toBe('holdIn')
    expect(breathState(3, p).lung).toBe(1)
    expect(breathState(5, p).phase).toBe('out')
    expect(breathState(9, p).phase).toBe('holdOut')
    expect(breathState(9, p).lung).toBe(0)
    expect(breathState(3.5, p).lung).toBe(1)
  })
})

describe('metrónomo en el motor', () => {
  it('la campanilla suena dentro de ±1 muestra del cambio de fase', () => {
    const on = engine(params(breath({ cues: { chime: true } })))
    const off = engine(params(breath({ cues: { chime: false } })))
    const a = renderSeconds(on, 6)
    const b = renderSeconds(off, 6)
    const diffAt = (from: number) => {
      for (let i = from; i < a.L.length; i++) if (Math.abs((a.L[i] as number) - (b.L[i] as number)) > 1e-9) return i
      return -1
    }
    // Inicio de la primera inspiración (muestra 0) y espiración a los 4,0 s
    expect(Math.abs(diffAt(0) - 0)).toBeLessThanOrEqual(1)
    const inhaleEnd = Math.round(4 * FS)
    expect(Math.abs(diffAt(Math.round(3.9 * FS)) - inhaleEnd)).toBeLessThanOrEqual(1)
  })

  it('el tono guía sube a 330 Hz con el pulmón lleno y baja a 220 Hz con el pulmón vacío, a −18 dB del tono', () => {
    const b = breath({ pattern: { holdInSec: 2, holdOutSec: 2 }, cues: { guideTone: true } })
    const withGuide = renderSeconds(engine(params(b)), 10)
    const without = renderSeconds(engine(params(breath({ pattern: { holdInSec: 2, holdOutSec: 2 } }))), 10)
    const g = withGuide.L.map((x, i) => (x as number) - (without.L[i] as number))

    const crossingsHz = (from: number, to: number) => {
      let c = 0
      for (let i = Math.round(from * FS) + 1; i < Math.round(to * FS); i++) {
        if (((g[i - 1] as number) < 0) !== ((g[i] as number) < 0)) c++
      }
      return c / 2 / (to - from)
    }
    // holdIn: 2,4–4,4 s (pulmón lleno); holdOut: 8,0–10,0 s (vacío). Se descartan 0,3 s de transición.
    expect(crossingsHz(2.8, 4.1)).toBeGreaterThan(330 * 0.99)
    expect(crossingsHz(2.8, 4.1)).toBeLessThan(330 * 1.01)
    expect(crossingsHz(8.3, 9.7)).toBeGreaterThan(220 * 0.99)
    expect(crossingsHz(8.3, 9.7)).toBeLessThan(220 * 1.01)

    // Tono binaural: amplitud 0,5 por canal con estas ganancias; el guía debe ser 0,126× ese valor.
    const peak = Math.max(...Array.from({ length: Math.round(1 * FS) }, (_, i) => Math.abs(g[Math.round(2.8 * FS) + i] as number)))
    expect(peak / 0.5).toBeGreaterThan(0.126 * 0.99)
    expect(peak / 0.5).toBeLessThan(0.126 * 1.01)
  })

  it('el oleaje sigue al pulmón: la RMS del ruido (ventana de 250 ms) correlaciona con el pulmón (r > 0,9)', () => {
    const e = engine(params(breath({ cues: { swell: true } }), { toneGain: 0, noiseType: 'brown', noiseGain: 1 }))
    const { L } = renderSeconds(e, 60)
    const win = Math.round(0.25 * FS)
    const xs: number[] = []
    const ys: number[] = []
    for (let w = 0; (w + 1) * win <= L.length; w++) {
      const from = w * win
      xs.push(rms(L, from, from + win))
      ys.push(breathState((from + win / 2) / FS, RESONANCE_PATTERN).lung)
    }
    const r = pearson(xs, ys)
    expect(r).toBeGreaterThan(0.9)
  })

  it('sin ruido elegido, el oleaje usa rosa solo para respirar; sin oleaje, el silencio es exacto', () => {
    const silent = renderSeconds(engine(params(breath({ cues: { swell: false } }), { toneGain: 0, noiseType: 'none' })), 5)
    expect(rms(silent.L, 0, silent.L.length)).toBe(0)
    const swell = renderSeconds(engine(params(breath({ cues: { swell: true } }), { toneGain: 0, noiseType: 'none' })), 5)
    expect(rms(swell.L, Math.round(1 * FS), Math.round(5 * FS))).toBeGreaterThan(0.01)
  })

  it('al cumplirse maxSec el metrónomo se apaga con un fundido de 30 s', () => {
    const e = engine(params(breath({ maxSec: 5, cues: { swell: true } }), { toneGain: 0, noiseType: 'none' }))
    const { L } = renderSeconds(e, 45)
    expect(rms(L, Math.round(1 * FS), Math.round(4 * FS))).toBeGreaterThan(0.01)
    // A los 5 s empieza el fundido; a partir de los 35 s ya no suena nada.
    expect(rms(L, Math.round(36 * FS), Math.round(40 * FS))).toBe(0)
  })

  it('las señales no alteran la salida cuando el metrónomo está apagado', () => {
    const base = renderSeconds(engine(params(breath({ enabled: false, cues: { swell: true, chime: true, guideTone: true } }))), 3)
    const plain = renderSeconds(engine(params(breath({ enabled: false }))), 3)
    for (let i = 0; i < base.L.length; i++) expect(base.L[i]).toBe(plain.L[i])
  })
})

describe('parámetros del metrónomo', () => {
  it('sanitizeParams descarta valores inválidos del patrón y mantiene los válidos', () => {
    const out = sanitizeParams(
      defaultParams(),
      { breath: { enabled: true, pattern: { rpm: 99, inhaleRatio: NaN, holdInSec: -4 } as BreathPattern, cues: { chime: 'sí' } as unknown as BreathCues } } as Partial<EngineParams>,
    )
    expect(out.breath.enabled).toBe(true)
    expect(out.breath.pattern.rpm).toBe(12)
    expect(out.breath.pattern.inhaleRatio).toBe(RESONANCE_PATTERN.inhaleRatio)
    expect(out.breath.pattern.holdInSec).toBe(0)
    expect(out.breath.cues.chime).toBe(true)
  })
})

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx
    const dy = (ys[i] as number) - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  return sxy / Math.sqrt(sxx * syy)
}

describe('bucle de exportación con respiración', () => {
  it('el bucle dura un número entero de ciclos respiratorios (5 min a 6 rpm exactos)', async () => {
    const { loopSecondsFor, LOOP_SECONDS } = await import('../src/audio/render')
    const on = params(breath({ cues: { chime: true } }))
    const p6 = sanitizeParams(defaultParams(), on as Partial<EngineParams>)
    expect(loopSecondsFor(p6, LOOP_SECONDS)).toBeCloseTo(300, 9)
    const p55 = sanitizeParams(defaultParams(), params(breath({ pattern: { rpm: 5.5 }, cues: { chime: true } })) as Partial<EngineParams>)
    const T = loopSecondsFor(p55, LOOP_SECONDS)
    const cycles = T / (60 / 5.5)
    expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9)
    expect(Math.abs(T - 300)).toBeLessThan(60 / 5.5)
    // Sin señales, el bucle no cambia
    const silent = sanitizeParams(defaultParams(), params(breath({ enabled: false })) as Partial<EngineParams>)
    expect(loopSecondsFor(silent, LOOP_SECONDS)).toBe(LOOP_SECONDS)
  })
})
