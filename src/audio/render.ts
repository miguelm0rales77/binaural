/**
 * Renderizado offline con el mismo `DspEngine` que suena en la app. TypeScript puro (sin APIs del
 * navegador): lo usa el Web Worker de exportación y se prueba en Node.
 */
import { DspEngine } from '../dsp/engine'
import { mulberry32 } from '../dsp/noise'
import type { EngineParams, Program } from '../dsp/types'
import { toInt16, wavHeader } from './wav'

export const EXPORT_SAMPLE_RATE = 44100
export const MAX_EXPORT_SECONDS = 60 * 60
export const MIN_EXPORT_SECONDS = 1
export const LOOP_SECONDS = 300
export const CROSSFADE_SECONDS = 3
export const FADE_SECONDS = 8
const CHUNK_SECONDS = 10

export interface SessionJob {
  kind: 'session'
  params: EngineParams
  program: Program | null
  seconds: number
  sampleRate?: number
}

export interface LoopJob {
  kind: 'loop'
  params: EngineParams
  loopSec?: number
  crossfadeSec?: number
  sampleRate?: number
}

export type ExportJob = SessionJob | LoopJob

export interface RenderOptions {
  /** Fuente de aleatoriedad para sesiones (tests deterministas). */
  rand?: () => number
  /** Semilla para bucles: el fondo usa mulberry32(seed) y el tono otro generador independiente. */
  seed?: number
  chunkSeconds?: number
  /** Si devuelve true, se interrumpe y la función lanza 'cancelled'. */
  shouldCancel?: () => boolean
}

export interface RenderOutput {
  header: Uint8Array
  /** Solo en bucles: fotogramas iniciales (con el cierre fundido), van justo detrás de la cabecera. */
  head: Int16Array | null
  frames: number
  sampleRate: number
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export function clampSeconds(seconds: number): number {
  return clamp(Number.isFinite(seconds) ? seconds : MIN_EXPORT_SECONDS, MIN_EXPORT_SECONDS, MAX_EXPORT_SECONDS)
}

/**
 * Ajusta portadora y pulso para que cada oscilador dé un número entero de ciclos en `T` segundos
 * (la fase al final coincide con la del principio → el empalme del bucle no se oye).
 * Binaural/monaural: los dos tonos (fc ± Δf/2) en múltiplos de 1/T. Isocrónico: portadora y pulso.
 * El cambio es de una fracción de milihercio.
 */
export function quantizeForLoop(p: EngineParams, T: number): EngineParams {
  const minCycles = Math.ceil(0.5 * T)
  const maxCycles = Math.floor(40 * T)
  if (p.mode === 'isochronic') {
    const carrier = clamp(Math.round(p.carrierHz * T), Math.ceil(100 * T), Math.floor(1000 * T)) / T
    const beat = clamp(Math.round(p.beatHz * T), minCycles, maxCycles) / T
    return { ...p, carrierHz: carrier, beatHz: beat }
  }
  const a = Math.round((p.carrierHz - p.beatHz / 2) * T)
  let diff = Math.round(p.beatHz * T)
  diff = clamp(diff, minCycles, maxCycles)
  const lo = a / T
  const hi = (a + diff) / T
  return { ...p, carrierHz: (lo + hi) / 2, beatHz: hi - lo }
}

/**
 * Duración real del bucle. Con respiración, el número de ciclos respiratorios tiene que ser entero (§B3): así el
 * empalme cae siempre en el mismo punto de la respiración. Se elige el múltiplo más cercano a `T`.
 * Sin respiración, es `T`.
 */
export function loopSecondsFor(params: EngineParams, T: number = LOOP_SECONDS): number {
  const b = params.breath
  if (!b.enabled) return T
  const rpm = b.pattern.rpm
  const cycles = Math.max(1, Math.round((T * rpm) / 60))
  return (cycles * 60) / rpm
}

/**
 * Parámetros del bucle con respiración: sin rampa (no es periódica, así que el empalme se oiría) y sin fin de
 * respiración a los 10 min (el bucle no lo aplica, igual que no aplica el programa).
 */
function loopBreathParams(params: EngineParams): EngineParams {
  const b = params.breath
  return {
    ...params,
    breath: { ...b, pattern: { ...b.pattern, rampSec: 0 }, stopAtSec: null },
  }
}

function checkCancel(o: RenderOptions) {
  if (o.shouldCancel?.()) throw new Error('cancelled')
}

/** Sesión completa: fundido de entrada de 8 s, programa/temporizador y fundido de salida que termina justo al final. */
function renderSession(
  job: SessionJob,
  emit: (chunk: Int16Array) => void,
  progress: (f: number) => void,
  o: RenderOptions,
): RenderOutput {
  const fs = job.sampleRate ?? EXPORT_SAMPLE_RATE
  const seconds = clampSeconds(job.seconds)
  const total = Math.round(seconds * fs)
  const engine = new DspEngine(fs, job.params, { fadeSec: FADE_SECONDS, rand: o.rand })
  engine.setProgram(job.program, 0)
  // El fundido de salida (8 s) empieza 8 s antes del final para acabar exactamente en él.
  engine.setSessionTimer(Math.max(0, seconds - FADE_SECONDS))
  engine.start()

  const chunkFrames = Math.max(1, Math.round((o.chunkSeconds ?? CHUNK_SECONDS) * fs))
  const L = new Float32Array(chunkFrames)
  const R = new Float32Array(chunkFrames)
  for (let done = 0; done < total; ) {
    checkCancel(o)
    const n = Math.min(chunkFrames, total - done)
    engine.renderBlock(L, R, n)
    const out = new Int16Array(n * 2)
    for (let i = 0; i < n; i++) {
      out[2 * i] = toInt16(L[i] as number)
      out[2 * i + 1] = toInt16(R[i] as number)
    }
    emit(out)
    done += n
    progress(done / total)
  }
  return { header: wavHeader(total, fs), head: null, frames: total, sampleRate: fs }
}

/**
 * Bucle sin costuras. El tono es periódico en `T` (frecuencias cuantizadas), así que su empalme es
 * exacto. El fondo (ruido o sonido natural) es aleatorio: se renderiza `T + X` segundos y la cola
 * se mezcla con el principio con un fundido cruzado de potencia constante. Tono y fondo se renderizan
 * por separado, sin el tanh final, se suman y se aplica el tanh una sola vez: da lo mismo que la app.
 * El fichero es [cabecera][head: X fotogramas][cuerpo: T − X fotogramas].
 */
function renderLoop(
  job: LoopJob,
  emit: (chunk: Int16Array) => void,
  progress: (f: number) => void,
  o: RenderOptions,
): RenderOutput {
  const fs = job.sampleRate ?? EXPORT_SAMPLE_RATE
  const breathOn = job.params.breath.enabled
  const T = loopSecondsFor(job.params, job.loopSec ?? LOOP_SECONDS)
  const N = Math.round(T * fs)
  // El oleaje vive en el motor de fondo (aunque el ruido esté en «ninguno», usa su rosa de respaldo).
  const hasBg =
    (job.params.noiseType !== 'none' && job.params.noiseGain > 0) || (breathOn && job.params.breath.cues.swell)
  const X = hasBg ? Math.min(Math.round((job.crossfadeSec ?? CROSSFADE_SECONDS) * fs), Math.floor(N / 2)) : 0
  const p0 = breathOn ? loopBreathParams(job.params) : job.params
  const q = quantizeForLoop(p0, T)
  const base = { fadeSec: 0, softClip: false }
  const bgRand = o.seed === undefined ? undefined : mulberry32(o.seed)
  const toneRand = o.seed === undefined ? undefined : mulberry32(o.seed + 1_000_003)
  // Cada señal de respiración vive en un solo motor: el oleaje en el de fondo; el tono guía y la campanilla en el del tono.
  const toneBreath = { ...q.breath, cues: { ...q.breath.cues, swell: false } }
  const bgBreath = { ...q.breath, cues: { ...q.breath.cues, guideTone: false, chime: false } }

  const tone = new DspEngine(
    fs,
    { ...q, noiseGain: 0, noiseType: 'none', breath: toneBreath },
    { ...base, rand: toneRand },
  )
  const bg = hasBg ? new DspEngine(fs, { ...q, toneGain: 0, breath: bgBreath }, { ...base, rand: bgRand }) : null
  tone.start()
  bg?.start()

  const totalWork = N + X
  const chunkFrames = Math.max(1, Math.round((o.chunkSeconds ?? CHUNK_SECONDS) * fs))
  const tL = new Float32Array(chunkFrames)
  const tR = new Float32Array(chunkFrames)
  const bL = new Float32Array(chunkFrames)
  const bR = new Float32Array(chunkFrames)
  const headBgL = new Float32Array(X)
  const headBgR = new Float32Array(X)
  const head = new Int16Array(X * 2)

  for (let g0 = 0; g0 < totalWork; ) {
    checkCancel(o)
    const n = Math.min(chunkFrames, totalWork - g0)
    tone.renderBlock(tL, tR, n)
    if (bg) bg.renderBlock(bL, bR, n)
    const bodyStart = Math.max(g0, X)
    const bodyEnd = Math.min(g0 + n, N)
    const out = bodyEnd > bodyStart ? new Int16Array((bodyEnd - bodyStart) * 2) : null
    for (let k = 0; k < n; k++) {
      const g = g0 + k
      const bgL = bg ? (bL[k] as number) : 0
      const bgR = bg ? (bR[k] as number) : 0
      if (g < X) {
        headBgL[g] = bgL
        headBgR[g] = bgR
      } else if (g < N) {
        const j = (g - bodyStart) * 2
        ;(out as Int16Array)[j] = toInt16(Math.tanh((tL[k] as number) + bgL))
        ;(out as Int16Array)[j + 1] = toInt16(Math.tanh((tR[k] as number) + bgR))
      } else {
        // g ≥ N: la cola se mezcla con el principio (fundido cruzado de potencia constante)
        const jx = g - N
        const th = (Math.PI / 2) * ((jx + 0.5) / X)
        const win = Math.sin(th)
        const wout = Math.cos(th)
        head[2 * jx] = toInt16(Math.tanh((tL[k] as number) + (headBgL[jx] as number) * win + bgL * wout))
        head[2 * jx + 1] = toInt16(Math.tanh((tR[k] as number) + (headBgR[jx] as number) * win + bgR * wout))
      }
    }
    if (out) emit(out)
    g0 += n
    progress(g0 / totalWork)
  }
  return { header: wavHeader(N, fs), head: X > 0 ? head : null, frames: N, sampleRate: fs }
}

/** Renderiza un trabajo de exportación emitiendo el cuerpo del WAV por trozos. */
export function renderJob(
  job: ExportJob,
  emit: (chunk: Int16Array) => void,
  progress: (fraction: number) => void = () => {},
  options: RenderOptions = {},
): RenderOutput {
  return job.kind === 'session' ? renderSession(job, emit, progress, options) : renderLoop(job, emit, progress, options)
}

/** Atajo para tests y archivos pequeños: devuelve el WAV completo en memoria. */
export function renderToBytes(job: ExportJob, options: RenderOptions = {}): Uint8Array {
  const chunks: Int16Array[] = []
  const r = renderJob(job, (c) => chunks.push(c), () => {}, options)
  const parts: (Uint8Array | Int16Array)[] = [r.header, ...(r.head ? [r.head] : []), ...chunks]
  const size = parts.reduce((s, p) => s + p.byteLength, 0)
  const bytes = new Uint8Array(size)
  let off = 0
  for (const p of parts) {
    bytes.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), off)
    off += p.byteLength
  }
  return bytes
}
