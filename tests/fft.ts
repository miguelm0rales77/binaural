/** FFT radix-2 in-place (re/im de longitud potencia de 2) y utilidades de espectro. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  if (n & (n - 1)) throw new Error('La longitud debe ser potencia de 2')
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j] as number, re[i] as number]
      ;[im[i], im[j]] = [im[j] as number, im[i] as number]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const xr = (re[b] as number) * cr - (im[b] as number) * ci
        const xi = (re[b] as number) * ci + (im[b] as number) * cr
        re[b] = (re[a] as number) - xr
        im[b] = (im[a] as number) - xi
        re[a] = (re[a] as number) + xr
        im[a] = (im[a] as number) + xi
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  return w
}

/** Espectro de potencia (n/2+1 bins) de un segmento de longitud potencia de 2, con ventana de Hann. */
export function powerSpectrum(x: ArrayLike<number>, offset: number, n: number): Float64Array {
  const w = hann(n)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i++) re[i] = (x[offset + i] as number) * (w[i] as number)
  fft(re, im)
  const p = new Float64Array(n / 2 + 1)
  for (let k = 0; k <= n / 2; k++) p[k] = (re[k] as number) ** 2 + (im[k] as number) ** 2
  return p
}

/** Frecuencia del pico espectral (Hz) con interpolación parabólica sobre el log de la magnitud. */
export function peakFrequency(x: ArrayLike<number>, n: number, fs: number): number {
  const p = powerSpectrum(x, 0, n)
  let k = 1
  for (let i = 1; i < p.length - 1; i++) if ((p[i] as number) > (p[k] as number)) k = i
  const a = Math.log(p[k - 1] as number)
  const b = Math.log(p[k] as number)
  const c = Math.log(p[k + 1] as number)
  const delta = (0.5 * (a - c)) / (a - 2 * b + c)
  return ((k + delta) * fs) / n
}

/**
 * Pendiente espectral en dB por octava: promedia (Welch, 50 % de solape) el espectro de potencia,
 * lo agrupa en bandas logarítmicas entre fLo y fHi y ajusta una recta dB vs log2(f).
 */
export function spectralSlopeDbPerOctave(
  x: ArrayLike<number>,
  fs: number,
  fLo = 100,
  fHi = 8000,
  seg = 4096,
  bands = 24,
): number {
  const avg = new Float64Array(seg / 2 + 1)
  let count = 0
  for (let off = 0; off + seg <= x.length; off += seg / 2) {
    const p = powerSpectrum(x, off, seg)
    for (let k = 0; k < avg.length; k++) avg[k] = (avg[k] as number) + (p[k] as number)
    count++
  }
  const xs: number[] = []
  const ys: number[] = []
  const ratio = Math.pow(fHi / fLo, 1 / bands)
  for (let b = 0; b < bands; b++) {
    const lo = fLo * Math.pow(ratio, b)
    const hi = lo * ratio
    let sum = 0
    let nb = 0
    let fsum = 0
    for (let k = 0; k < avg.length; k++) {
      const f = (k * fs) / seg
      if (f >= lo && f < hi) {
        sum += (avg[k] as number) / count
        fsum += f
        nb++
      }
    }
    if (nb === 0) continue
    xs.push(Math.log2(fsum / nb))
    ys.push(10 * Math.log10(sum / nb))
  }
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += ((xs[i] as number) - mx) * ((ys[i] as number) - my)
    den += ((xs[i] as number) - mx) ** 2
  }
  return num / den
}
