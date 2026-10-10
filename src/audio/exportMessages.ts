import type { ExportJob } from './render'

export type ToExportWorker = { type: 'start'; job: ExportJob }

export type FromExportWorker =
  | { type: 'chunk'; buffer: ArrayBuffer }
  | { type: 'progress'; fraction: number }
  | { type: 'done'; header: Uint8Array; head: ArrayBuffer | null; frames: number; sampleRate: number }
  | { type: 'error'; message: string }
