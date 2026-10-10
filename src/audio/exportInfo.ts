import type { EngineParams, Program } from '../dsp/types'
import { EXPORT_SAMPLE_RATE, LOOP_SECONDS, MAX_EXPORT_SECONDS } from './render'
import { wavSizeBytes } from './wav'

export const MAX_EXPORT_MINUTES = MAX_EXPORT_SECONDS / 60
/** A partir de este tamaño se avisa de que el archivo es grande. */
export const LARGE_EXPORT_BYTES = 300e6

export function estimateBytes(job: { loop: boolean; minutes: number }): number {
  const seconds = job.loop ? LOOP_SECONDS : job.minutes * 60
  return wavSizeBytes(Math.round(seconds * EXPORT_SAMPLE_RATE))
}

export function formatMB(bytes: number): string {
  return `${Math.round(bytes / 1e6)} MB`
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const MODE_SLUG = { binaural: 'binaural', monaural: 'monaural', isochronic: 'isocronico' } as const

/** Nombre de archivo descriptivo, p. ej. `binaural_250Hz_10Hz_20min.wav` o `pre-sueno-programa_30min.wav`. */
export function exportFileName(
  params: Pick<EngineParams, 'mode' | 'carrierHz' | 'beatHz'>,
  opts: { loop: boolean; minutes: number; program: Program | null },
): string {
  const length = opts.loop ? 'bucle5min' : `${opts.minutes}min`
  const head = opts.program
    ? slug(opts.program.name) || 'programa'
    : `${MODE_SLUG[params.mode]}_${Math.round(params.carrierHz)}Hz_${+params.beatHz.toFixed(1)}Hz`
  return `${head}_${length}.wav`
}
