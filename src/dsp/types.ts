import { DEFAULT_BREATH_PATTERN, type BreathPattern } from './breath'

export type BeatMode = 'binaural' | 'monaural' | 'isochronic'
export type NoiseType = 'none' | 'white' | 'pink' | 'brown' | NatureType | MeditationType
/** Sonidos de la naturaleza sintetizados (sin grabaciones). */
export type NatureType = 'rain' | 'wind' | 'storm' | 'river' | 'forest'
/** Sonidos de meditación sintetizados (sin grabaciones): cuencos tibetanos y gong. */
export type MeditationType = 'bowls' | 'gong'

/** Señales de guía que acompañan a la respiración (cada una se activa por separado). */
export interface BreathCues {
  /** Oleaje: el ruido de fondo sube y baja con los pulmones. */
  swell: boolean
  /** Tono guía: un seno que sube al inspirar y baja al espirar. */
  guideTone: boolean
  /** Campanilla al empezar cada fase. */
  chime: boolean
}

export interface BreathSettings {
  enabled: boolean
  pattern: BreathPattern
  cues: BreathCues
  /** Instante (s desde el inicio del motor) en el que la respiración se apaga con un fundido de 30 s; null = no se apaga. */
  stopAtSec: number | null
  /** Limitaciones de seguridad del editor personalizado (ciclo ≥ 5 s, retenciones ≤ 10 s). Quitarlas es una decisión consciente. */
  safetyLimits: boolean
}

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
  breath: BreathSettings
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

/** Parche de parámetros: cualquier subconjunto de EngineParams; `breath` también puede ir parcial (p. ej. solo `enabled`). */
export type ParamsPatch = Omit<Partial<EngineParams>, 'breath'> & { breath?: Partial<BreathSettings> }

export interface Preset {
  id: string
  name: string
  params: ParamsPatch
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
  // Respiración apagada por defecto: sin ella el audio es exactamente el de antes.
  breath: {
    enabled: false,
    pattern: DEFAULT_BREATH_PATTERN,
    cues: { swell: true, guideTone: false, chime: false },
    stopAtSec: null,
    safetyLimits: true,
  },
}
