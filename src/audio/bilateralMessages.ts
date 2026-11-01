import type { BilateralParams } from '../dsp/bilateral'

/** Mensajes del hilo principal al worklet de la meditación bilateral. */
export type BilateralToWorklet =
  | { type: 'params'; params: Partial<BilateralParams> }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'alternation'; calm: boolean; fast: boolean }

/** Mensajes del worklet al hilo principal. */
export type BilateralFromWorklet =
  | { type: 'state'; elapsedSec: number; depth: number; speedMul: number; bedLevel: number; playing: boolean }
  | { type: 'side'; side: -1 | 1 }
  | { type: 'stopped' }

export const BILATERAL_PROCESSOR_NAME = 'bilateral-processor'
