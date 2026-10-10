/** Coeficiente one-pole: a = exp(−1/(τ·fs)). */
export function onePoleCoef(tauSec: number, fs: number): number {
  return tauSec > 0 ? Math.exp(-1 / (tauSec * fs)) : 0
}

/** Suavizado one-pole por muestra: cur = target + a·(cur − target). */
export class Smoother {
  value: number
  target: number
  coef: number

  constructor(initial: number, tauSec: number, fs: number) {
    this.value = initial
    this.target = initial
    this.coef = onePoleCoef(tauSec, fs)
  }

  setTau(tauSec: number, fs: number): void {
    this.coef = onePoleCoef(tauSec, fs)
  }

  snap(v: number): void {
    this.value = v
    this.target = v
  }

  next(): number {
    this.value = this.target + this.coef * (this.value - this.target)
    return this.value
  }
}
