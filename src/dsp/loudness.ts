// ISO 226:2003 — curva de igual sonoridad. Tabla de §2.5 del plan.
const F = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000]
const ALPHA = [
  0.532, 0.506, 0.48, 0.455, 0.432, 0.409, 0.387, 0.367, 0.349, 0.33, 0.315, 0.301, 0.288, 0.276,
  0.267, 0.259, 0.253, 0.25,
]
const LU = [
  -31.6, -27.2, -23.0, -19.1, -15.9, -13.0, -10.3, -8.1, -6.2, -4.5, -3.1, -2.0, -1.1, -0.4, 0.0,
  0.3, 0.5, 0.0,
]
const TF = [
  78.5, 68.7, 59.5, 51.1, 44.0, 37.5, 31.5, 26.5, 22.1, 17.9, 14.4, 11.4, 8.6, 6.2, 4.4, 3.0, 2.2,
  2.4,
]

const LAST = F.length - 1

/** SPL (dB) necesario a la frecuencia `f` para un nivel de sonoridad `ln` fon. f se limita a [20, 1000]. */
export function isoSpl(f: number, ln = 40): number {
  const fc = Math.max(20, Math.min(1000, f))
  let i = 0
  while (i < LAST - 1 && fc >= (F[i + 1] as number)) i++
  const f0 = F[i] as number
  const f1 = F[i + 1] as number
  const t = Math.log(fc / f0) / Math.log(f1 / f0)
  const alpha = (ALPHA[i] as number) + t * ((ALPHA[i + 1] as number) - (ALPHA[i] as number))
  const lu = (LU[i] as number) + t * ((LU[i + 1] as number) - (LU[i] as number))
  const tf = (TF[i] as number) + t * ((TF[i + 1] as number) - (TF[i] as number))
  const af =
    4.47e-3 * (Math.pow(10, 0.025 * ln) - 1.15) +
    Math.pow(0.4 * Math.pow(10, (tf + lu) / 10 - 9), alpha)
  return (10 / alpha) * Math.log10(af) - lu + 94
}

const REF_SPL = isoSpl(400)

/** Compensación en dB respecto a 400 Hz, limitada a [−6, +12]. */
export function loudnessCompDb(fc: number): number {
  return Math.max(-6, Math.min(12, isoSpl(fc) - REF_SPL))
}

export function loudnessCompGain(fc: number): number {
  return Math.pow(10, loudnessCompDb(fc) / 20)
}
