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

/** Límites técnicos del editor (siempre activos): que el motor pueda con los tiempos. */
export const CUSTOM_LIMITS = { breathSec: { min: 1, max: 60 }, cycleSec: { max: 60 }, ratio: { min: 0.2, max: 0.8 } }

/**
 * Limitaciones de seguridad (activas por defecto): ciclo mínimo de 5 s (12 rpm), que evita respirar de más
 * (mareo, hormigueo), y retenciones de hasta 10 s, que pueden causar mareo o pérdida de conocimiento.
 * Sin ellas, solo quedan los límites técnicos: ciclo mínimo de 2 s (dos tiempos de 1 s) y retenciones de hasta 60 s.
 */
export function safetyLimits(on: boolean): { minCycleSec: number; maxHoldSec: number } {
  return on ? { minCycleSec: 5, maxHoldSec: 10 } : { minCycleSec: 2, maxHoldSec: 60 }
}

/** Ajusta un patrón a las limitaciones de seguridad (al volver a activarlas). */
export function withinSafetyLimits(p: BreathPattern): BreathPattern {
  const { minCycleSec, maxHoldSec } = safetyLimits(true)
  const cycle = 60 / p.rpm
  const rpm = cycle < minCycleSec ? 60 / minCycleSec : p.rpm
  return {
    ...p,
    rpm,
    holdInSec: Math.min(p.holdInSec, maxHoldSec),
    holdOutSec: Math.min(p.holdOutSec, maxHoldSec),
  }
}

/**
 * Convierte los tiempos del editor en un patrón. Devuelve el texto del error si los tiempos no sirven.
 * Con las limitaciones de seguridad activas, el ciclo mínimo es 5 s y las retenciones llegan hasta 10 s.
 */
export function customPattern(t: CustomTiming, safety = true): { pattern: BreathPattern } | { error: string } {
  const { breathSec } = CUSTOM_LIMITS
  const { minCycleSec, maxHoldSec } = safetyLimits(safety)
  const holdSec = { min: 0, max: maxHoldSec }
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
  const cycleMax = CUSTOM_LIMITS.cycleSec.max
  if (cycle < minCycleSec || cycle > cycleMax) {
    return { error: `El ciclo completo debe durar entre ${minCycleSec} y ${cycleMax} s (ahora ${cycle} s).` }
  }
  const ratio = t.inhaleSec / breathing
  if (ratio < CUSTOM_LIMITS.ratio.min || ratio > CUSTOM_LIMITS.ratio.max) {
    return { error: 'La inspiración y la espiración deben estar entre 1:4 y 4:1.' }
  }
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

/**
 * Presets de respiración con la frecuencia de resonancia personal (de «Mi frecuencia») en el preset de resonancia.
 * Sin prueba hecha, es 6 rpm y el nombre sigue siendo «Resonancia 6».
 */
export function presetsFor(resonanceRpm: number | null): readonly BreathPreset[] {
  if (resonanceRpm === null) return BREATH_PRESETS
  const rpm = Math.round(resonanceRpm * 10) / 10
  return BREATH_PRESETS.map((p) =>
    p.id === 'resonance'
      ? { ...p, name: `Resonancia ${Number.isInteger(rpm) ? rpm : rpm.toFixed(1)}`, pattern: { ...p.pattern, rpm } }
      : p,
  )
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

/**
 * Nombre del preset que corresponde a un patrón (para el registro de práctica). Compara ritmo, proporción y rampa;
 * si ninguno coincide, la sesión es «Personalizado».
 */
export function presetLabel(p: BreathPattern, presets: readonly BreathPreset[]): string {
  const ramp = (x: BreathPattern) => (x.rampSec ?? 0) > 0
  const hit = presets.find(
    (b) =>
      Math.abs(b.pattern.rpm - p.rpm) < 1e-6 &&
      Math.abs(b.pattern.inhaleRatio - p.inhaleRatio) < 1e-6 &&
      ramp(b.pattern) === ramp(p),
  )
  return hit?.name ?? 'Personalizado'
}
