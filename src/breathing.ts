/**
 * Respiración guiada: patrones, presets y conversión entre segundos (modo personalizado) y patrón.
 * TypeScript puro, probado en Node.
 */
import { RESONANCE_PATTERN, type BreathPattern } from './dsp/breath'
import type { BreathCues, NoiseType } from './dsp/types'

export const BREATH_DURATIONS_MIN = [1, 3, 5, 10, 15, 20] as const

/** Modo resonancia: 4,0–7,0 rpm en pasos de 0,5. */
export const RPM_MIN = 4
export const RPM_MAX = 7
export const RPM_STEP = 0.5
/** Fracción de la parte respiratoria dedicada a inspirar (el resto es espiración). */
export const RATIO_MIN = 0.3
export const RATIO_MAX = 0.5

/** Rampa de entrada: empieza a 8 rpm y baja al ritmo objetivo en 2 minutos. */
export const RAMP_FROM_RPM = 8
export const RAMP_SEC = 120

export const DEFAULT_CUES: BreathCues = { swell: true, guideTone: false, chime: true }

export function snapRpm(v: number): number {
  const steps = Math.round(v / RPM_STEP) * RPM_STEP
  return Math.max(RPM_MIN, Math.min(RPM_MAX, steps))
}

/** Patrón completo (sin rampa salvo que se pida). Sin `rampFromRpm` no hay rampa: se fija a undefined a propósito. */
export function makePattern(rpm: number, inhaleRatio: number, opts: { ramp?: boolean; holdInSec?: number; holdOutSec?: number } = {}): BreathPattern {
  return {
    rpm,
    inhaleRatio,
    holdInSec: opts.holdInSec ?? 0,
    holdOutSec: opts.holdOutSec ?? 0,
    rampFromRpm: opts.ramp ? RAMP_FROM_RPM : undefined,
    rampSec: opts.ramp ? RAMP_SEC : undefined,
  }
}

export interface BreathSeconds {
  inhale: number
  holdIn: number
  exhale: number
  holdOut: number
}

/** Modo personalizado: los segundos dan el ciclo completo, de donde salen el ritmo y la proporción. */
export function patternFromSeconds(s: BreathSeconds): BreathPattern {
  const inh = Math.max(1, s.inhale)
  const exh = Math.max(1, s.exhale)
  const hi = Math.max(0, s.holdIn)
  const ho = Math.max(0, s.holdOut)
  const cycle = inh + exh + hi + ho
  return makePattern(60 / cycle, inh / (inh + exh), { holdInSec: hi, holdOutSec: ho })
}

/** Inverso de `patternFromSeconds` para mostrar el patrón actual en el editor. */
export function secondsFromPattern(p: BreathPattern): BreathSeconds {
  const cycle = 60 / p.rpm
  const breathing = Math.max(0, cycle - p.holdInSec - p.holdOutSec)
  return {
    inhale: p.inhaleRatio * breathing,
    holdIn: p.holdInSec,
    exhale: (1 - p.inhaleRatio) * breathing,
    holdOut: p.holdOutSec,
  }
}

/** Resumen de una línea: «6 rpm · inspiras 4,0 s y espiras 6,0 s». */
export function describePattern(p: BreathPattern): string {
  const s = secondsFromPattern(p)
  const f = (x: number) => x.toFixed(1).replace('.', ',')
  const holds = p.holdInSec > 0 || p.holdOutSec > 0 ? ` · retenciones ${f(p.holdInSec)} s y ${f(p.holdOutSec)} s` : ''
  return `${f(p.rpm)} rpm · inspiras ${f(s.inhale)} s y espiras ${f(s.exhale)} s${holds}`
}

export interface BreathPreset {
  id: string
  name: string
  pattern: BreathPattern
  cues: BreathCues
  /** Duración sugerida (temporizador), en minutos. */
  minutes: number
  /** Si el preset cambia también el fondo (p. ej., marrón para dormir). */
  noise?: NoiseType
}

/**
 * Presets de respiración. Los nombres describen el ritmo; no prometen ningún efecto.
 * «Resonancia 6» es el predeterminado: 6 rpm con espiración más larga, y rampa de entrada.
 */
export const BREATH_PRESETS: readonly BreathPreset[] = [
  {
    id: 'breath-resonance-6',
    name: 'Resonancia 6',
    pattern: makePattern(6, 0.4, { ramp: true }),
    cues: DEFAULT_CUES,
    minutes: 20,
  },
  {
    id: 'breath-micro-3',
    name: 'Microdosis 3 min',
    pattern: makePattern(6, 0.4),
    cues: DEFAULT_CUES,
    minutes: 3,
  },
  {
    id: 'breath-sleep-5-5',
    name: 'Pre-sueño 5,5 rpm',
    pattern: makePattern(5.5, 0.35),
    cues: { swell: true, guideTone: false, chime: false },
    minutes: 20,
    noise: 'brown',
  },
]

/** Patrón por defecto de la app (resonancia 6 con rampa). */
export const DEFAULT_BREATH_PATTERN: BreathPattern = { ...RESONANCE_PATTERN, ...makePattern(6, 0.4, { ramp: true }) }
