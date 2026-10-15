/**
 * Control de calidad de la vista fractal (§C3 del plan): si la media de los últimos 2 s baja de 50 fps,
 * la resolución pasa al 45 % y se quita una octava (sobre las del preset). Es una degradación de un solo sentido:
 * no vuelve a subir, para no alternar entre calidades mientras se mira.
 */

export const TARGET_FPS = 50
const WINDOW_MS = 2000

export interface Quality {
  /** Factor sobre la resolución base (1 = completa). */
  scale: number
  /** Si se ha degradado: el renderizador quita una octava sobre las del preset. */
  degraded: boolean
}

/** Resolución base: min(devicePixelRatio, 1.5) × 0,6 de la resolución CSS. */
export const baseResolution = (dpr: number) => Math.min(dpr, 1.5) * 0.6

export class QualityGovernor {
  private readonly frames: number[] = [] // instantes de cada fotograma dentro de la ventana
  private degraded = false

  /** Registra un fotograma en el instante `nowMs` y devuelve la calidad actual. */
  onFrame(nowMs: number): Quality {
    this.frames.push(nowMs)
    while (this.frames.length > 0 && nowMs - (this.frames[0] as number) > WINDOW_MS) this.frames.shift()
    const span = nowMs - (this.frames[0] ?? nowMs)
    if (!this.degraded && span >= WINDOW_MS && this.frames.length > 1) {
      const fps = ((this.frames.length - 1) * 1000) / span
      if (fps < TARGET_FPS) this.degraded = true
    }
    return this.quality()
  }

  quality(): Quality {
    return this.degraded ? { scale: 0.45, degraded: true } : { scale: 1, degraded: false }
  }
}
