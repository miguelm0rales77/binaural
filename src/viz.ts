import { isoEnvelope } from './dsp/envelope'
import type { BeatMode } from './dsp/types'

/**
 * Visualización del pulso SIN parpadeos. Dibuja el patrón de 1 segundo del pulso (Δf lóbulos) como
 * una forma fija, y un punto de brillo constante que lo recorre una vez por segundo. Nada de la pantalla
 * cambia de brillo al ritmo del pulso: un destello a 3–30 Hz es justo lo que puede desencadenar crisis en
 * personas fotosensibles, y el pulso llega a 40 Hz.
 */
export const SWEEP_PERIOD_MS = 1000
/** Veces por segundo que algo cambia visiblemente de posición: ≤ 3 (criterio WCAG 2.3.1). */
export const SWEEP_HZ = 1000 / SWEEP_PERIOD_MS

/** Amplitud (0–1) del pulso en el instante `t01` ∈ [0, 1) de una ventana de 1 s. */
export function envelopeAt(mode: BeatMode, beatHz: number, depth: number, t01: number): number {
  if (mode === 'isochronic') return isoEnvelope(t01 * beatHz, depth)
  // binaural y monaural: dos tonos separados Δf interfieren con una envolvente |cos(π·Δf·t)|
  return Math.abs(Math.cos(Math.PI * beatHz * t01))
}

/** Posición (0–1) del punto que recorre el patrón. */
export function sweepPosition(nowMs: number): number {
  return (nowMs % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS
}
