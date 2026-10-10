import { IsoEnvelope } from './envelope'
import { loudnessCompGain } from './loudness'
import { NoiseGenerator } from './noise'
import { Oscillator, TWO_PI } from './oscillator'
import { evalProgram, type ProgramValue } from './program'
import { Smoother } from './smoothing'
import { DEFAULT_PARAMS, type EngineParams, type Program } from './types'

/** Muestras por paso de control (parámetros lentos: programa, temporizador, compensación). */
const CONTROL_BLOCK = 128

const TAU_GAIN = 0.05 // s
const TAU_USER_FREQ = 2 // s, cambios de beat/portadora hechos por el usuario
const TAU_PROGRAM_FREQ = 0.25 // s, el programa ya interpola; solo evita saltos al empezar

export interface EngineOptions {
  /** Fuente de aleatoriedad (inyectable para tests deterministas). */
  rand?: () => number
  /** Duración del fundido de entrada y de salida. 0 = sin fundido. Por defecto 8 s. */
  fadeSec?: number
}

export interface EngineState {
  playing: boolean
  elapsedSec: number
  beatHz: number
  carrierHz: number
}

type RunState = 'idle' | 'running' | 'stopping'

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/**
 * Núcleo DSP único: lo usan el worklet (tiempo real), la exportación WAV y los tests.
 * No usa ninguna API del navegador ni reserva memoria en `renderBlock`.
 */
export class DspEngine {
  /** Se llama una vez cuando termina el fundido de salida. */
  onStopped: (() => void) | null = null

  private params: EngineParams
  private runState: RunState = 'idle'
  private elapsed = 0
  private fade = 0
  private readonly fadeStep: number
  private readonly invFs: number

  private program: Program | null = null
  private programStart = 0
  private readonly programValue: ProgramValue = { beatHz: 0 }
  private sessionSec: number | null = null

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

  private readonly oscA = new Oscillator()
  private readonly oscB = new Oscillator()
  private readonly oscC = new Oscillator()
  private readonly iso = new IsoEnvelope()
  private readonly noise: NoiseGenerator

  readonly fs: number

  constructor(fs: number, initial: Partial<EngineParams> = {}, opts: EngineOptions = {}) {
    this.fs = fs
    this.params = DspEngine.sanitize({ ...DEFAULT_PARAMS }, initial)
    this.invFs = 1 / fs
    const fadeSec = opts.fadeSec ?? 8
    this.fadeStep = fadeSec > 0 ? 1 / (fadeSec * fs) : 1
    this.noise = new NoiseGenerator(opts.rand)

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
    for (const w of [this.wBin, this.wMon, this.wIso, this.wWhite, this.wPink, this.wBrown]) {
      w.snap(w.target)
    }
  }

  private static sanitize(base: EngineParams, patch: Partial<EngineParams>): EngineParams {
    const p = { ...base, ...patch }
    p.carrierHz = clamp(p.carrierHz, 100, 1000)
    p.beatHz = clamp(p.beatHz, 0.5, 40)
    p.isoDepth = clamp(p.isoDepth, 0.5, 0.98)
    p.toneGain = clamp(p.toneGain, 0, 1)
    p.noiseGain = clamp(p.noiseGain, 0, 1)
    p.masterGain = clamp(p.masterGain, 0, 1)
    return p
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
    this.params = DspEngine.sanitize(this.params, patch)
    const p = this.params
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
    this.setFreqTau(program ? TAU_PROGRAM_FREQ : TAU_USER_FREQ)
    if (!program) {
      this.carrier.target = this.params.carrierHz
      this.beat.target = this.params.beatHz
    }
  }

  /** Temporizador de sesión: al cumplirse empieza el fundido de salida. null = sin límite. */
  setSessionTimer(sec: number | null): void {
    this.sessionSec = sec
  }

  start(): void {
    if (this.runState === 'idle') {
      this.fade = 0
      this.elapsed = 0
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
    for (const w of [this.wBin, this.wMon, this.wIso, this.wWhite, this.wPink, this.wBrown]) {
      w.snap(w.target)
    }
  }

  stop(): void {
    if (this.runState === 'running') this.runState = 'stopping'
  }

  getState(): EngineState {
    return {
      playing: this.runState !== 'idle',
      elapsedSec: this.elapsed,
      beatHz: this.beat.value,
      carrierHz: this.carrier.value,
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
      const progT = this.programStart + this.elapsed
      if (
        (this.sessionSec !== null && this.elapsed >= this.sessionSec) ||
        (this.program && progT >= this.program.durationSec)
      ) {
        this.runState = 'stopping'
      }
    }
    if (this.program) {
      const v = evalProgram(this.program, this.programStart + this.elapsed, this.programValue)
      this.beat.target = clamp(v.beatHz, 0.5, 40)
      if (v.carrierHz !== undefined) this.carrier.target = clamp(v.carrierHz, 100, 1000)
    }
    // Compensación de sonoridad: se recalcula por bloque con la portadora actual.
    this.comp.target = this.params.loudnessComp ? loudnessCompGain(this.carrier.value) : 1
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
      const toneL = (wb * a + wm * mono + wi * isoSig) * toneG
      const toneR = (wb * b + wm * mono + wi * isoSig) * toneG

      this.noise.next()
      const nz =
        (this.wWhite.next() * this.noise.white +
          this.wPink.next() * this.noise.pink +
          this.wBrown.next() * this.noise.brown) *
        this.noiseGain.next()

      const scale = 0.5 * this.fade * this.masterGain.next()
      outL[i] = Math.tanh((toneL + nz) * scale)
      outR[i] = Math.tanh((toneR + nz) * scale)
    }
    if (this.runState !== 'idle') this.elapsed += m * this.invFs
  }
}
