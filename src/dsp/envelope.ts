import { TWO_PI } from './oscillator'

/** Envolvente isocrónica (coseno alzado): vale 1−D con φ=0 y 1 con φ=0.5. */
export function isoEnvelope(phase01: number, depth: number): number {
  return 1 - depth * 0.5 * (1 + Math.cos(TWO_PI * phase01))
}

export class IsoEnvelope {
  phase = 0

  /** `inc` = Δf/fs (ciclos por muestra). */
  tick(inc: number, depth: number): number {
    const env = isoEnvelope(this.phase, depth)
    this.phase += inc
    if (this.phase >= 1) this.phase -= 1
    return env
  }
}
