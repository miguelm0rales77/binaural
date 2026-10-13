import { breathStateInto, type BreathPattern, type BreathState } from './breath'
import { IsoEnvelope } from './envelope'
import { loudnessCompGain } from './loudness'
import { ForestGen, RainGen, RiverGen, StormGen, WindGen, type NatureGen } from './nature'
import { NoiseGenerator } from './noise'
import { Oscillator, TWO_PI } from './oscillator'
import { MASTER_CEILING, NATURE_TYPES, sanitizeParams } from './params'
import { evalProgram, type ProgramValue } from './program'
import { Smoother } from './smoothing'
import { DEFAULT_PARAMS, type EngineParams, type Program } from './types'

/** Muestras por paso de control (parámetros lentos: programa, temporizador, compensación). */
const CONTROL_BLOCK = 128

const TAU_GAIN = 0.05 // s
const TAU_USER_FREQ = 2 // s, cambios de beat/portadora hechos por el usuario
const TAU_PROGRAM_FREQ = 0.25 // s, el programa ya interpola; solo evita saltos al empezar

// Señales del metrónomo de respiración (Bloque B)
const TAU_BREATH_LUNG = 0.05 // s, suaviza el pulmón usado por las señales (evita saltos al cambiar el patrón)
const TAU_CUE_FLAG = 0.05 // s, activación de cada señal
const BREATH_FADE_USER_SEC = 0.5 // s, al activar o desactivar el metrónomo
const BREATH_FADE_TIMED_SEC = 30 // s, fundido al cumplirse maxSec
const GUIDE_GAIN = 0.126 // −18 dB respecto al tono
const GUIDE_F_LO = 220
const GUIDE_F_HI = 330
const CHIME_AMP = 0.2
const CHIME_TAU = 1.2 / Math.log(1000) // s; la nota cae 60 dB en 1,2 s
const CHIME_MAX_AGE = 3 // s, a partir de aquí la campanilla ya no suena
const CHIME_HI = 660 // inspiración
const CHIME_LO = 440 // espiración
const SWELL_NONE_GAIN = 0.4 // el oleaje sin ruido usa rosa a este nivel relativo
const SWELL_LP_LO = 400 // Hz, pulmones vacíos
const SWELL_LP_HI = 2500 // Hz, pulmones llenos

export interface EngineOptions {
  /** Fuente de aleatoriedad (inyectable para tests deterministas). */
  rand?: () => number
  /** Duración del fundido de entrada y de salida. 0 = sin fundido. Por defecto 8 s. */
  fadeSec?: number
  /** Techo del volumen general. Por defecto 0,8; los tests de ganancia máxima usan 1. */
  masterCeiling?: number
  /** false = salida sin el tanh final (solo para la exportación de bucles, que mezcla dos renders y aplica el tanh una vez). */
  softClip?: boolean
}

export interface EngineState {
  playing: boolean
  elapsedSec: number
  /** Segundos que quedan hasta el fin de sesión (temporizador o programa); null si no hay límite. */
  remainingSec: number | null
  beatHz: number
  carrierHz: number
  /** Instante del reloj de la sesión (s desde el inicio) en el que la respiración vale fase 0. */
  breathOriginSec: number
}

type RunState = 'idle' | 'running' | 'stopping'

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

function samePattern(a: BreathPattern, b: BreathPattern): boolean {
  return (
    a.rpm === b.rpm &&
    a.inhaleRatio === b.inhaleRatio &&
    a.holdInSec === b.holdInSec &&
    a.holdOutSec === b.holdOutSec &&
    a.rampFromRpm === b.rampFromRpm &&
    a.rampSec === b.rampSec
  )
}

const phaseIndex = (ph: BreathState['phase']): number =>
  ph === 'in' ? 0 : ph === 'holdIn' ? 1 : ph === 'out' ? 2 : 3

/**
 * Núcleo DSP único: lo usan el worklet (tiempo real), la exportación WAV y los tests.
 * No usa ninguna API del navegador ni reserva memoria en `renderBlock`.
 */
export class DspEngine {
  /** Se llama una vez cuando termina el fundido de salida. */
  onStopped: (() => void) | null = null

  private params: EngineParams
  private readonly masterCeiling: number
  private readonly softClip: boolean
  private runState: RunState = 'idle'
  private elapsed = 0
  private fade = 0
  private readonly fadeStep: number
  private readonly invFs: number

  private program: Program | null = null
  private programStart = 0
  private readonly programValue: ProgramValue = { beatHz: 0 }
  private programOrigin = 0 // elapsed en el que empezó el programa actual
  private sessionLen: number | null = null
  private sessionDeadline: number | null = null

  private readonly carrier: Smoother
  private readonly beat: Smoother
  private readonly depth: Smoother
  private readonly toneGain: Smoother
  private readonly noiseGain: Smoother
  private readonly masterGain: Smoother
  private readonly comp: Smoother
  private readonly wBin: Smoother
  private readonly wMon: Smoother
  private readonly wIso: Smoother
  private readonly wWhite: Smoother
  private readonly wPink: Smoother
  private readonly wBrown: Smoother
  /** Pesos y generadores de los sonidos de la naturaleza, en el orden de NATURE_TYPES. */
  private readonly wNature: Smoother[]
  private readonly nature: NatureGen[]
  private readonly wNone: Smoother

  private readonly oscA = new Oscillator()
  private readonly oscB = new Oscillator()
  private readonly oscC = new Oscillator()
  private readonly iso = new IsoEnvelope()
  private readonly noise: NoiseGenerator

  // Metrónomo de respiración
  private readonly bs: BreathState = { phase: 'in', phaseProgress: 0, lung: 0, cycleIndex: 0 }
  private breathOrigin = 0 // s del reloj de la sesión donde empieza la fase 0
  private breathTarget = 0 // 1 = señales activas, 0 = apagadas o caducadas
  private breathLevel = 0 // fundido de las señales, 0–1
  private breathExpired = false
  private readonly breathStepUser: number
  private readonly breathStepTimed: number
  private readonly lungS: Smoother
  private readonly swellFlag: Smoother
  private readonly guideFlag: Smoother
  private readonly guideOsc = new Oscillator()
  private readonly chimeA = new Oscillator()
  private readonly chimeB = new Oscillator()
  private chimeAge = Infinity
  private chimeF = CHIME_HI
  private lastBreathKey = -1
  private swellLp = 0
  // Salidas de `breathSample` para la muestra en curso (sin reservar memoria)
  private cueLung = 0
  private cueSwell = 0
  private cueGuide = 0
  private cueChime = 0

  readonly fs: number

  constructor(fs: number, initial: Partial<EngineParams> = {}, opts: EngineOptions = {}) {
    this.fs = fs
    this.masterCeiling = opts.masterCeiling ?? MASTER_CEILING
    this.softClip = opts.softClip ?? true
    this.params = sanitizeParams({ ...DEFAULT_PARAMS }, initial, this.masterCeiling)
    this.invFs = 1 / fs
    const fadeSec = opts.fadeSec ?? 8
    this.fadeStep = fadeSec > 0 ? 1 / (fadeSec * fs) : 1
    const rand = opts.rand ?? Math.random
    this.noise = new NoiseGenerator(rand)
    this.nature = [
      new RainGen(rand, fs, 0.6),
      new WindGen(rand, fs),
      new StormGen(rand, fs),
      new RiverGen(rand, fs),
      new ForestGen(rand, fs),
    ]
    this.wNature = NATURE_TYPES.map(() => new Smoother(0, TAU_GAIN, fs))
    this.wNone = new Smoother(0, TAU_GAIN, fs)
    this.breathStepUser = this.invFs / BREATH_FADE_USER_SEC
    this.breathStepTimed = this.invFs / BREATH_FADE_TIMED_SEC
    this.lungS = new Smoother(0, TAU_BREATH_LUNG, fs)
    this.swellFlag = new Smoother(0, TAU_CUE_FLAG, fs)
    this.guideFlag = new Smoother(0, TAU_CUE_FLAG, fs)

    const p = this.params
    this.carrier = new Smoother(p.carrierHz, TAU_USER_FREQ, fs)
    this.beat = new Smoother(p.beatHz, TAU_USER_FREQ, fs)
    this.depth = new Smoother(p.isoDepth, TAU_GAIN, fs)
    this.toneGain = new Smoother(p.toneGain, TAU_GAIN, fs)
    this.noiseGain = new Smoother(p.noiseGain, TAU_GAIN, fs)
    this.masterGain = new Smoother(p.masterGain, TAU_GAIN, fs)
    this.comp = new Smoother(p.loudnessComp ? loudnessCompGain(p.carrierHz) : 1, TAU_GAIN, fs)
    this.wBin = new Smoother(0, TAU_GAIN, fs)
    this.wMon = new Smoother(0, TAU_GAIN, fs)
    this.wIso = new Smoother(0, TAU_GAIN, fs)
    this.wWhite = new Smoother(0, TAU_GAIN, fs)
    this.wPink = new Smoother(0, TAU_GAIN, fs)
    this.wBrown = new Smoother(0, TAU_GAIN, fs)
    this.applyDiscrete()
    for (const w of this.allWeights()) w.snap(w.target)
  }

  private allWeights(): Smoother[] {
    return [this.wBin, this.wMon, this.wIso, this.wWhite, this.wPink, this.wBrown, this.wNone, ...this.wNature]
  }

  /** Modo y tipo de ruido: pesos one-hot que se suavizan para cambiar sin clics. */
  private applyDiscrete(): void {
    const m = this.params.mode
    this.wBin.target = m === 'binaural' ? 1 : 0
    this.wMon.target = m === 'monaural' ? 1 : 0
    this.wIso.target = m === 'isochronic' ? 1 : 0
    const n = this.params.noiseType
    this.wWhite.target = n === 'white' ? 1 : 0
    this.wPink.target = n === 'pink' ? 1 : 0
    this.wBrown.target = n === 'brown' ? 1 : 0
    this.wNone.target = n === 'none' ? 1 : 0
    NATURE_TYPES.forEach((t, i) => ((this.wNature[i] as Smoother).target = n === t ? 1 : 0))
    this.swellFlag.target = this.params.breath.cues.swell ? 1 : 0
    this.guideFlag.target = this.params.breath.cues.guideTone ? 1 : 0
  }

  private setFreqTau(tau: number): void {
    this.carrier.setTau(tau, this.fs)
    this.beat.setTau(tau, this.fs)
  }

  /**
   * Cambia parámetros con suavizado. Si el usuario toca beatHz o carrierHz
   * mientras corre un programa, el programa se cancela.
   */
  setParams(patch: Partial<EngineParams>): void {
    const prevBreath = this.params.breath
    this.params = sanitizeParams(this.params, patch, this.masterCeiling)
    const p = this.params
    // Al activar el metrónomo o cambiar su patrón mientras suena, el reloj empieza de nuevo desde fase 0.
    if (
      this.runState !== 'idle' &&
      ((p.breath.enabled && !prevBreath.enabled) || !samePattern(prevBreath.pattern, p.breath.pattern))
    ) {
      this.breathOrigin = this.elapsed
    }
    if (this.program && (patch.beatHz !== undefined || patch.carrierHz !== undefined)) {
      this.program = null
      this.setFreqTau(TAU_USER_FREQ)
    }
    if (!this.program) {
      this.carrier.target = p.carrierHz
      this.beat.target = p.beatHz
    }
    this.depth.target = p.isoDepth
    this.toneGain.target = p.toneGain
    this.noiseGain.target = p.noiseGain
    this.masterGain.target = p.masterGain
    this.applyDiscrete()
  }

  /** Programa de frecuencias; `startAtSec` es el instante del programa en que se empieza. */
  setProgram(program: Program | null, startAtSec = 0): void {
    this.program = program
    this.programStart = startAtSec
    this.programOrigin = this.runState === 'idle' ? 0 : this.elapsed
    this.setFreqTau(program ? TAU_PROGRAM_FREQ : TAU_USER_FREQ)
    if (!program) {
      this.carrier.target = this.params.carrierHz
      this.beat.target = this.params.beatHz
    }
  }

  /**
   * Temporizador de sesión: dura `sec` segundos desde que se fija (o desde `start()` si está parado);
   * al cumplirse empieza el fundido de salida. null = sin límite.
   */
  setSessionTimer(sec: number | null): void {
    this.sessionLen = sec
    this.sessionDeadline = sec === null ? null : this.runState === 'idle' ? sec : this.elapsed + sec
  }

  private programTime(): number {
    return this.programStart + this.elapsed - this.programOrigin
  }

  start(): void {
    if (this.runState === 'idle') {
      this.fade = 0
      this.elapsed = 0
      this.programOrigin = 0
      this.sessionDeadline = this.sessionLen
      this.breathOrigin = 0
      this.breathExpired = false
      this.lastBreathKey = -1
      this.chimeAge = Infinity
      this.swellLp = 0
      this.snapSmoothers()
    }
    this.runState = 'running'
  }

  /** Parado no suena, así que los cambios hechos en reposo se aplican de golpe al arrancar. */
  private snapSmoothers(): void {
    const p = this.params
    const prog = this.program
    const v = prog ? evalProgram(prog, this.programStart, this.programValue) : null
    this.beat.snap(clamp(v ? v.beatHz : p.beatHz, 0.5, 40))
    this.carrier.snap(clamp(v?.carrierHz ?? p.carrierHz, 100, 1000))
    this.depth.snap(p.isoDepth)
    this.toneGain.snap(p.toneGain)
    this.noiseGain.snap(p.noiseGain)
    this.masterGain.snap(p.masterGain)
    this.comp.snap(p.loudnessComp ? loudnessCompGain(this.carrier.value) : 1)
    for (const w of this.allWeights()) w.snap(w.target)
    this.breathTarget = p.breath.enabled ? 1 : 0
    this.breathLevel = this.breathTarget
    this.lungS.snap(0)
    this.swellFlag.snap(p.breath.cues.swell ? 1 : 0)
    this.guideFlag.snap(p.breath.cues.guideTone ? 1 : 0)
  }

  stop(): void {
    if (this.runState === 'running') this.runState = 'stopping'
  }

  getState(): EngineState {
    const playing = this.runState !== 'idle'
    let remaining: number | null = null
    if (playing) {
      if (this.sessionDeadline !== null) remaining = this.sessionDeadline - this.elapsed
      if (this.program) {
        const r = this.program.durationSec - this.programTime()
        remaining = remaining === null ? r : Math.min(remaining, r)
      }
    }
    return {
      playing,
      elapsedSec: this.elapsed,
      remainingSec: remaining === null ? null : Math.max(0, remaining),
      beatHz: this.beat.value,
      carrierHz: this.carrier.value,
      breathOriginSec: this.breathOrigin,
    }
  }

  renderBlock(outL: Float32Array, outR: Float32Array, n: number): void {
    let i = 0
    while (i < n) {
      const m = Math.min(CONTROL_BLOCK, n - i)
      this.updateControl()
      this.renderChunk(outL, outR, i, m)
      i += m
    }
  }

  private updateControl(): void {
    if (this.runState === 'idle') return
    if (this.runState === 'running') {
      if (
        (this.sessionDeadline !== null && this.elapsed >= this.sessionDeadline) ||
        (this.program && this.programTime() >= this.program.durationSec)
      ) {
        this.runState = 'stopping'
      }
    }
    if (this.program) {
      const v = evalProgram(this.program, this.programTime(), this.programValue)
      this.beat.target = clamp(v.beatHz, 0.5, 40)
      if (v.carrierHz !== undefined) this.carrier.target = clamp(v.carrierHz, 100, 1000)
    }
    // Compensación de sonoridad: se recalcula por bloque con la portadora actual.
    this.comp.target = this.params.loudnessComp ? loudnessCompGain(this.carrier.value) : 1
    const br = this.params.breath
    this.breathExpired = br.maxSec !== null && this.elapsed - this.breathOrigin >= br.maxSec
    this.breathTarget = br.enabled && !this.breathExpired ? 1 : 0
  }

  /**
   * Metrónomo de respiración para la muestra de instante `t` (reloj de la sesión). Calcula el pulmón
   * (suavizado), el fundido de las señales y las señales en sí: oleaje (ganancia del ruido), tono guía y
   * campanilla. Las campanillas se disparan en cada cambio de fase, con precisión de muestra.
   */
  private breathSample(t: number): void {
    const br = this.params.breath
    breathStateInto(this.bs, t - this.breathOrigin, br.pattern)
    this.lungS.target = this.bs.lung
    const lung = this.lungS.next()
    this.cueLung = lung

    const dir = this.breathTarget - this.breathLevel
    const step = this.breathExpired ? this.breathStepTimed : this.breathStepUser
    this.breathLevel += dir > 0 ? Math.min(dir, step) : Math.max(dir, -step)
    const level = this.breathLevel

    const key = this.bs.cycleIndex * 4 + phaseIndex(this.bs.phase)
    if (key !== this.lastBreathKey) {
      this.lastBreathKey = key
      if (this.breathTarget === 1 && br.cues.chime) {
        this.chimeAge = 0
        this.chimeF = this.bs.phase === 'in' || this.bs.phase === 'holdIn' ? CHIME_HI : CHIME_LO
        this.chimeA.phase = 0
        this.chimeB.phase = 0
      }
    }
    let chime = 0
    if (this.chimeAge < CHIME_MAX_AGE) {
      this.chimeAge += this.invFs
      const env = Math.exp(-this.chimeAge / CHIME_TAU) * Math.min(1, this.chimeAge / 0.005)
      const x = this.chimeA.tick(TWO_PI * this.chimeF * this.invFs)
      const y = this.chimeB.tick(TWO_PI * 2 * this.chimeF * this.invFs)
      chime = (x + 0.3 * y) * env * CHIME_AMP
    }
    this.cueChime = chime * this.toneGain.value

    const guideOn = this.guideFlag.next() * level
    const guide = this.guideOsc.tick(TWO_PI * (GUIDE_F_LO + (GUIDE_F_HI - GUIDE_F_LO) * lung) * this.invFs)
    this.cueGuide = guide * guideOn * GUIDE_GAIN
    this.cueSwell = this.swellFlag.next() * level
  }

  private renderChunk(outL: Float32Array, outR: Float32Array, start: number, m: number): void {
    const end = start + m
    for (let i = start; i < end; i++) {
      if (this.runState === 'idle') {
        outL[i] = 0
        outR[i] = 0
        continue
      }
      if (this.runState === 'running') {
        this.fade = Math.min(1, this.fade + this.fadeStep)
      } else {
        this.fade = Math.max(0, this.fade - this.fadeStep)
        if (this.fade === 0) {
          this.runState = 'idle'
          outL[i] = 0
          outR[i] = 0
          this.onStopped?.()
          continue
        }
      }

      const fc = this.carrier.next()
      const bt = this.beat.next()
      const a = this.oscA.tick(TWO_PI * (fc - bt * 0.5) * this.invFs)
      const b = this.oscB.tick(TWO_PI * (fc + bt * 0.5) * this.invFs)
      const c = this.oscC.tick(TWO_PI * fc * this.invFs)
      const env = this.iso.tick(bt * this.invFs, this.depth.next())
      const wb = this.wBin.next()
      const wm = this.wMon.next()
      const wi = this.wIso.next()
      const mono = 0.5 * (a + b)
      const isoSig = c * env
      const toneG = this.toneGain.next() * this.comp.next()
      this.breathSample(this.elapsed + (i - start) * this.invFs)
      const toneL = (wb * a + wm * mono + wi * isoSig) * toneG + this.cueGuide * toneG + this.cueChime
      const toneR = (wb * b + wm * mono + wi * isoSig) * toneG + this.cueGuide * toneG + this.cueChime

      this.noise.next()
      const sg = this.cueSwell
      const lung = this.cueLung
      const g = 0.6 + 0.4 * lung // el oleaje sube de ×0.6 a ×1.0
      const wP = this.wPink.next()
      const wB = this.wBrown.next()
      const wW = this.wWhite.next()
      const wN = this.wNone.next()
      let natureSum = 0
      for (let k = 0; k < 5; k++) {
        const w = (this.wNature[k] as Smoother).next()
        if (w > 1e-4) natureSum += w * (this.nature[k] as NatureGen).next()
      }
      // Ruido del usuario: blanco y naturaleza solo cambian de ganancia con el oleaje; rosa y marrón
      // además pasan por un paso bajo que se abre con el pulmón. Sin oleaje, la suma es la de siempre.
      const direct = wW * this.noise.white + natureSum
      const lpIn = wP * this.noise.pink + wB * this.noise.brown
      const swellIn = lpIn + wN * SWELL_NONE_GAIN * this.noise.pink // sin ruido elegido: rosa solo para el oleaje
      const lpHz = SWELL_LP_LO + (SWELL_LP_HI - SWELL_LP_LO) * lung
      this.swellLp += (1 - Math.exp(-TWO_PI * lpHz * this.invFs)) * (swellIn - this.swellLp)
      const bg =
        direct * (1 - sg + sg * g) + lpIn * (1 - sg) + sg * g * this.swellLp
      const nz = bg * this.noiseGain.next()

      const scale = 0.5 * this.fade * this.masterGain.next()
      const mixL = (toneL + nz) * scale
      const mixR = (toneR + nz) * scale
      outL[i] = this.softClip ? Math.tanh(mixL) : mixL
      outR[i] = this.softClip ? Math.tanh(mixR) : mixR
    }
    if (this.runState !== 'idle') this.elapsed += m * this.invFs
  }
}
