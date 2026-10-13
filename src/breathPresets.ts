import type { BreathPattern } from './dsp/breath'
import type { NoiseType } from './dsp/types'

/** Respiración de resonancia (§B2): 6 rpm, inspiración 4 s y espiración 6 s, con rampa de 8 a 6 rpm en 2 min. */
export const RESONANCE_PATTERN: BreathPattern = {
  rpm: 6,
  inhaleRatio: 0.4,
  holdInSec: 0,
  holdOutSec: 0,
  rampFromRpm: 8,
  rampSec: 120,
}

/** Pre-sueño (§B5): 5,5 rpm con inspiración corta (35 %), sin rampa. */
export const PRE_SLEEP_PATTERN: BreathPattern = { rpm: 5.5, inhaleRatio: 0.35, holdInSec: 0, holdOutSec: 0, rampSec: 0 }

export interface BreathPreset {
  id: 'resonance' | 'micro' | 'pre-sleep'
  name: string
  pattern: BreathPattern
  /** Ruido de fondo que acompaña al oleaje, si el preset lo fija. */
  noise?: { noiseType: NoiseType; noiseGain: number }
  /** Duración sugerida en minutos (se usa como temporizador). */
  suggestedMinutes: number
}

/** Presets de respiración (§B5, Fase 9). El personalizado no es un preset: se construye con `customPattern`. */
export const BREATH_PRESETS: readonly BreathPreset[] = [
  { id: 'resonance', name: 'Resonancia 6', pattern: RESONANCE_PATTERN, suggestedMinutes: 20 },
  {
    id: 'micro',
    name: 'Microdosis 3 min',
    pattern: { rpm: 6, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0, rampSec: 0 },
    suggestedMinutes: 3,
  },
  {
    id: 'pre-sleep',
    name: 'Pre-sueño',
    pattern: PRE_SLEEP_PATTERN,
    noise: { noiseType: 'brown', noiseGain: 0.25 },
    suggestedMinutes: 30,
  },
]

/** Tiempos de un ciclo en segundos, tal como los escribe la persona en el editor. */
export interface CustomTiming {
  inhaleSec: number
  holdInSec: number
  exhaleSec: number
  holdOutSec: number
}

/** Límites del editor. El ciclo mínimo de 5 s (12 rpm) evita respirar de más; el resto no tiene límite médico. */
export const CUSTOM_LIMITS = { breathSec: { min: 1, max: 60 }, holdSec: { min: 0, max: 10 }, cycleSec: { min: 5, max: 60 } }

/**
 * Convierte los tiempos del editor en un patrón. Devuelve el texto del error si los tiempos no sirven:
 * el ciclo completo debe durar entre 5 y 60 s (1–12 rpm) y la proporción inspiración/espiración entre 1:4 y 4:1.
 */
export function customPattern(t: CustomTiming): { pattern: BreathPattern } | { error: string } {
  const { breathSec, holdSec } = CUSTOM_LIMITS
  for (const [name, v] of [
    ['inspiración', t.inhaleSec],
    ['espiración', t.exhaleSec],
  ] as const) {
    if (!(v >= breathSec.min && v <= breathSec.max)) return { error: `La ${name} debe durar entre ${breathSec.min} y ${breathSec.max} s.` }
  }
  for (const [name, v] of [
    ['retención tras inspirar', t.holdInSec],
    ['retención tras espirar', t.holdOutSec],
  ] as const) {
    if (!(v >= holdSec.min && v <= holdSec.max)) return { error: `La ${name} debe durar entre ${holdSec.min} y ${holdSec.max} s.` }
  }
  const breathing = t.inhaleSec + t.exhaleSec
  const cycle = breathing + t.holdInSec + t.holdOutSec
  const { cycleSec } = CUSTOM_LIMITS
  if (cycle < cycleSec.min || cycle > cycleSec.max) {
    return { error: `El ciclo completo debe durar entre ${cycleSec.min} y ${cycleSec.max} s (ahora ${cycle} s).` }
  }
  const ratio = t.inhaleSec / breathing
  if (ratio < 0.2 || ratio > 0.8) return { error: 'La inspiración y la espiración deben estar entre 1:4 y 4:1.' }
  return {
    pattern: {
      rpm: 60 / cycle,
      inhaleRatio: ratio,
      holdInSec: t.holdInSec,
      holdOutSec: t.holdOutSec,
      rampSec: 0,
    },
  }
}

const fmt = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',')

/** Resumen de una línea: «6,0 rpm · inspiración 4,0 s · espiración 6,0 s». */
export function describeBreath(p: BreathPattern): string {
  const cycle = 60 / p.rpm
  const breathing = cycle - p.holdInSec - p.holdOutSec
  const inhale = breathing * p.inhaleRatio
  const exhale = breathing - inhale
  const parts = [`${fmt(p.rpm)} rpm`, `inspiración ${fmt(inhale)} s`]
  if (p.holdInSec > 0) parts.push(`retención ${fmt(p.holdInSec)} s`)
  parts.push(`espiración ${fmt(exhale)} s`)
  if (p.holdOutSec > 0) parts.push(`retención ${fmt(p.holdOutSec)} s`)
  if ((p.rampSec ?? 0) > 0) parts.push(`rampa desde ${fmt(p.rampFromRpm ?? 8)} rpm`)
  return parts.join(' · ')
}
