import {
  DEFAULT_PARAMS,
  type BeatMode,
  type EngineParams,
  type MeditationType,
  type NatureType,
  type NoiseType,
} from './types'

export const MODES: readonly BeatMode[] = ['binaural', 'monaural', 'isochronic']
export const NATURE_TYPES: readonly NatureType[] = ['rain', 'wind', 'storm', 'river', 'forest']
export const MEDITATION_TYPES: readonly MeditationType[] = ['bowls', 'om']
/** Todos los fondos generados por síntesis, en el orden en que los guarda el motor. */
export const GENERATED_TYPES: readonly (NatureType | MeditationType)[] = [...NATURE_TYPES, ...MEDITATION_TYPES]
export const NOISE_TYPES: readonly NoiseType[] = ['none', 'white', 'pink', 'brown', ...GENERATED_TYPES]

export const isNature = (t: NoiseType): t is NatureType => (NATURE_TYPES as readonly string[]).includes(t)
export const isMeditation = (t: NoiseType): t is MeditationType => (MEDITATION_TYPES as readonly string[]).includes(t)
/** Cualquier fondo que no sea silencio ni ruido (blanco, rosa, marrón). */
export const isGenerated = (t: NoiseType): t is NatureType | MeditationType =>
  (GENERATED_TYPES as readonly string[]).includes(t)

/** Techo duro del volumen general (§5 del plan). */
export const MASTER_CEILING = 0.8

export const RANGES = {
  carrierHz: { min: 100, max: 1000 },
  beatHz: { min: 0.5, max: 40 },
  isoDepth: { min: 0.5, max: 0.98 },
  toneGain: { min: 0, max: 1 },
  noiseGain: { min: 0, max: 1 },
  masterGain: { min: 0, max: MASTER_CEILING },
} as const

type NumericKey = keyof typeof RANGES

function num(v: unknown, fallback: number, key: NumericKey, max: number = RANGES[key].max): number {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.max(RANGES[key].min, Math.min(max, x))
}

/**
 * Aplica `patch` sobre `base` recortando rangos y descartando valores inválidos (NaN, tipos erróneos).
 * `masterCeiling` es el techo del volumen general (por defecto MASTER_CEILING = 0,8).
 */
export function sanitizeParams(
  base: EngineParams,
  patch: Partial<Record<keyof EngineParams, unknown>>,
  masterCeiling: number = MASTER_CEILING,
): EngineParams {
  const p = { ...base, ...patch } as Record<keyof EngineParams, unknown>
  return {
    mode: MODES.includes(p.mode as BeatMode) ? (p.mode as BeatMode) : base.mode,
    noiseType: NOISE_TYPES.includes(p.noiseType as NoiseType) ? (p.noiseType as NoiseType) : base.noiseType,
    loudnessComp: typeof p.loudnessComp === 'boolean' ? p.loudnessComp : base.loudnessComp,
    carrierHz: num(p.carrierHz, base.carrierHz, 'carrierHz'),
    beatHz: num(p.beatHz, base.beatHz, 'beatHz'),
    isoDepth: num(p.isoDepth, base.isoDepth, 'isoDepth'),
    toneGain: num(p.toneGain, base.toneGain, 'toneGain'),
    noiseGain: num(p.noiseGain, base.noiseGain, 'noiseGain'),
    masterGain: num(p.masterGain, base.masterGain, 'masterGain', masterCeiling),
  }
}

export const defaultParams = (): EngineParams => ({ ...DEFAULT_PARAMS })
