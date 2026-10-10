import { DEFAULT_PARAMS, type BeatMode, type EngineParams, type NoiseType } from './types'

export const MODES: readonly BeatMode[] = ['binaural', 'monaural', 'isochronic']
export const NOISE_TYPES: readonly NoiseType[] = ['none', 'white', 'pink', 'brown']

export const RANGES = {
  carrierHz: { min: 100, max: 1000 },
  beatHz: { min: 0.5, max: 40 },
  isoDepth: { min: 0.5, max: 0.98 },
  toneGain: { min: 0, max: 1 },
  noiseGain: { min: 0, max: 1 },
  masterGain: { min: 0, max: 1 },
} as const

type NumericKey = keyof typeof RANGES

function num(v: unknown, fallback: number, key: NumericKey): number {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.max(RANGES[key].min, Math.min(RANGES[key].max, x))
}

/** Aplica `patch` sobre `base` recortando rangos y descartando valores inválidos (NaN, tipos erróneos). */
export function sanitizeParams(base: EngineParams, patch: Partial<Record<keyof EngineParams, unknown>>): EngineParams {
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
    masterGain: num(p.masterGain, base.masterGain, 'masterGain'),
  }
}

export const defaultParams = (): EngineParams => ({ ...DEFAULT_PARAMS })
