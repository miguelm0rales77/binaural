/**
 * Meditación bilateral (uso personal de prueba, no clínico). Núcleo puro, sin APIs del navegador: lo usan el
 * worklet (tiempo real) y los tests. Dos buses en paralelo:
 *  - Primer plano: un tono (o pulsos) con paneo alternante. El paneo sigue la ley de potencia constante
 *    (θ = (p+1)·π/4, L = cos θ, R = sen θ), y la posición p = profundidad · sen(2π·f·t) la marca un LFO.
 *  - Fondo: tonos binaurales estáticos (opcional) y una cama continua, sin paneo, que solo suena en «Calma».
 *    El fondo se suma después del paneo: nunca pasa por él.
 * Todas las velocidades y duraciones son ajustables y no validadas. Ningún valor procede de una fuente clínica.
 */
import { NoiseGenerator, mulberry32 } from './noise'
import { Oscillator, TWO_PI } from './oscillator'
import { Smoother } from './smoothing'

export type BilateralMode = 'pulses' | 'continuous' | 'none'
export type BedType = 'rain' | 'pink' | 'drone'
/** Calibración: solo suena un tono en ese oído. */
export type TestEar = 'left' | 'right' | null

export const BILATERAL_MODES: readonly BilateralMode[] = ['pulses', 'continuous', 'none']
export const BED_TYPES: readonly BedType[] = ['rain', 'pink', 'drone']

export interface BilateralParams {
  mode: BilateralMode
  /** Frecuencia del LFO del paneo (ciclos por segundo, L → R → L). */
  lfoHz: number
  /** Tono del primer plano. */
  toneHz: number
  toneGain: number
  /** Fondo binaural: tono fijo en cada oído (izquierdo = portadora, derecho = portadora + batido). */
  bgBinaural: boolean
  bgCarrierHz: number
  bgBeatHz: number
  bgGain: number
  /** Cama de la pausa «Calma». */
  bed: BedType
  bedGain: number
  test: TestEar
}

export const BILATERAL_DEFAULTS: BilateralParams = {
  mode: 'continuous',
  lfoHz: 0.5,
  toneHz: 220,
  toneGain: 0.25,
  bgBinaural: false,
  bgCarrierHz: 200,
  bgBeatHz: 6,
  bgGain: 0.15,
  bed: 'rain',
  bedGain: 0.25,
  test: null,
}

/** Rangos de los controles. Fuera de ellos se recortan. */
export const BILATERAL_RANGES = {
  lfoHz: { min: 0.1, max: 2 },
  toneHz: { min: 110, max: 880 },
  toneGain: { min: 0, max: 0.5 },
  bgCarrierHz: { min: 100, max: 400 },
  bgBeatHz: { min: 1, max: 12 },
  bgGain: { min: 0, max: 0.5 },
  bedGain: { min: 0, max: 0.5 },
} as const

/** Tono de calibración (Hz) y su nivel. */
export const CAL_TONE_HZ = 330
const CAL_GAIN = 0.2
/** Fracción de cada periodo de pulso con sonido (el resto, silencio). */
const PULSE_DUTY = 0.5
/** «Calma»: el paneo se reduce a esta profundidad y a esta velocidad relativa. */
const CALM_DEPTH = 0.15
const CALM_SPEED = 0.25
/** Constante de tiempo de la atenuación (≈ 25 s hasta casi estático) y del corte rápido (malestar alto). */
const CALM_TAU_SEC = 7
const FAST_TAU_SEC = 0.3
const RESUME_TAU_SEC = 3
const BED_TAU_IN_SEC = 3
const BED_TAU_OUT_SEC = 1.5
const FADE_IN_SEC = 1.5
const FADE_OUT_SEC = 2.5
const RAIN_LOW_HZ = 300
const RAIN_HIGH_HZ = 2500
const PINK_HIGH_HZ = 800
const RAIN_DRIFT_HZ = 0.05

/** Ciclos por minuto y barridos por minuto (un barrido = paso de un lado al otro) del LFO. */
export function lfoUnits(hz: number): { hz: number; bpm: number; sweepsPerMin: number } {
  const bpm = hz * 60
  return { hz, bpm, sweepsPerMin: bpm * 2 }
}

/**
 * Ley de potencia constante: θ = (p+1)·π/4 con p en [−1, 1]. Cumple L² + R² = 1 para todo p:
 * en el centro cada canal vale 0,707 (−3 dB) y en los extremos uno vale 1 y el otro 0.
 */
export function panGainsInto(out: { l: number; r: number }, p: number): void {
  const q = p < -1 ? -1 : p > 1 ? 1 : p
  const theta = ((q + 1) * Math.PI) / 4
  out.l = Math.cos(theta)
  out.r = Math.sin(theta)
}

export function panGains(p: number): { l: number; r: number } {
  const out = { l: 0, r: 0 }
  panGainsInto(out, p)
  return out
}

const clamp = (v: number, r: { min: number; max: number }) => (v < r.min ? r.min : v > r.max ? r.max : v)
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback

/** Ajusta cualquier conjunto de parámetros a valores válidos. */
export function sanitizeBilateral(p: Partial<BilateralParams>): BilateralParams {
  const d = BILATERAL_DEFAULTS
  const num = (v: unknown, r: { min: number; max: number }, fb: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, r) : fb
  return {
    mode: pick(p.mode, BILATERAL_MODES, d.mode),
    lfoHz: num(p.lfoHz, BILATERAL_RANGES.lfoHz, d.lfoHz),
    toneHz: num(p.toneHz, BILATERAL_RANGES.toneHz, d.toneHz),
    toneGain: num(p.toneGain, BILATERAL_RANGES.toneGain, d.toneGain),
    bgBinaural: typeof p.bgBinaural === 'boolean' ? p.bgBinaural : d.bgBinaural,
    bgCarrierHz: num(p.bgCarrierHz, BILATERAL_RANGES.bgCarrierHz, d.bgCarrierHz),
    bgBeatHz: num(p.bgBeatHz, BILATERAL_RANGES.bgBeatHz, d.bgBeatHz),
    bgGain: num(p.bgGain, BILATERAL_RANGES.bgGain, d.bgGain),
    bed: pick(p.bed, BED_TYPES, d.bed),
    bedGain: num(p.bedGain, BILATERAL_RANGES.bedGain, d.bedGain),
    test: p.test === 'left' || p.test === 'right' ? p.test : null,
  }
}

/** Coeficiente de un filtro de un polo (paso bajo) para una frecuencia de corte. */
function lpCoef(hz: number, fs: number): number {
  return 1 - Math.exp((-TWO_PI * hz) / fs)
}

export interface BilateralState {
  elapsedSec: number
  /** Profundidad del paneo actual (1 = completo, 0,15 = «Calma»). */
  depth: number
  /** Velocidad relativa del LFO actual (1 = normal, 0,25 = «Calma»). */
  speedMul: number
  /** Nivel de la cama de la pausa (0–1). */
  bedLevel: number
  playing: boolean
}

/**
 * Motor de la meditación bilateral. Renderiza muestra a muestra sin reservar memoria en el bucle.
 * `onSide` avisa de cada pulso (modo a) o de cada cruce por el centro (modo b); sirve para la háptica.
 */
export class BilateralEngine {
  onStopped: (() => void) | null = null
  onSide: ((side: -1 | 1) => void) | null = null

  private p: BilateralParams
  private readonly fs: number
  private readonly noise: NoiseGenerator
  private readonly toneOsc = new Oscillator()
  private readonly lfo = new Oscillator()
  private readonly bgLeft = new Oscillator()
  private readonly bgRight = new Oscillator()
  private readonly calOsc = new Oscillator()
  private readonly drift = new Oscillator()
  private readonly droneA = new Oscillator()
  private readonly droneB = new Oscillator()
  private readonly depth: Smoother
  private readonly speed: Smoother
  private readonly bedLevel: Smoother
  private readonly pan = { l: 0, r: 0 }
  private readonly pinkA: number
  private readonly rainLowA: number
  private readonly rainHighA: number
  private pinkLp = 0
  private rainLow = 0
  private rainLp = 0
  /** Reloj del pulso en periodos (0–1 dentro de cada periodo); empieza a 1 para que el primero suene ya. */
  private pulseClock = 1
  private pulseIdx = -1
  private lastCrossing = 0
  private fade = 0
  private fadeTarget = 0
  private fadeStep: number
  private stopping = false
  private ended = false
  private samples = 0
  private outL = 0
  private outR = 0
  private calm = false

  constructor(fs: number, params: Partial<BilateralParams> = {}, rand: () => number = mulberry32(1)) {
    this.fs = fs
    this.p = sanitizeBilateral({ ...BILATERAL_DEFAULTS, ...params })
    this.noise = new NoiseGenerator(rand)
    this.depth = new Smoother(1, CALM_TAU_SEC, fs)
    this.speed = new Smoother(1, CALM_TAU_SEC, fs)
    this.bedLevel = new Smoother(0, BED_TAU_IN_SEC, fs)
    this.pinkA = lpCoef(PINK_HIGH_HZ, fs)
    this.rainLowA = lpCoef(RAIN_LOW_HZ, fs)
    this.rainHighA = lpCoef(RAIN_HIGH_HZ, fs)
    this.fadeStep = 1 / (FADE_IN_SEC * fs)
    this.applyBedTarget()
  }

  get params(): BilateralParams {
    return this.p
  }

  setParams(patch: Partial<BilateralParams>): void {
    this.p = sanitizeBilateral({ ...this.p, ...patch })
    this.applyBedTarget()
  }

  /**
   * «Calma» (calm = true): la profundidad y la velocidad se acercan a los valores de calma con una constante de
   * tiempo de 7 s (≈ 25 s hasta casi estático). Con `fast`, el corte es de 0,3 s (malestar alto).
   * Al volver (calm = false), el paneo recupera su amplitud y velocidad en unos 3 s. La cama entra o sale en ~3 s.
   */
  setAlternation(calm: boolean, fast = false): void {
    const tau = calm ? (fast ? FAST_TAU_SEC : CALM_TAU_SEC) : RESUME_TAU_SEC
    this.depth.setTau(tau, this.fs)
    this.speed.setTau(tau, this.fs)
    this.depth.target = calm ? CALM_DEPTH : 1
    this.speed.target = calm ? CALM_SPEED : 1
    this.calm = calm
    this.applyBedTarget()
  }

  /**
   * La cama suena en «Calma» y, en el modo sin paneo (c), durante toda la sesión: ese modo no tiene tono, así que
   * sin cama quedaría en silencio. En los modos de paneo la cama solo entra en «Calma».
   */
  private applyBedTarget(): void {
    const on = this.calm || this.p.mode === 'none'
    this.bedLevel.setTau(on ? BED_TAU_IN_SEC : BED_TAU_OUT_SEC, this.fs)
    this.bedLevel.target = on ? 1 : 0
  }

  start(): void {
    this.fadeTarget = 1
    this.fadeStep = 1 / (FADE_IN_SEC * this.fs)
    this.stopping = false
    this.ended = false
  }

  /** Fundido de salida de 2,5 s; `onStopped` avisa al terminar. */
  stop(): void {
    this.fadeTarget = 0
    this.fadeStep = 1 / (FADE_OUT_SEC * this.fs)
    this.stopping = true
  }

  getState(): BilateralState {
    return {
      elapsedSec: this.samples / this.fs,
      depth: this.depth.value,
      speedMul: this.speed.value,
      bedLevel: this.bedLevel.value,
      playing: this.fadeTarget === 1,
    }
  }

  renderBlock(left: Float32Array, right: Float32Array, n: number): void {
    for (let i = 0; i < n; i++) {
      this.tick()
      left[i] = this.outL
      right[i] = this.outR
    }
  }

  private tick(): void {
    const fs = this.fs
    const p = this.p
    this.samples++
    this.stepFade()
    const sm = this.speed.next()
    const dp = this.depth.next()
    const bed = this.bedLevel.next()

    if (p.test !== null) {
      // Calibración: un tono aislado en un oído, sin el resto de buses.
      const s = this.calOsc.tick((TWO_PI * CAL_TONE_HZ) / fs) * CAL_GAIN * this.fade
      this.outL = p.test === 'left' ? s : 0
      this.outR = p.test === 'right' ? s : 0
      return
    }

    // Primer plano: tono con paneo (continuo o de pulsos).
    const tone = this.toneOsc.tick((TWO_PI * p.toneHz) / fs)
    let fgL = 0
    let fgR = 0
    if (p.mode === 'continuous') {
      const lfoSin = this.lfo.tick((TWO_PI * p.lfoHz * sm) / fs)
      panGainsInto(this.pan, dp * lfoSin)
      const s = tone * p.toneGain
      fgL = s * this.pan.l
      fgR = s * this.pan.r
      const crossing = lfoSin >= 0 ? 1 : -1
      if (crossing !== this.lastCrossing) {
        this.lastCrossing = crossing
        this.onSide?.(crossing)
      }
    } else if (p.mode === 'pulses') {
      // Pulsos a 2·f por segundo: cada uno va a un lado, alternando izquierda y derecha.
      this.pulseClock += (2 * p.lfoHz * sm) / fs
      if (this.pulseClock >= 1) {
        this.pulseClock -= 1
        this.pulseIdx++
        this.onSide?.(this.pulseIdx % 2 === 0 ? -1 : 1)
      }
      if (this.pulseClock < PULSE_DUTY) {
        const g = Math.sin((Math.PI * this.pulseClock) / PULSE_DUTY) ** 2
        panGainsInto(this.pan, (this.pulseIdx % 2 === 0 ? -1 : 1) * dp)
        const s = tone * p.toneGain * g
        fgL = s * this.pan.l
        fgR = s * this.pan.r
      }
    }

    // Fondo: binaural estático (sin paneo) y cama.
    let bgL = 0
    let bgR = 0
    if (p.bgBinaural) {
      bgL = this.bgLeft.tick((TWO_PI * p.bgCarrierHz) / fs) * p.bgGain
      bgR = this.bgRight.tick((TWO_PI * (p.bgCarrierHz + p.bgBeatHz)) / fs) * p.bgGain
    }
    let bedS = 0
    if (bed > 1e-4 && p.bedGain > 0) {
      this.noise.next()
      if (p.bed === 'pink') {
        this.pinkLp += this.pinkA * (this.noise.pink - this.pinkLp)
        bedS = this.pinkLp * 2
      } else if (p.bed === 'rain') {
        // Ruido blanco entre 300 y 2500 Hz, con una deriva lenta de volumen.
        const w = this.noise.white
        this.rainLow += this.rainLowA * (w - this.rainLow)
        const band = w - this.rainLow
        this.rainLp += this.rainHighA * (band - this.rainLp)
        const mod = 0.75 + 0.25 * this.drift.tick((TWO_PI * RAIN_DRIFT_HZ) / fs)
        bedS = this.rainLp * 3 * mod
      } else {
        bedS = 0.4 * this.droneA.tick((TWO_PI * 110) / fs) + 0.25 * this.droneB.tick((TWO_PI * 165) / fs)
      }
      bedS *= p.bedGain * bed
    }

    this.outL = clip1((fgL + bgL + bedS) * this.fade)
    this.outR = clip1((fgR + bgR + bedS) * this.fade)
  }

  private stepFade(): void {
    if (this.fade < this.fadeTarget) this.fade = Math.min(this.fadeTarget, this.fade + this.fadeStep)
    else if (this.fade > this.fadeTarget) this.fade = Math.max(this.fadeTarget, this.fade - this.fadeStep)
    if (this.stopping && this.fade <= 0 && !this.ended) {
      this.ended = true
      this.onStopped?.()
    }
  }
}

function clip1(x: number): number {
  return x > 1 ? 1 : x < -1 ? -1 : x
}
