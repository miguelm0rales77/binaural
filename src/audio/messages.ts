import type { EngineParams, Program } from '../dsp/types'

/** Mensajes del hilo principal al worklet. */
export type ToWorklet =
  | { type: 'params'; params: Partial<EngineParams> }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'program'; program: Program | null; startAtSec: number }
  | { type: 'timer'; sec: number | null }

/** Mensajes del worklet al hilo principal. */
export type FromWorklet =
  | {
      type: 'state'
      playing: boolean
      elapsedSec: number
      remainingSec: number | null
      beatHz: number
      carrierHz: number
      breathOriginSec: number
    }
  | { type: 'stopped' }

export const PROCESSOR_NAME = 'binaural-processor'
