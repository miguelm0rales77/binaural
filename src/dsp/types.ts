export type BeatMode = 'binaural' | 'monaural' | 'isochronic'
export type NoiseType = 'none' | 'white' | 'pink' | 'brown' | NatureType | MeditationType
/** Sonidos de la naturaleza sintetizados (sin grabaciones). */
export type NatureType = 'rain' | 'wind' | 'storm' | 'river' | 'forest'
/** Sonidos de meditación sintetizados (sin grabaciones): cuencos tibetanos y gong. */
export type MeditationType = 'bowls' | 'gong'

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
}
