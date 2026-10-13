import {
  DEFAULT_BREATH_PATTERN,
  breathStateInto,
  phaseIndex,
  type BreathPattern,
  type BreathState,
} from './breath'
import { IsoEnvelope } from './envelope'
import { loudnessCompGain } from './loudness'
import { BowlsGen, GongGen } from './meditation'
import { ForestGen, RainGen, RiverGen, StormGen, WindGen, type NatureGen } from './nature'
import { NoiseGenerator } from './noise'
import { Oscillator, TWO_PI } from './oscillator'
import { GENERATED_TYPES, MASTER_CEILING, sanitizeParams } from './params'
import { evalProgram, type ProgramValue } from './program'
import { Smoother } from './smoothing'
import { DEFAULT_PARAMS, type EngineParams, type Program } from './types'

/** Muestras por paso de control (parámetros lentos: programa, temporizador, compensación). */
const CONTROL_BLOCK = 128

/** Número de fondos sintetizados (naturaleza + meditación). */
const GENERATED_COUNT = GENERATED_TYPES.length

const TAU_GAIN = 0.05 // s
const TAU_USER_FREQ = 2 // s, cambios de beat/portadora hechos por el usuario
const TAU_PROGRAM_FREQ = 0.25 // s, el programa ya interpola; solo evita saltos al empezar

// Respiración (Bloque B). Todo se calcula en el motor, con precisión de muestra.
const TAU_LUNG = 0.03 // s, suaviza el llenado pulmonar para que un cambio de patrón no haga clic
const SWELL_MIN = 0.6 // el oleaje sube de ×0,6 (pulmones vacíos) a ×1,0 (llenos)
const SWELL_CUT_MIN_HZ = 400 // corte del filtro del oleaje con los pulmones vacíos…
const SWELL_CUT_MAX_HZ = 2500 // …y con los pulmones llenos
const SWELL_FALLBACK = 0.15 // ruido rosa a volumen bajo para el oleaje cuando el fondo está en «ninguno»
const GUIDE_LEVEL = 0.1259 // −18 dB respecto al tono
const GUIDE_MIN_HZ = 220 // tono guía: 220 Hz con los pulmones vacíos…
const GUIDE_MAX_HZ = 330 // …330 Hz con los pulmones llenos
const CHIME_AMP = 0.25
const CHIME_DECAY = 5 // 1/s: la nota cae a ~0,3 % en 1,2 s
const CHIME_FLOOR = 1e-4
const CHIME_HIGH_HZ = 660 // al inspirar (y al mantener tras inspirar)
const CHIME_LOW_HZ = 440 // al espirar (y al mantener tras espirar)

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
  /** Pesos y generadores de los fondos sintetizados (naturaleza y meditación), en el orden de GENERATED_TYPES. */
  private readonly wNature: Smoother[]
  private readonly nature: NatureGen[]

  // Respiración: pesos de las señales (0 o 1, suavizados) y estado del reloj.
  private breathOn = false
  private chimeOn = false
  private breathPattern: BreathPattern = DEFAULT_BREATH_PATTERN
  private readonly breathNow: BreathState = { phase: 'in', phaseProgress: 0, lung: 0, cycleIndex: 0 }
  private readonly lungSmooth: Smoother
  private readonly wSwell: Smoother
  private readonly wGuide: Smoother
  private readonly wFallback: Smoother
  private lastPhaseId = -1
  private lpState = 0
  private readonly chimeCoef: number
  private chimeEnv = 0
  private chimeInc = 0 // 2π·f/fs de la nota en curso
  private readonly chimeA = new Oscillator()
  private readonly chimeB = new Oscillator() // segundo armónico, a la mitad de amplitud

  private readonly oscA = new Oscillator()
  private readonly oscB = new Oscillator()
  private readonly oscC = new Oscillator()
  private readonly oscGuide = new Oscillator()
  private readonly iso = new IsoEnvelope()
  private readonly noise: NoiseGenerator

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
      new BowlsGen(rand, fs),
      new GongGen(rand, fs),
    ]
    this.wNature = GENERATED_TYPES.map(() => new Smoother(0, TAU_GAIN, fs))
    this.lungSmooth = new Smoother(0, TAU_LUNG, fs)
    this.wSwell = new Smoother(0, TAU_GAIN, fs)
    this.wGuide = new Smoother(0, TAU_GAIN, fs)
    this.wFallback = new Smoother(0, TAU_GAIN, fs)
    this.chimeCoef = Math.exp(-CHIME_DECAY * this.invFs)

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
    this.applyBreath()
    for (const w of this.allWeights()) w.snap(w.target)
  }

  /** Arranca una nota de campanilla desde fase cero (empieza sin salto) y cae sola. */
  private startChime(hz: number): void {
    this.chimeEnv = 1
    this.chimeInc = TWO_PI * hz * this.invFs
    this.chimeA.phase = 0
    this.chimeB.phase = 0
  }

  private allWeights(): Smoother[] {
    return [
      this.wBin,
      this.wMon,
      this.wIso,
      this.wWhite,
      this.wPink,
      this.wBrown,
      ...this.wNature,
      this.wSwell,
      this.wGuide,
      this.wFallback,
    ]
  }

  /** Respiración: interruptor, patrón y señales. Sin respiración, las señales se apagan y no cambia nada del audio. */
  private applyBreath(): void {
    const b = this.params.breath
    this.breathOn = b.enabled
    this.chimeOn = b.enabled && b.cues.chime
    this.breathPattern = b.pattern
    // Sin respiración no hay fase que comparar: al volver a activarla, la primera fase vuelve a sonar.
    if (!this.breathOn) this.lastPhaseId = -1
    this.wSwell.target = this.breathOn && b.cues.swell ? 1 : 0
    this.wGuide.target = this.breathOn && b.cues.guideTone ? 1 : 0
    this.wFallback.target = this.breathOn && b.cues.swell && this.params.noiseType === 'none' ? 1 : 0
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
    GENERATED_TYPES.forEach((t, i) => ((this.wNature[i] as Smoother).target = n === t ? 1 : 0))
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
    this.params = sanitizeParams(this.params, patch, this.masterCeiling)
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
    this.applyBreath()
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
      this.lastPhaseId = -1
      this.sessionDeadline = this.sessionLen
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

      // Respiración: el reloj se evalúa muestra a muestra (la campanilla debe caer en el cambio de fase).
      if (this.breathOn) {
        const br = breathStateInto(this.breathNow, this.elapsed + (i - start) * this.invFs, this.breathPattern)
        const id = br.cycleIndex * 4 + phaseIndex(br.phase)
        if (id !== this.lastPhaseId) {
          this.lastPhaseId = id
          if (this.chimeOn) this.startChime(br.phase === 'in' || br.phase === 'holdIn' ? CHIME_HIGH_HZ : CHIME_LOW_HZ)
        }
        this.lungSmooth.target = br.lung
      }
      const lung = this.lungSmooth.next()

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
      // Tono guía: sube de 220 a 330 Hz al inspirar y baja al espirar (−18 dB respecto al tono).
      const guide =
        this.wGuide.next() *
        GUIDE_LEVEL *
        this.oscGuide.tick(TWO_PI * (GUIDE_MIN_HZ + (GUIDE_MAX_HZ - GUIDE_MIN_HZ) * lung) * this.invFs)
      const toneG = this.toneGain.next() * this.comp.next()
      const toneL = (wb * a + wm * mono + wi * isoSig + guide) * toneG
      const toneR = (wb * b + wm * mono + wi * isoSig + guide) * toneG

      this.noise.next()
      const g = this.noiseGain.next()
      const sw = this.wSwell.next()
      // Ruido rosa/marrón (y el rosa de respaldo del oleaje) pasa por un filtro de un polo cuyo corte sigue a los pulmones.
      const fallback = this.wFallback.next() * SWELL_FALLBACK * this.noise.pink
      const colored = (this.wPink.next() * this.noise.pink + this.wBrown.next() * this.noise.brown) * g + fallback
      const cut = SWELL_CUT_MIN_HZ + (SWELL_CUT_MAX_HZ - SWELL_CUT_MIN_HZ) * lung
      this.lpState += (1 - Math.exp(-TWO_PI * cut * this.invFs)) * (colored - this.lpState)
      const color = colored + sw * (this.lpState - colored)
      let core = this.wWhite.next() * this.noise.white
      for (let k = 0; k < GENERATED_COUNT; k++) {
        const w = (this.wNature[k] as Smoother).next()
        if (w > 1e-4) core += w * (this.nature[k] as NatureGen).next()
      }
      // Oleaje: el fondo sube de ×0,6 a ×1,0 con los pulmones (sin cambios cuando el oleaje está apagado).
      const swell = 1 - sw + sw * (SWELL_MIN + (1 - SWELL_MIN) * lung)
      const nz = (core * g + color) * swell

      // Campanilla: una nota breve que cae sola (se suma antes del volumen general).
      let chime = 0
      if (this.chimeEnv > CHIME_FLOOR) {
        chime = this.chimeEnv * (this.chimeA.tick(this.chimeInc) + 0.25 * this.chimeB.tick(2 * this.chimeInc)) * CHIME_AMP
        this.chimeEnv *= this.chimeCoef
      }

      const scale = 0.5 * this.fade * this.masterGain.next()
      const mixL = (toneL + nz + chime) * scale
      const mixR = (toneR + nz + chime) * scale
      outL[i] = this.softClip ? Math.tanh(mixL) : mixL
      outR[i] = this.softClip ? Math.tanh(mixR) : mixR
    }
    if (this.runState !== 'idle') this.elapsed += m * this.invFs
  }
}
