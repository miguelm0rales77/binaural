/**
 * Sonidos de meditación por síntesis (sin grabaciones): cuencos tibetanos y un «Om» coral.
 * Igual que los de la naturaleza: mono, sin reservar memoria en `next()`, deterministas con `rand`
 * inyectable y sin picos repentinos (los golpes de cuenco entran en 300–600 ms; el «Om» sube en ~1,8 s).
 * Suenan artificiales: no son grabaciones.
 */
import { BandPass, LP, SlowRandom, type NatureGen } from './nature'
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

// ───────────────────────────── «Om» coral ─────────────────────────────

const OM_VOICES = 5
/** Desafinado de cada voz en cents: casi al unísono, como un canto monástico, pero nunca idéntico. */
const CENTS = [0, 5, -6, 9, -8]
/** Pequeño desfase de cada voz respecto al inicio del ciclo (s). */
const OFFSETS = [0, 0.18, -0.22, 0.3, -0.12]
/** Duración (s) de cada tramo del ciclo: subida, «o» sostenida, paso a «m», «m» sostenida, bajada, respiración. */
const SEGMENTS = [1.8, 5.0, 1.5, 3.2, 2.2, 1.3]

export interface OmOptions {
  /** Altura base (Hz). Por defecto 110 (La2), una voz grave de coro. */
  f0?: number
  /** Variación aleatoria de la duración de cada ciclo (0 = ciclos idénticos). Por defecto 0,12. */
  jitter?: number
}

class OmVoice {
  readonly centFactor: number
  readonly vibRate: number
  readonly vibDepth: number
  readonly drift: SlowRandom
  readonly tilt: LP
  readonly hum: LP
  readonly bp1: BandPass
  readonly bp2: BandPass
  readonly bp3: BandPass
  saw = 0
  lfo = 0
  constructor(index: number, rand: Rand, fs: number) {
    this.centFactor = Math.pow(2, (CENTS[index] as number) / 1200)
    this.vibRate = 4.6 + 1.0 * rand()
    this.vibDepth = 0.0025
    this.drift = new SlowRandom(rand, 0.2, fs)
    this.tilt = new LP(600, fs)
    this.hum = new LP(320, fs)
    this.bp1 = new BandPass(fs)
    this.bp2 = new BandPass(fs)
    this.bp3 = new BandPass(fs)
    this.lfo = rand() * TWO_PI
  }
}

/**
 * Coro de cinco voces graves que canta «Om» una y otra vez: sube suavemente a una «o» sostenida, pasa a
 * una «m» nasal, baja y respira. La vocal se forma filtrando una onda de diente de sierra con formantes
 * (F1/F2/F3) que pasan de los de una «o» a los de una «m». Con vibrato leve y deriva lenta de afinación.
 */
export class OmGen implements NatureGen {
  private readonly rand: Rand
  private readonly invFs: number
  private readonly level: number
  private readonly f0: number
  private readonly jitter: number
  private readonly voices: OmVoice[]
  /** Fin acumulado de cada tramo del ciclo actual; el último es la duración total. */
  private readonly bounds = new Float64Array(SEGMENTS.length)
  private cycT = 0
  private ampOut = 0
  private mOut = 0

  constructor(rand: Rand, fs: number, level = 1.0, opts: OmOptions = {}) {
    this.rand = rand
    this.invFs = 1 / fs
    this.level = level
    this.f0 = opts.f0 ?? 110
    this.jitter = opts.jitter ?? 0.12
    this.voices = Array.from({ length: OM_VOICES }, (_, i) => new OmVoice(i, rand, fs))
    this.newCycle()
    this.cycT = 0
  }

  private newCycle(): void {
    const scale = 1 + (this.rand() * 2 - 1) * this.jitter
    let acc = 0
    for (let i = 0; i < SEGMENTS.length; i++) {
      acc += (SEGMENTS[i] as number) * scale
      this.bounds[i] = acc
    }
  }

  /** Amplitud (`ampOut`) y mezcla «o»→«m» (`mOut`, 0–1) en el instante `tau` del ciclo. */
  private shape(tau: number): void {
    const b = this.bounds
    if (tau < 0 || tau >= (b[4] as number)) {
      this.ampOut = 0
      this.mOut = tau < 0 ? 0 : 1
    } else if (tau < (b[0] as number)) {
      this.ampOut = 0.5 - 0.5 * Math.cos((Math.PI * tau) / (b[0] as number))
      this.mOut = 0
    } else if (tau < (b[1] as number)) {
      this.ampOut = 1
      this.mOut = 0
    } else if (tau < (b[2] as number)) {
      const u = (tau - (b[1] as number)) / ((b[2] as number) - (b[1] as number))
      const s = u * u * (3 - 2 * u)
      this.ampOut = 1 - 0.15 * s
      this.mOut = s
    } else if (tau < (b[3] as number)) {
      this.ampOut = 0.85
      this.mOut = 1
    } else {
      const u = (tau - (b[3] as number)) / ((b[4] as number) - (b[3] as number))
      this.ampOut = 0.85 * (0.5 + 0.5 * Math.cos(Math.PI * u))
      this.mOut = 1
    }
  }

  next(): number {
    this.cycT += this.invFs
    if (this.cycT >= (this.bounds[SEGMENTS.length - 1] as number)) {
      this.cycT -= this.bounds[SEGMENTS.length - 1] as number
      this.newCycle()
    }
    let sum = 0
    for (let i = 0; i < OM_VOICES; i++) {
      const voice = this.voices[i] as OmVoice
      this.shape(this.cycT + (OFFSETS[i] as number))
      const amp = this.ampOut
      if (amp < 1e-4) continue
      const m = this.mOut
      // afinación: vibrato + deriva lenta, y una caída de ~1,5 % hacia la «m»
      voice.lfo += (TWO_PI * voice.vibRate) * this.invFs
      if (voice.lfo >= TWO_PI) voice.lfo -= TWO_PI
      const f =
        this.f0 * voice.centFactor * (1 + voice.vibDepth * Math.sin(voice.lfo) + 0.002 * voice.drift.tick()) * (1 - 0.015 * m)
      voice.saw += f * this.invFs
      if (voice.saw >= 1) voice.saw -= 1
      const src = voice.tilt.tick(0.8 * (2 * voice.saw - 1))
      // formantes: «o» ≈ 460 / 860 / 2650 Hz; «m» nasal ≈ 270 / 1000 / 2200 Hz con F2 y F3 muy atenuados
      const y =
        voice.bp1.tick(src, 460 - 190 * m, 5 - m) +
        0.55 * (1 - 0.85 * m) * voice.bp2.tick(src, 860 + 140 * m, 7 - 4 * m) +
        0.14 * (1 - 0.9 * m) * voice.bp3.tick(src, 2650 - 450 * m, 10) +
        (0.1 + 0.3 * m) * voice.hum.tick(src)
      // la «m» es más suave que la «o» (al cantar, el sonido nasal pierde fuerza)
      sum += amp * (1 - 0.55 * m) * y
    }
    return Math.tanh(sum * this.level)
  }
}
