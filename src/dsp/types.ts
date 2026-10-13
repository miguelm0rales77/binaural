import { RESONANCE_PATTERN, type BreathPattern } from './breath'

export type BeatMode = 'binaural' | 'monaural' | 'isochronic'
export type NoiseType = 'none' | 'white' | 'pink' | 'brown' | NatureType
/** Sonidos de la naturaleza sintetizados (sin grabaciones). */
export type NatureType = 'rain' | 'wind' | 'storm' | 'river' | 'forest'

export interface EngineParams {
  mode: BeatMode
  carrierHz: number // 100–1000 (para binaural, advertir por encima de 500)
  beatHz: number // 0.5–40
  isoDepth: number // 0.5–0.98 (solo isocrónico)
  toneGain: number // 0–1 (lineal)
  noiseType: NoiseType
  noiseGain: number // 0–1
  loudnessComp: boolean // compensación ISO 226 activada/desactivada
  masterGain: number // 0–1, con techo duro (ver §5 del plan)
  breath: BreathConfig
}

/** Señales de guía del metrónomo de respiración; cada una se activa por separado. */
export interface BreathCues {
  swell: boolean // el ruido de fondo «respira» (ganancia y, en rosa/marrón, filtro)
  guideTone: boolean // seno que sube de 220 a 330 Hz al inspirar
  chime: boolean // campanilla al empezar cada fase
}

export interface BreathConfig {
  enabled: boolean
  pattern: BreathPattern
  cues: BreathCues
  /** Duración de las señales desde que empieza el reloj; al cumplirse, fundido de 30 s. null = sin límite. */
  maxSec: number | null
}

export interface ProgramStep {
  atSec: number
  beatHz: number
  carrierHz?: number
}

/** Interpolación lineal entre pasos. */
export interface Program {
  name: string
  durationSec: number
  steps: ProgramStep[]
}

export interface Preset {
  id: string
  name: string
  params: Partial<EngineParams>
  program?: Program
  /** Duración sugerida en minutos (se usa como temporizador); null = sin límite. */
  suggestedMinutes: number | null
}

export const DEFAULT_PARAMS: EngineParams = {
  mode: 'binaural',
  carrierHz: 250,
  beatHz: 10,
  isoDepth: 0.8,
  toneGain: 0.5,
  noiseType: 'none',
  noiseGain: 0.3,
  loudnessComp: true,
  masterGain: 0.3,
  breath: {
    enabled: false,
    pattern: { ...RESONANCE_PATTERN },
    cues: { swell: true, guideTone: false, chime: true },
    maxSec: null,
  },
}
