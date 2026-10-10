/** PRNG con semilla (mulberry32), devuelve valores en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clip1(x: number): number {
  return Math.max(-1, Math.min(1, x))
}

/**
 * Genera blanco, rosa (Paul Kellet, versión completa) y marrón (integrador con pérdida)
 * a partir de la misma muestra blanca. Tras `next()` se leen `white`, `pink` y `brown`
 * (sin reservar memoria por muestra).
 */
export class NoiseGenerator {
  white = 0
  pink = 0
  brown = 0

  private b0 = 0
  private b1 = 0
  private b2 = 0
  private b3 = 0
  private b4 = 0
  private b5 = 0
  private b6 = 0
  private last = 0

  private readonly rand: () => number

  constructor(rand: () => number = Math.random) {
    this.rand = rand
  }

  next(): void {
    const w = this.rand() * 2 - 1
    this.b0 = 0.99886 * this.b0 + w * 0.0555179
    this.b1 = 0.99332 * this.b1 + w * 0.0750759
    this.b2 = 0.969 * this.b2 + w * 0.153852
    this.b3 = 0.8665 * this.b3 + w * 0.3104856
    this.b4 = 0.55 * this.b4 + w * 0.5329522
    this.b5 = -0.7616 * this.b5 - w * 0.016898
    const pink =
      (this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362) * 0.11
    this.b6 = w * 0.115926

    this.last = (this.last + 0.02 * w) / 1.02
    const brown = this.last * 3.5

    this.white = clip1(w)
    this.pink = clip1(pink)
    this.brown = clip1(brown)
  }
}
