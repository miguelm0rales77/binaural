import { describe, expect, it } from 'vitest'
import { DspEngine } from '../src/dsp/engine'
import { mulberry32 } from '../src/dsp/noise'
import { defaultParams } from '../src/dsp/params'
import { DEFAULT_PARAMS } from '../src/dsp/types'
import { PRESETS, PRE_SLEEP_PROGRAM } from '../src/presets'
import {
  FADE_SECONDS,
  MAX_EXPORT_SECONDS,
  clampSeconds,
  quantizeForLoop,
  renderJob,
  renderToBytes,
} from '../src/audio/render'
import { toInt16, wavHeader, wavSizeBytes } from '../src/audio/wav'
import { peakFrequency } from './fft'

const FS = 8000 // los tests usan una frecuencia baja para ir rápido; la lógica es la misma que a 44100 Hz
const base = { ...defaultParams(), toneGain: 1, masterGain: 0.8, loudnessComp: false }

/** Lee los campos de la cabecera de 44 bytes. */
function parseHeader(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  return {
    riff: tag(0), wave: tag(8), fmt: tag(12), data: tag(36),
    riffSize: v.getUint32(4, true), fmtSize: v.getUint32(16, true), format: v.getUint16(20, true),
    channels: v.getUint16(22, true), sampleRate: v.getUint32(24, true), byteRate: v.getUint32(28, true),
    blockAlign: v.getUint16(32, true), bits: v.getUint16(34, true), dataSize: v.getUint32(40, true),
  }
}

/** Decodifica un WAV de 16 bits estéreo: cabecera + canales en float. */
function decode(bytes: Uint8Array) {
  const h = parseHeader(bytes)
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frames = h.dataSize / 4
  const L = new Float64Array(frames)
  const R = new Float64Array(frames)
  for (let i = 0; i < frames; i++) {
    L[i] = v.getInt16(44 + 4 * i, true) / 32767
    R[i] = v.getInt16(46 + 4 * i, true) / 32767
  }
  return { ...h, frames, L, R, byteLength: bytes.byteLength }
}

const maxAbs = (x: ArrayLike<number>) => {
  let m = 0
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] as number))
  return m
}

describe('cabecera WAV', () => {
  it('PCM de 16 bits estéreo a 44100 Hz con todos los campos correctos', () => {
    const h = wavHeader(44100 * 60, 44100)
    expect(h.byteLength).toBe(44)
    const d = parseHeader(h)
    expect([d.riff, d.wave, d.fmt, d.data]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(d.fmtSize).toBe(16)
    expect(d.format).toBe(1)
    expect(d.channels).toBe(2)
    expect(d.sampleRate).toBe(44100)
    expect(d.byteRate).toBe(44100 * 4)
    expect(d.blockAlign).toBe(4)
    expect(d.bits).toBe(16)
    expect(d.dataSize).toBe(44100 * 60 * 4)
    expect(d.riffSize).toBe(36 + 44100 * 60 * 4)
  })
  it('tamaños: 60 min ≈ 635 MB, 5 min ≈ 53 MB', () => {
    expect(wavSizeBytes(44100 * 3600) / 1e6).toBeCloseTo(635.04, 1)
    expect(wavSizeBytes(44100 * 300) / 1e6).toBeCloseTo(52.92, 1)
  })
  it('toInt16 redondea y recorta', () => {
    expect([toInt16(0), toInt16(1), toInt16(-1), toInt16(2), toInt16(-2), toInt16(0.5)]).toEqual([0, 32767, -32767, 32767, -32768, 16384])
  })
})

describe('exportación de sesión', () => {
  const seconds = 60
  const job = { kind: 'session' as const, params: { ...base, mode: 'binaural' as const, carrierHz: 400, beatHz: 10 }, program: null, seconds, sampleRate: FS }
  const bytes = renderToBytes(job)
  const w = decode(bytes)

  it('tiene la longitud exacta y el tamaño de fichero correcto', () => {
    expect(w.frames).toBe(seconds * FS)
    expect(w.sampleRate).toBe(FS)
    expect(bytes.byteLength).toBe(44 + seconds * FS * 4)
    expect(w.dataSize).toBe(seconds * FS * 4)
  })

  it('fundido de entrada y de salida de 8 s: empieza y acaba en silencio', () => {
    expect(maxAbs(w.L.slice(0, 20))).toBeLessThan(0.001)
    expect(maxAbs(w.L.slice(w.frames - 20))).toBeLessThan(0.001)
    // al principio de la sesión (8 s) sube, en medio está a pleno nivel y vuelve a bajar
    const win = (a: number, b: number) => maxAbs(w.L.slice(a * FS, b * FS))
    expect(win(0, 2)).toBeLessThan(win(5, 8))
    expect(win(25, 35)).toBeGreaterThan(0.2)
    expect(win(seconds - 2, seconds)).toBeLessThan(win(seconds - 9, seconds - 6))
  })

  it('suena igual que la app: mismo DspEngine, muestra a muestra (±1 LSB)', () => {
    const e = new DspEngine(FS, job.params, { fadeSec: FADE_SECONDS })
    e.setSessionTimer(seconds - FADE_SECONDS)
    e.start()
    const n = seconds * FS
    const L = new Float32Array(n)
    const R = new Float32Array(n)
    e.renderBlock(L, R, n)
    let worst = 0
    for (let i = 0; i < n; i += 7) {
      worst = Math.max(worst, Math.abs(toInt16(L[i] as number) - Math.round((w.L[i] as number) * 32767)))
      worst = Math.max(worst, Math.abs(toInt16(R[i] as number) - Math.round((w.R[i] as number) * 32767)))
    }
    console.log(`  diferencia máxima entre la exportación y el motor: ${worst} LSB`)
    expect(worst).toBeLessThanOrEqual(1)
  })

  it('el espectro tiene el pico donde toca: L = 395 Hz, R = 405 Hz', () => {
    const seg = (c: Float64Array) => c.slice(20 * FS, 20 * FS + 32768)
    const fl = peakFrequency(seg(w.L), 32768, FS)
    const fr = peakFrequency(seg(w.R), 32768, FS)
    console.log(`  pico exportado: L ${fl.toFixed(2)} Hz, R ${fr.toFixed(2)} Hz`)
    expect(Math.abs(fl - 395)).toBeLessThanOrEqual(1)
    expect(Math.abs(fr - 405)).toBeLessThanOrEqual(1)
  })

  it('el máximo es de 60 min y el mínimo de 1 s', () => {
    expect(clampSeconds(99999)).toBe(MAX_EXPORT_SECONDS)
    expect(MAX_EXPORT_SECONDS).toBe(3600)
    expect(clampSeconds(0)).toBe(1)
    expect(clampSeconds(Number.NaN)).toBe(1)
    expect(clampSeconds(-5)).toBe(1)
  })

  it('exporta el programa Pre-sueño: el pulso baja de 10 a 3 Hz (se mide en el audio)', { timeout: 120_000 }, () => {
    const prog = { ...PRE_SLEEP_PROGRAM, durationSec: 30 * 60 }
    const pre = PRESETS.find((p) => p.id === 'pre-sleep')
    const params = { ...base, ...pre?.params, breath: { ...DEFAULT_PARAMS.breath, ...pre?.params?.breath }, noiseType: 'none' as const }
    const out = decode(renderToBytes({ kind: 'session', params, program: prog, seconds: 30 * 60, sampleRate: 4000 }))
    const fs = 4000
    const beatAt = (min: number) => {
      const o = Math.round(min * 60 * fs)
      const l = peakFrequency(out.L.slice(o, o + 65536), 65536, fs)
      const r = peakFrequency(out.R.slice(o, o + 65536), 65536, fs)
      return r - l
    }
    const b = { m3: beatAt(3), m15: beatAt(15), m26: beatAt(26) }
    console.log(`  pulso medido en el WAV: min 3 → ${b.m3.toFixed(2)} Hz · min 15 → ${b.m15.toFixed(2)} Hz · min 26 → ${b.m26.toFixed(2)} Hz`)
    expect(Math.abs(b.m3 - 10)).toBeLessThan(0.3)
    expect(Math.abs(b.m15 - 6)).toBeLessThan(0.3)
    expect(Math.abs(b.m26 - 3)).toBeLessThan(0.3)
    expect(out.frames).toBe(30 * 60 * fs)
  })

  it('se puede cancelar a mitad', () => {
    let calls = 0
    expect(() =>
      renderJob(job, () => {}, () => {}, { chunkSeconds: 5, shouldCancel: () => ++calls > 2 }),
    ).toThrow('cancelled')
  })
})

describe('bucle sin costuras', () => {
  const T = 20
  const loopJob = (params = base) => ({ kind: 'loop' as const, params, loopSec: T, crossfadeSec: 2, sampleRate: FS })

  it('quantizeForLoop deja cada tono con un número entero de ciclos y casi no cambia la frecuencia', () => {
    for (const [mode, carrier, beat] of [
      ['binaural', 400, 10], ['binaural', 250.37, 7.77], ['monaural', 123.456, 0.5], ['binaural', 999.9, 40],
      ['isochronic', 400, 40], ['isochronic', 333.333, 13.3],
    ] as const) {
      const q = quantizeForLoop({ ...base, mode, carrierHz: carrier, beatHz: beat }, 300)
      if (mode === 'isochronic') {
        expect(q.carrierHz * 300).toBeCloseTo(Math.round(q.carrierHz * 300), 6)
        expect(q.beatHz * 300).toBeCloseTo(Math.round(q.beatHz * 300), 6)
      } else {
        expect((q.carrierHz - q.beatHz / 2) * 300).toBeCloseTo(Math.round((q.carrierHz - q.beatHz / 2) * 300), 6)
        expect((q.carrierHz + q.beatHz / 2) * 300).toBeCloseTo(Math.round((q.carrierHz + q.beatHz / 2) * 300), 6)
      }
      expect(Math.abs(q.carrierHz - carrier)).toBeLessThan(0.0035)
      expect(Math.abs(q.beatHz - beat)).toBeLessThan(0.0035)
      expect(q.beatHz).toBeGreaterThanOrEqual(0.5)
      expect(q.beatHz).toBeLessThanOrEqual(40)
    }
  })

  it('dura exactamente el bucle y no tiene fundidos (empieza a pleno nivel)', () => {
    const w = decode(renderToBytes(loopJob({ ...base, carrierHz: 400, beatHz: 10 })))
    expect(w.frames).toBe(T * FS)
    expect(w.byteLength).toBe(44 + T * FS * 4)
    expect(maxAbs(w.L.slice(0, FS / 4))).toBeGreaterThan(0.3)
  })

  const seamJump = (c: Float64Array) => Math.abs((c[0] as number) - (c[c.length - 1] as number))
  const maxStep = (c: Float64Array) => {
    let m = 0
    for (let i = 1; i < c.length; i++) m = Math.max(m, Math.abs((c[i] as number) - (c[i - 1] as number)))
    return m
  }

  it.each(['binaural', 'monaural', 'isochronic'] as const)('solo tono (%s): el empalme es tan suave como cualquier otro punto', (mode) => {
    const w = decode(renderToBytes(loopJob({ ...base, mode, carrierHz: 250.37, beatHz: 7.77 })))
    for (const c of [w.L, w.R]) {
      const typical = maxStep(c)
      console.log(`  ${mode}: salto en el empalme ${seamJump(c).toFixed(5)} · máx. entre muestras ${typical.toFixed(5)}`)
      expect(seamJump(c)).toBeLessThanOrEqual(typical * 1.05)
    }
  })

  it('el tono es periódico: repetir el bucle da exactamente la misma onda', () => {
    const p = quantizeForLoop({ ...base, mode: 'binaural', carrierHz: 250.37, beatHz: 7.77 }, T)
    const e = new DspEngine(FS, { ...p, noiseType: 'none' }, { fadeSec: 0, softClip: false })
    e.start()
    const n = T * FS + 1000
    const L = new Float32Array(n)
    e.renderBlock(L, new Float32Array(n), n)
    let worst = 0
    for (let i = 0; i < 1000; i++) worst = Math.max(worst, Math.abs((L[T * FS + i] as number) - (L[i] as number)))
    console.log(`  diferencia tras un periodo: ${worst.toExponential(2)}`)
    expect(worst).toBeLessThan(1e-4)
  })

  it.each(['pink', 'brown', 'rain', 'wind', 'storm', 'river', 'forest', 'bowls', 'gong'] as const)('con fondo (%s): sin salto audible en el empalme', { timeout: 120_000 }, (noiseType) => {
    const params = { ...base, mode: 'binaural' as const, carrierHz: 300, beatHz: 6, toneGain: 0.3, noiseType, noiseGain: 1 }
    const chunks: Int16Array[] = []
    const r = renderJob(loopJob(params), (c) => chunks.push(c), () => {}, { seed: 5 })
    expect(r.head).not.toBeNull()
    const frames = r.head!.length / 2 + chunks.reduce((s, c) => s + c.length / 2, 0)
    expect(frames).toBe(T * FS)
    const bytes = renderToBytes(loopJob(params), { seed: 5 })
    const w = decode(bytes)
    const jump = Math.max(seamJump(w.L), seamJump(w.R))
    // referencia: el salto típico entre muestras vecinas del propio sonido (percentil 99)
    const diffs: number[] = []
    for (let i = 1; i < w.L.length; i += 3) diffs.push(Math.abs((w.L[i] as number) - (w.L[i - 1] as number)))
    diffs.sort((a, b) => a - b)
    const p99 = diffs[Math.floor(diffs.length * 0.99)] as number
    const typicalMax = diffs[diffs.length - 1] as number
    console.log(`  ${noiseType}: salto en el empalme ${jump.toFixed(4)} · p99 ${p99.toFixed(4)} · máx ${typicalMax.toFixed(4)}`)
    expect(jump).toBeLessThanOrEqual(Math.max(p99 * 2, typicalMax))
  })

  it('con fondo, el nivel es continuo en la zona del fundido cruzado (sin hueco ni sobreimpulso)', () => {
    // ruido blanco: es estacionario, así que un fundido mal hecho (−3 dB con uno lineal) se vería claramente
    const params = { ...base, toneGain: 0, noiseType: 'white' as const, noiseGain: 1 }
    const w = decode(renderToBytes(loopJob(params), { seed: 8 }))
    const rms = (a: number, b: number) => Math.sqrt(w.L.slice(a, b).reduce((s, v) => s + v * v, 0) / (b - a))
    const win = 0.25 * FS
    const mid = rms(10 * FS, 10 * FS + win)
    const headStart = rms(0, win)
    const headMid = rms(FS - win / 2, FS + win / 2) // centro del fundido cruzado de 2 s
    const headEnd = rms(2 * FS - win, 2 * FS)
    console.log(`  RMS: cuerpo ${mid.toFixed(3)} · inicio ${headStart.toFixed(3)} · centro del cruce ${headMid.toFixed(3)} · fin del cruce ${headEnd.toFixed(3)}`)
    for (const v of [headStart, headMid, headEnd]) expect(Math.abs(v / mid - 1)).toBeLessThan(0.08)
  })

  it('con fondo, la mezcla es idéntica a la de la app (tono + fondo antes del tanh)', () => {
    // tono-solo + fondo-solo (sin tanh) debe dar lo mismo que un motor completo sin tanh
    const p = quantizeForLoop({ ...base, mode: 'binaural', carrierHz: 300, beatHz: 6, toneGain: 0.4, noiseType: 'rain', noiseGain: 0.7 }, T)
    const n = 4 * FS
    const run = (params: typeof p, seed: number) => {
      const e = new DspEngine(FS, params, { fadeSec: 0, softClip: false, rand: mulberry32(seed) })
      e.start()
      const L = new Float32Array(n)
      e.renderBlock(L, new Float32Array(n), n)
      return L
    }
    const full = run(p, 77)
    const tone = run({ ...p, noiseGain: 0, noiseType: 'none' }, 1)
    const bg = run({ ...p, toneGain: 0 }, 77)
    let worst = 0
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs((full[i] as number) - ((tone[i] as number) + (bg[i] as number))))
    expect(worst).toBeLessThan(1e-5)
  })
})
