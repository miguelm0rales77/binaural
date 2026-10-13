/**
 * Sonidos de meditación por síntesis (sin grabaciones): cuencos tibetanos y gong.
 * Igual que los de la naturaleza: mono, sin reservar memoria en `next()`, deterministas con `rand`
 * inyectable y sin picos repentinos (los golpes entran en 300–600 ms los cuencos y en ~0,3–1,4 s cada
 * parcial del gong). Suenan artificiales: no son grabaciones.
 */
import { BandPass, noise, type NatureGen } from './nature'
import { TWO_PI } from './oscillator'

type Rand = () => number

// ───────────────────────── Cuencos tibetanos ─────────────────────────

const BOWL_VOICES = 4
const PARTIALS = 4
/** Fundamentales en una escala pentatónica (Re3 Sol3 La3 Re4 Mi4): suenan bien juntos. */
const BOWL_PITCHES = [146.83, 196.0, 220.0, 293.66, 329.63]
/** Parciales de un cuenco golpeado: inarmónicos (no son múltiplos enteros), de ahí el timbre metálico. */
const RATIOS = [1, 2.71, 5.31, 8.76]
const PARTIAL_AMP = [1, 0.5, 0.22, 0.09]
/** Constante de decaimiento de cada parcial (s): el grave suena más tiempo. */
const PARTIAL_TAU = [9, 5.5, 3.2, 1.8]

export interface BowlsOptions {
  pitches?: readonly number[]
  /** Segundos hasta el primer golpe. */
  firstStrikeSec?: number
  minGapSec?: number
  maxGapSec?: number
}

/**
 * Cuencos que suenan uno a uno, a intervalos de 7–16 s. Cada parcial es un par de frecuencias casi iguales,
 * lo que produce el batido lento («wah-wah») típico de un cuenco.
 */
export class BowlsGen implements NatureGen {
  private readonly rand: Rand
  private readonly fs: number
  private readonly level: number
  private readonly pitches: readonly number[]
  private readonly minGap: number
  private readonly maxGap: number
  private wait: number

  private readonly active = new Uint8Array(BOWL_VOICES)
  private readonly t = new Float64Array(BOWL_VOICES)
  private readonly attack = new Float64Array(BOWL_VOICES)
  private readonly gain = new Float64Array(BOWL_VOICES)
  private readonly phA = new Float64Array(BOWL_VOICES * PARTIALS)
  private readonly phB = new Float64Array(BOWL_VOICES * PARTIALS)
  private readonly incA = new Float64Array(BOWL_VOICES * PARTIALS)
  private readonly incB = new Float64Array(BOWL_VOICES * PARTIALS)
  private readonly env = new Float64Array(BOWL_VOICES * PARTIALS)
  private readonly decay = new Float64Array(BOWL_VOICES * PARTIALS)

  constructor(rand: Rand, fs: number, level = 0.7, opts: BowlsOptions = {}) {
    this.rand = rand
    this.fs = fs
    this.level = level
    this.pitches = opts.pitches ?? BOWL_PITCHES
    this.minGap = opts.minGapSec ?? 7
    this.maxGap = opts.maxGapSec ?? 16
    this.wait = (opts.firstStrikeSec ?? 1.5 + 1.5 * rand()) * fs
  }

  private strike(): void {
    let v = -1
    for (let i = 0; i < BOWL_VOICES; i++) {
      if (!this.active[i]) {
        v = i
        break
      }
    }
    if (v < 0) return
    const f1 = this.pitches[Math.floor(this.rand() * this.pitches.length)] as number
    const beatHz = 0.5 + 1.0 * this.rand() // batido de la fundamental
    const detune = beatHz / f1 // el mismo desafinado relativo en todos los parciales
    const life = 0.8 + 0.4 * this.rand()
    for (let k = 0; k < PARTIALS; k++) {
      const i = v * PARTIALS + k
      const fk = f1 * (RATIOS[k] as number)
      this.incA[i] = (TWO_PI * fk) / this.fs
      this.incB[i] = (TWO_PI * fk * (1 + detune)) / this.fs
      this.phA[i] = 0
      this.phB[i] = this.rand() * TWO_PI
      this.env[i] = 1
      this.decay[i] = Math.exp(-1 / ((PARTIAL_TAU[k] as number) * life * this.fs))
    }
    this.active[v] = 1
    this.t[v] = 0
    this.attack[v] = (0.3 + 0.3 * this.rand()) * this.fs // entrada suave (300–600 ms): el cuenco «florece», sin golpe seco
    this.gain[v] = 0.55 + 0.45 * this.rand()
  }

  next(): number {
    if (--this.wait <= 0) {
      this.strike()
      this.wait = (this.minGap + (this.maxGap - this.minGap) * this.rand()) * this.fs
    }
    let sum = 0
    for (let v = 0; v < BOWL_VOICES; v++) {
      if (!this.active[v]) continue
      const tt = this.t[v] as number
      this.t[v] = tt + 1
      const att = tt < (this.attack[v] as number) ? 0.5 - 0.5 * Math.cos((Math.PI * tt) / (this.attack[v] as number)) : 1
      let vs = 0
      for (let k = 0; k < PARTIALS; k++) {
        const i = v * PARTIALS + k
        let a = (this.phA[i] as number) + (this.incA[i] as number)
        let b = (this.phB[i] as number) + (this.incB[i] as number)
        if (a >= TWO_PI) a -= TWO_PI
        if (b >= TWO_PI) b -= TWO_PI
        this.phA[i] = a
        this.phB[i] = b
        vs += (PARTIAL_AMP[k] as number) * (this.env[i] as number) * (Math.sin(a) + Math.sin(b))
        this.env[i] = (this.env[i] as number) * (this.decay[i] as number)
      }
      sum += (this.gain[v] as number) * att * vs * 0.5
      if (tt > (this.attack[v] as number) && (this.env[v * PARTIALS] as number) < 1e-3) this.active[v] = 0
    }
    return Math.tanh(sum * this.level)
  }
}

// ──────────────────────────────── Gong ────────────────────────────────

const GONG_VOICES = 2
const GONG_PARTIALS = 14
/** Fundamentales graves (Fa2 Sol2 La2 Do3): un gong grande y profundo. */
const GONG_PITCHES = [87.31, 98.0, 110.0, 130.81]

/** Razones de frecuencia de los parciales: densas e inarmónicas (crecen más deprisa que un múltiplo entero). */
export const GONG_RATIOS = (() => {
  const r = Array.from({ length: GONG_PARTIALS }, (_, i) => Math.pow(i + 1, 1.28) + 0.21 * Math.sin(2.7 * (i + 1)))
  return r.map((v) => v / (r[0] as number))
})()
const GONG_AMP = Array.from(
  { length: GONG_PARTIALS },
  (_, i) => Math.pow(i + 1, -0.8) * (1 + 0.3 * Math.sin(1.9 * (i + 1) + 1)),
)
/** Decaimiento (s): el grave suena ~26 s; los agudos se apagan antes. */
const GONG_TAU = Array.from({ length: GONG_PARTIALS }, (_, i) => 26 / (1 + 0.55 * i))
/** Subida (s): los agudos tardan más en aparecer → el «bloom» típico de un gong. */
const GONG_ATTACK = Array.from({ length: GONG_PARTIALS }, (_, i) => 0.3 + 0.08 * i)
/** Desafinado relativo del segundo oscilador de cada parcial → batidos (más rápidos en los agudos). */
const GONG_DETUNE = Array.from({ length: GONG_PARTIALS }, (_, i) => 0.0015 + 0.003 * (((i + 1) * 37) % 10) / 10)

export interface GongOptions {
  pitches?: readonly number[]
  /** Segundos hasta el primer golpe. */
  firstStrikeSec?: number
  minGapSec?: number
  maxGapSec?: number
}

/** Pico de e^(−t/τ) − e^(−t/α) (para normalizar la envolvente de subida y bajada). */
const bumpPeak = (alpha: number, tau: number) => Math.pow(alpha / tau, alpha / (tau - alpha)) * (1 - alpha / tau)

/**
 * Gong profundo, uno cada 18–34 s. Cada parcial tiene su propia envolvente suave «sube y baja»
 * (diferencia de dos exponenciales: empieza en cero, sin golpe seco), con los agudos tardando más en
 * aparecer. Un velo de ruido filtrado (~1,8 kHz) crece y se apaga con él, como el «lavado» metálico de un gong.
 */
export class GongGen implements NatureGen {
  private readonly rand: () => number
  private readonly fs: number
  private readonly level: number
  private readonly pitches: readonly number[]
  private readonly minGap: number
  private readonly maxGap: number
  private wait: number

  private readonly active = new Uint8Array(GONG_VOICES)
  private readonly gain = new Float64Array(GONG_VOICES)
  private readonly phA = new Float64Array(GONG_VOICES * GONG_PARTIALS)
  private readonly phB = new Float64Array(GONG_VOICES * GONG_PARTIALS)
  private readonly incA = new Float64Array(GONG_VOICES * GONG_PARTIALS)
  private readonly incB = new Float64Array(GONG_VOICES * GONG_PARTIALS)
  private readonly e1 = new Float64Array(GONG_VOICES * GONG_PARTIALS) // e^(−t/τ)
  private readonly e2 = new Float64Array(GONG_VOICES * GONG_PARTIALS) // e^(−t/α)
  private readonly d1 = new Float64Array(GONG_VOICES * GONG_PARTIALS)
  private readonly d2 = new Float64Array(GONG_VOICES * GONG_PARTIALS)
  private readonly norm = new Float64Array(GONG_VOICES * GONG_PARTIALS)
  // velo de ruido: misma forma de envolvente, con constantes propias
  private readonly w1 = new Float64Array(GONG_VOICES)
  private readonly w2 = new Float64Array(GONG_VOICES)
  private readonly wash: BandPass
  private readonly washD1: number
  private readonly washD2: number
  private readonly washNorm: number

  constructor(rand: () => number, fs: number, level = 0.6, opts: GongOptions = {}) {
    this.rand = rand
    this.fs = fs
    this.level = level
    this.pitches = opts.pitches ?? GONG_PITCHES
    this.minGap = opts.minGapSec ?? 18
    this.maxGap = opts.maxGapSec ?? 34
    this.wait = (opts.firstStrikeSec ?? 2 + 2 * rand()) * fs
    this.wash = new BandPass(fs)
    this.washD1 = Math.exp(-1 / (6 * fs))
    this.washD2 = Math.exp(-1 / (1.4 * fs))
    this.washNorm = 1 / bumpPeak(1.4, 6)
  }

  private strike(): void {
    let v = -1
    for (let i = 0; i < GONG_VOICES; i++) {
      if (!this.active[i]) {
        v = i
        break
      }
    }
    if (v < 0) return
    const f1 = this.pitches[Math.floor(this.rand() * this.pitches.length)] as number
    const life = 0.85 + 0.3 * this.rand()
    for (let k = 0; k < GONG_PARTIALS; k++) {
      const i = v * GONG_PARTIALS + k
      const fk = f1 * (GONG_RATIOS[k] as number)
      const tau = (GONG_TAU[k] as number) * life
      const alpha = GONG_ATTACK[k] as number
      this.incA[i] = (TWO_PI * fk) / this.fs
      this.incB[i] = (TWO_PI * fk * (1 + (GONG_DETUNE[k] as number))) / this.fs
      this.phA[i] = this.rand() * TWO_PI
      this.phB[i] = this.rand() * TWO_PI
      this.e1[i] = 1
      this.e2[i] = 1
      this.d1[i] = Math.exp(-1 / (tau * this.fs))
      this.d2[i] = Math.exp(-1 / (alpha * this.fs))
      this.norm[i] = (GONG_AMP[k] as number) / bumpPeak(alpha, tau)
    }
    this.w1[v] = 1
    this.w2[v] = 1
    this.gain[v] = 0.6 + 0.4 * this.rand()
    this.active[v] = 1
  }

  next(): number {
    if (--this.wait <= 0) {
      this.strike()
      this.wait = (this.minGap + (this.maxGap - this.minGap) * this.rand()) * this.fs
    }
    let tonal = 0
    let washLevel = 0
    for (let v = 0; v < GONG_VOICES; v++) {
      if (!this.active[v]) continue
      let vs = 0
      for (let k = 0; k < GONG_PARTIALS; k++) {
        const i = v * GONG_PARTIALS + k
        let a = (this.phA[i] as number) + (this.incA[i] as number)
        let b = (this.phB[i] as number) + (this.incB[i] as number)
        if (a >= TWO_PI) a -= TWO_PI
        if (b >= TWO_PI) b -= TWO_PI
        this.phA[i] = a
        this.phB[i] = b
        const e1 = this.e1[i] as number
        const e2 = this.e2[i] as number
        vs += (e1 - e2) * (this.norm[i] as number) * (Math.sin(a) + Math.sin(b))
        this.e1[i] = e1 * (this.d1[i] as number)
        this.e2[i] = e2 * (this.d2[i] as number)
      }
      tonal += (this.gain[v] as number) * vs * 0.5
      const w1 = this.w1[v] as number
      const w2 = this.w2[v] as number
      washLevel += (this.gain[v] as number) * (w1 - w2) * this.washNorm
      this.w1[v] = w1 * this.washD1
      this.w2[v] = w2 * this.washD2
      if ((this.e1[v * GONG_PARTIALS] as number) < 2e-3) this.active[v] = 0
    }
    const wash = washLevel === 0 ? 0 : washLevel * this.wash.tick(noise(this.rand), 1800, 0.7) * 0.9
    return Math.tanh((tonal + wash) * this.level)
  }
}
