export const TWO_PI = 2 * Math.PI

/** Oscilador senoidal con acumulador de fase: cambiar la frecuencia nunca produce saltos. */
export class Oscillator {
  phase = 0

  /** `inc` = 2π·f/fs (radianes por muestra). */
  tick(inc: number): number {
    this.phase += inc
    if (this.phase >= TWO_PI) this.phase -= TWO_PI
    return Math.sin(this.phase)
  }
}
