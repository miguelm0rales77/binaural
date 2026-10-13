import { describe, expect, it } from 'vitest'
import {
  breathState,
  breathStateInto,
  sanitizeBreathPattern,
  type BreathPattern,
  type BreathState,
} from '../src/dsp/breath'
import { DspEngine } from '../src/dsp/engine'
import { sanitizeParams } from '../src/dsp/params'
import { DEFAULT_PARAMS, type BreathSettings } from '../src/dsp/types'
import { FS, render, seeded } from './helpers'

const scratch: BreathState = { phase: 'in', phaseProgress: 0, phaseSec: 0, lung: 0, cycleIndex: 0 }

/** Tiempos (s) en los que empieza cada fase, a resolución de muestra. */
function phaseStarts(p: BreathPattern, seconds: number) {
  const out: { phase: string; cycle: number; t: number }[] = []
  let prev = ''
  const n = Math.round(seconds * FS)
  for (let i = 0; i <= n; i++) {
    const s = breathStateInto(scratch, i / FS, p)
    const key = `${s.cycleIndex}:${s.phase}`
    if (key !== prev) {
      out.push({ phase: s.phase, cycle: s.cycleIndex, t: i / FS })
      prev = key
    }
  }
  return out
}

const breathCues = (cues: Partial<BreathSettings['cues']>, pattern: BreathPattern, enabled = true): BreathSettings => ({
  enabled,
  pattern,
  cues: { swell: false, guideTone: false, chime: false, ...cues },
  stopAtSec: null,
})

describe('1. duración de inspiración y espiración', () => {
  it('6 rpm, ratio 0.4: inspiración 4,0 s y espiración 6,0 s (±1 ms)', () => {
    const p: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 }
    const starts = phaseStarts(p, 25)
    const inhales: number[] = []
    const exhales: number[] = []
    for (let k = 0; k + 1 < starts.length; k++) {
      const cur = starts[k] as (typeof starts)[number]
      const next = starts[k + 1] as (typeof starts)[number]
      if (cur.phase === 'in') inhales.push(next.t - cur.t)
      if (cur.phase === 'out') exhales.push(next.t - cur.t)
    }
    console.log(`  inspiraciones: ${inhales.slice(0, 2).map((d) => d.toFixed(4)).join(', ')} s; espiraciones: ${exhales.slice(0, 2).map((d) => d.toFixed(4)).join(', ')} s`)
    expect(inhales.length).toBeGreaterThanOrEqual(2)
    for (const d of inhales) expect(Math.abs(d - 4)).toBeLessThanOrEqual(0.001)
    for (const d of exhales) expect(Math.abs(d - 6)).toBeLessThanOrEqual(0.001)
  })
})

describe('2. llenado pulmonar continuo', () => {
  it('sin saltos mayores de 1e-3 entre muestras (48 kHz, con retenciones y rampa)', () => {
    const p: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 1, holdOutSec: 0.5, rampFromRpm: 8, rampSec: 120 }
    let prev = breathState(0, p).lung
    let maxStep = 0
    const n = 30 * FS
    for (let i = 1; i <= n; i++) {
      const lung = breathStateInto(scratch, i / FS, p).lung
      maxStep = Math.max(maxStep, Math.abs(lung - prev))
      prev = lung
    }
    console.log(`  máximo salto entre muestras de lung = ${maxStep.toExponential(2)}`)
    expect(maxStep).toBeLessThanOrEqual(1e-3)
  })
})

describe('3. rampa de entrada', () => {
  // Nota: bajar de 8 a 6 rpm ALARGA cada ciclo (de ~7,5 s a 10 s). El plan dice «decrece», pero sus propias cifras
  // (primer ciclo ~7,5 s, después 10 s) describen un aumento; el test sigue las cifras. Ver DECISIONES.md.
  it('de 8 a 6 rpm en 120 s: los ciclos se alargan monótonamente, el primero dura ~7,5 s y tras 120 s duran 10 s', () => {
    const p: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0, rampFromRpm: 8, rampSec: 120 }
    // Inicio de cada ciclo, a 1 ms de resolución (las duraciones quedan a ±2 ms).
    const cycleStarts: number[] = []
    let last = -1
    for (let i = 0; i <= 140 * 1000; i++) {
      const c = breathStateInto(scratch, i / 1000, p).cycleIndex
      if (c !== last) {
        cycleStarts.push(i / 1000)
        last = c
      }
    }
    const durations = cycleStarts.slice(1).map((t, k) => t - (cycleStarts[k] as number))
    console.log(`  primer ciclo ${durations[0]?.toFixed(3)} s; ciclo 10 ${durations[9]?.toFixed(3)} s; último ${durations[durations.length - 1]?.toFixed(3)} s`)

    const inRamp = durations.filter((_, k) => (cycleStarts[k] as number) < 120 - 10)
    for (let k = 1; k < inRamp.length; k++) {
      expect(inRamp[k] as number).toBeGreaterThan(inRamp[k - 1] as number)
    }
    expect(durations[0]).toBeGreaterThan(7.4)
    expect(durations[0]).toBeLessThan(7.7)
    const afterRamp = durations.filter((_, k) => (cycleStarts[k] as number) >= 120.5)
    expect(afterRamp.length).toBeGreaterThan(0)
    for (const d of afterRamp) expect(Math.abs(d - 10)).toBeLessThanOrEqual(0.005)
  })
})

describe('4. campanillas en el cambio de fase', () => {
  it('cada nota empieza en el mismo instante del cambio de fase (±1 muestra)', () => {
    const pattern: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 }
    const seconds = 25
    const expected = phaseStarts(pattern, seconds).map((s) => Math.round(s.t * FS))

    const e = new DspEngine(
      FS,
      { toneGain: 0, noiseType: 'none', masterGain: 1, loudnessComp: false, breath: breathCues({ chime: true }, pattern) },
      { fadeSec: 0, rand: seeded(5), masterCeiling: 1 },
    )
    e.start()
    const { L } = render(e, seconds * FS)

    // Inicio de cada nota: sonido tras al menos 1 ms de silencio. Un cruce por cero de una sola muestra no cuenta
    // (a 660 Hz a 48 kHz las muestras caen exactamente en cero cada 400 muestras).
    const onsets: number[] = []
    let quiet = 1e9
    for (let i = 0; i < L.length; i++) {
      if (Math.abs(L[i] as number) > 1e-6) {
        if (quiet >= 48) onsets.push(i)
        quiet = 0
      } else {
        quiet++
      }
    }
    console.log(`  cambios de fase: ${expected.join(', ')}  →  notas: ${onsets.join(', ')}`)
    expect(onsets.length).toBe(expected.length)
    onsets.forEach((o, k) => expect(Math.abs(o - (expected[k] as number))).toBeLessThanOrEqual(1))
  })

  it('la nota de inspiración (660 Hz) tiene más cruces por cero que la de espiración (440 Hz)', () => {
    const pattern: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 }
    const e = new DspEngine(
      FS,
      { toneGain: 0, noiseType: 'none', masterGain: 1, loudnessComp: false, breath: breathCues({ chime: true }, pattern) },
      { fadeSec: 0, rand: seeded(5), masterCeiling: 1 },
    )
    e.start()
    const { L } = render(e, 5 * FS) // inspiración (0–4 s) y primera espiración (4–5 s)
    const crossings = (from: number, to: number) => {
      let c = 0
      for (let i = from + 1; i < to; i++) if ((L[i - 1] as number) * (L[i] as number) < 0) c++
      return c
    }
    const high = crossings(0, 0.15 * FS)
    const low = crossings(4 * FS, 4.15 * FS)
    console.log(`  cruces en 0,15 s: inspiración ${high}, espiración ${low}`)
    expect(high).toBeGreaterThan(low)
  })
})

describe('5. oleaje', () => {
  it('la envolvente RMS del ruido (ventanas de 250 ms) se correlaciona con lung (r > 0,9)', () => {
    const pattern: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 }
    const e = new DspEngine(
      FS,
      { toneGain: 0, noiseType: 'pink', noiseGain: 1, masterGain: 1, loudnessComp: false, breath: breathCues({ swell: true }, pattern) },
      { fadeSec: 0, rand: seeded(11), masterCeiling: 1 },
    )
    e.start()
    const seconds = 60
    const { L } = render(e, seconds * FS)
    const win = FS / 4
    const rms: number[] = []
    const lungMean: number[] = []
    for (let w = 0; w + win <= L.length; w += win) {
      let s = 0
      let l = 0
      for (let i = w; i < w + win; i++) {
        s += (L[i] as number) ** 2
        if (i % 16 === 0) l += breathStateInto(scratch, i / FS, pattern).lung
      }
      rms.push(Math.sqrt(s / win))
      lungMean.push(l / (win / 16))
    }
    const r = pearson(rms, lungMean)
    console.log(`  r(RMS, lung) = ${r.toFixed(3)} sobre ${rms.length} ventanas`)
    expect(r).toBeGreaterThan(0.9)
  })
})

describe('6. retenciones', () => {
  it('durante una retención lung se queda fijo (1 tras inspirar, 0 tras espirar)', () => {
    const p: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 1.5, holdOutSec: 0.8 }
    let inHold = 0
    let inHoldOut = 0
    for (let i = 0; i < 30 * FS; i++) {
      const s = breathStateInto(scratch, i / FS, p)
      if (s.phase === 'holdIn') {
        inHold++
        expect(s.lung).toBe(1)
      } else if (s.phase === 'holdOut') {
        inHoldOut++
        expect(s.lung).toBe(0)
      }
    }
    console.log(`  muestras en retención: ${inHold} (tras inspirar), ${inHoldOut} (tras espirar)`)
    expect(inHold).toBeGreaterThan(0)
    expect(inHoldOut).toBeGreaterThan(0)
  })
})

describe('reloj y patrón', () => {
  it('el patrón por defecto empieza inspirando con los pulmones vacíos', () => {
    const s = breathState(0, { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 })
    expect(s.phase).toBe('in')
    expect(s.lung).toBe(0)
    expect(s.cycleIndex).toBe(0)
  })

  it('sanitizeBreathPattern recorta rangos y descarta valores no numéricos (campos ausentes = neutros)', () => {
    const s = sanitizeBreathPattern({ rpm: 99, inhaleRatio: Number.NaN, holdInSec: -4, rampSec: 1e9 })
    expect(s.rpm).toBe(12)
    expect(s.inhaleRatio).toBe(0.4)
    expect(s.holdInSec).toBe(0)
    expect(s.rampSec).toBe(600)
    // un patrón sin rampa no hereda la rampa del anterior
    expect(sanitizeBreathPattern({ rpm: 6 }).rampSec).toBe(0)
  })

  it('sanitizeParams conserva la respiración apagada por defecto y valida sus señales', () => {
    expect(sanitizeParams(DEFAULT_PARAMS, {}).breath.enabled).toBe(false)
    const s = sanitizeParams(DEFAULT_PARAMS, { breath: { enabled: true, cues: { chime: 'sí', swell: false } } })
    expect(s.breath.enabled).toBe(true)
    expect(s.breath.cues.swell).toBe(false)
    expect(s.breath.cues.chime).toBe(DEFAULT_PARAMS.breath.cues.chime) // valor no booleano: se queda el anterior
  })
})

describe('7. fin de la respiración (fundido de 30 s)', () => {
  it('tras el fundido, la salida es idéntica a la de una sesión sin respiración', () => {
    const pattern: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 }
    const make = (breathOn: boolean) =>
      new DspEngine(
        8000,
        {
          toneGain: 0,
          noiseType: 'pink',
          noiseGain: 1,
          masterGain: 1,
          loudnessComp: false,
          breath: { enabled: breathOn, pattern, cues: { swell: true, guideTone: true, chime: true }, stopAtSec: 2 },
        },
        { fadeSec: 0, rand: seeded(21), masterCeiling: 1 },
      )
    const on = make(true)
    const off = make(false)
    on.start()
    off.start()
    const a = render(on, 45 * 8000).L
    const b = render(off, 45 * 8000).L
    // con el fundido terminado (2 s + 30 s) la respiración ya no suena: solo queda el fondo
    const from = 33 * 8000
    let maxDiff = 0
    for (let i = from; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs((a[i] as number) - (b[i] as number)))
    console.log(`  diferencia máxima tras el fundido: ${maxDiff}`)
    expect(maxDiff).toBe(0)
  })

  it('las campanillas dejan de sonar cuando la respiración ha terminado de apagarse', () => {
    const pattern: BreathPattern = { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0 }
    const e = new DspEngine(
      FS,
      { toneGain: 0, noiseType: 'none', masterGain: 1, loudnessComp: false, breath: { enabled: true, pattern, cues: { swell: false, guideTone: false, chime: true }, stopAtSec: 1 } },
      { fadeSec: 0, rand: seeded(5), masterCeiling: 1 },
    )
    e.start()
    const { L } = render(e, 45 * FS)
    const onsets: number[] = []
    let quiet = 1e9
    for (let i = 0; i < L.length; i++) {
      if (Math.abs(L[i] as number) > 1e-6) {
        if (quiet >= 48) onsets.push(i / FS)
        quiet = 0
      } else quiet++
    }
    console.log(`  campanillas (s): ${onsets.map((t) => t.toFixed(1)).join(', ')}`)
    // cambios de fase cada 4 s y 6 s; con el fundido a 0 en 31 s no debe haber nada después
    expect(onsets.length).toBeGreaterThan(3)
    expect(onsets.every((t) => t <= 31.5)).toBe(true)
  })
})

describe('8. patrón personalizado', () => {
  it('sanitize no recorta una proporción de 0,25 (rango personalizado 0,2–0,8)', () => {
    expect(sanitizeBreathPattern({ rpm: 6, inhaleRatio: 0.25 }).inhaleRatio).toBe(0.25)
  })
})

function pearson(x: number[], y: number[]): number {
  const n = x.length
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx
    const dy = (y[i] as number) - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  return sxy / Math.sqrt(sxx * syy)
}
