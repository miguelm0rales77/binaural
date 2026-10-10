import { describe, expect, it } from 'vitest'
import { isoEnvelope } from '../src/dsp/envelope'
import { DspEngine } from '../src/dsp/engine'
import { isoSpl, loudnessCompDb } from '../src/dsp/loudness'
import { NoiseGenerator, mulberry32 } from '../src/dsp/noise'
import { evalProgram } from '../src/dsp/program'
import type { Program } from '../src/dsp/types'
import { peakFrequency, spectralSlopeDbPerOctave } from './fft'
import { FS, measureEngine, render, undoMix } from './helpers'

describe('1. continuidad de fase', () => {
  it('cambiar 200 → 210 Hz no produce saltos', () => {
    const e = measureEngine({ mode: 'binaural', carrierHz: 200, beatHz: 0.5 })
    const first = render(e, FS).L
    e.setParams({ carrierHz: 210 })
    const second = render(e, FS).L
    const x = [...first, ...second].map(undoMix)
    let maxDiff = 0
    for (let i = 1; i < x.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs((x[i] as number) - (x[i - 1] as number)))
    }
    const bound = ((2 * Math.PI * 210) / FS) * 1.01
    console.log(`  max |Δmuestra| = ${maxDiff.toFixed(5)}  (límite ${bound.toFixed(5)})`)
    expect(maxDiff).toBeLessThanOrEqual(bound)
    // y la señal sí tiene amplitud completa (el test no es vacuo)
    expect(Math.max(...x.map(Math.abs))).toBeGreaterThan(0.99)
  })
})

describe('2. binaural', () => {
  it('fc=400, Δf=10: pico L en 395 Hz y R en 405 Hz', () => {
    const e = measureEngine({ mode: 'binaural', carrierHz: 400, beatHz: 10 })
    const { L, R } = render(e, 65536)
    const fl = peakFrequency(L, 65536, FS)
    const fr = peakFrequency(R, 65536, FS)
    console.log(`  pico L = ${fl.toFixed(3)} Hz, pico R = ${fr.toFixed(3)} Hz`)
    expect(Math.abs(fl - 395)).toBeLessThanOrEqual(1)
    expect(Math.abs(fr - 405)).toBeLessThanOrEqual(1)
  })

  it('monaural: L = R', () => {
    const e = measureEngine({ mode: 'monaural', carrierHz: 400, beatHz: 10 })
    const { L, R } = render(e, 4800)
    expect(L).toEqual(R)
  })
})

describe('3. isocrónico', () => {
  it('D=0.9: envolvente mín 0.1, máx 1.0 y periodo 1/Δf', () => {
    expect(isoEnvelope(0, 0.9)).toBeCloseTo(0.1, 10)
    expect(isoEnvelope(0.5, 0.9)).toBeCloseTo(1, 10)

    const beat = 2
    const e = measureEngine({ mode: 'isochronic', carrierHz: 400, beatHz: beat, isoDepth: 0.9 })
    const { L, R } = render(e, FS * 3)
    expect(L).toEqual(R)
    // envolvente: máximo |x| por cada ciclo de portadora (120 muestras a 400 Hz)
    const win = FS / 400
    const env: number[] = []
    for (let i = 0; i + win <= L.length; i += win) {
      let m = 0
      for (let j = i; j < i + win; j++) m = Math.max(m, Math.abs(L[j] as number))
      env.push(undoMix(m))
    }
    const min = Math.min(...env)
    const max = Math.max(...env)
    // periodo: separación entre cruces ascendentes del nivel medio
    const crossings: number[] = []
    for (let i = 1; i < env.length; i++) {
      if ((env[i - 1] as number) < 0.55 && (env[i] as number) >= 0.55) crossings.push(i * (win / FS))
    }
    const period = ((crossings[crossings.length - 1] as number) - (crossings[0] as number)) / (crossings.length - 1)
    console.log(`  env mín = ${min.toFixed(4)}, máx = ${max.toFixed(4)}, periodo = ${period.toFixed(4)} s`)
    expect(Math.abs(min - 0.1)).toBeLessThanOrEqual(0.01)
    expect(Math.abs(max - 1)).toBeLessThanOrEqual(0.01)
    expect(crossings.length).toBeGreaterThanOrEqual(3)
    expect(Math.abs(period - 1 / beat)).toBeLessThanOrEqual(win / FS * 1.5)
  })
})

describe('4. pendientes del ruido', () => {
  const gen = (n: number) => {
    const g = new NoiseGenerator(mulberry32(42))
    const out = { white: new Float32Array(n), pink: new Float32Array(n), brown: new Float32Array(n) }
    for (let i = 0; i < n; i++) {
      g.next()
      out.white[i] = g.white
      out.pink[i] = g.pink
      out.brown[i] = g.brown
    }
    return out
  }
  const noise = gen(FS * 10)
  const slope = (x: Float32Array) => spectralSlopeDbPerOctave(x, FS)

  it('rosa ≈ −3 ±1 dB/oct', () => {
    const s = slope(noise.pink)
    console.log(`  rosa: ${s.toFixed(2)} dB/oct`)
    expect(Math.abs(s + 3)).toBeLessThanOrEqual(1)
  })
  it('marrón ≈ −6 ±1.5 dB/oct', () => {
    const s = slope(noise.brown)
    console.log(`  marrón: ${s.toFixed(2)} dB/oct`)
    expect(Math.abs(s + 6)).toBeLessThanOrEqual(1.5)
  })
  it('blanco ≈ 0 ±1 dB/oct', () => {
    const s = slope(noise.white)
    console.log(`  blanco: ${s.toFixed(2)} dB/oct`)
    expect(Math.abs(s)).toBeLessThanOrEqual(1)
  })
  it('es determinista con la misma semilla', () => {
    expect(gen(1000).pink).toEqual(gen(1000).pink)
  })
})

describe('5. ISO 226', () => {
  it('Lp(1000) = 40 ±0.2 dB', () => {
    const lp = isoSpl(1000)
    console.log(`  Lp(1000) = ${lp.toFixed(3)} dB`)
    expect(Math.abs(lp - 40)).toBeLessThanOrEqual(0.2)
  })
  it('Lp(100) > Lp(400) + 10', () => {
    console.log(`  Lp(100) = ${isoSpl(100).toFixed(2)}, Lp(400) = ${isoSpl(400).toFixed(2)}`)
    expect(isoSpl(100)).toBeGreaterThan(isoSpl(400) + 10)
  })
  it('la compensación está limitada a [−6, +12] dB y es 0 en 400 Hz', () => {
    expect(loudnessCompDb(400)).toBeCloseTo(0, 10)
    expect(loudnessCompDb(100)).toBe(12)
    expect(loudnessCompDb(1000)).toBeGreaterThanOrEqual(-6)
  })
})

describe('6. seguridad', () => {
  it('ganancias a 1 con ruido marrón: |muestra| ≤ 1', () => {
    for (const mode of ['binaural', 'monaural', 'isochronic'] as const) {
      const e = new DspEngine(
        FS,
        { mode, carrierHz: 100, toneGain: 1, noiseGain: 1, masterGain: 1, noiseType: 'brown', loudnessComp: true },
        { fadeSec: 0, rand: mulberry32(7) },
      )
      e.start()
      const { L, R } = render(e, FS * 5)
      let peak = 0
      for (let i = 0; i < L.length; i++) {
        peak = Math.max(peak, Math.abs(L[i] as number), Math.abs(R[i] as number))
      }
      console.log(`  ${mode}: pico = ${peak.toFixed(4)}`)
      expect(peak).toBeLessThanOrEqual(1)
      expect(Number.isFinite(peak)).toBe(true)
    }
  })
})

describe('7. fundidos', () => {
  it('entrada: ≈0 al empezar y sube; salida: 0 tras 8 s y emite stopped', () => {
    const e = new DspEngine(FS, { toneGain: 1, masterGain: 1, noiseType: 'pink', noiseGain: 1 }, { rand: mulberry32(3) })
    let stopped = 0
    e.onStopped = () => stopped++

    // antes de start: silencio
    expect(Math.max(...render(e, 256).L.map(Math.abs))).toBe(0)

    e.start()
    const head = render(e, 64).L
    console.log(`  primeras muestras: máx |x| = ${Math.max(...head.map(Math.abs)).toExponential(2)}`)
    expect(Math.max(...head.map(Math.abs))).toBeLessThan(1e-3)

    const mid = render(e, FS * 4).L // a mitad del fundido de entrada
    const late = render(e, FS * 6).L // pasados los 8 s
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)
    expect(rms(late)).toBeGreaterThan(rms(mid))
    expect(e.getState().playing).toBe(true)

    e.stop()
    render(e, Math.floor(FS * 7.9))
    expect(stopped).toBe(0)
    expect(e.getState().playing).toBe(true)

    const tail = render(e, Math.floor(FS * 0.3)).L
    console.log(`  stopped emitido ${stopped} vez; última muestra = ${tail[tail.length - 1]}`)
    expect(stopped).toBe(1)
    expect(e.getState().playing).toBe(false)
    expect(tail[tail.length - 1]).toBe(0)
    expect(Math.max(...render(e, 1000).L.map(Math.abs))).toBe(0)
    expect(stopped).toBe(1)
  })

  it('el temporizador de sesión inicia el fundido de salida', () => {
    const e = new DspEngine(FS, { toneGain: 1, masterGain: 1 }, { fadeSec: 1 })
    let stopped = 0
    e.onStopped = () => stopped++
    e.setSessionTimer(2)
    e.start()
    render(e, FS * 2.5)
    expect(stopped).toBe(0)
    render(e, FS * 1)
    expect(stopped).toBe(1)
  })
})

describe('8. programas', () => {
  const prog: Program = {
    name: 'test',
    durationSec: 100,
    steps: [
      { atSec: 10, beatHz: 10, carrierHz: 200 },
      { atSec: 20, beatHz: 6, carrierHz: 300 },
      { atSec: 40, beatHz: 2 },
    ],
  }
  it('antes del primer paso devuelve el primero', () => {
    expect(evalProgram(prog, 0)).toEqual({ beatHz: 10, carrierHz: 200 })
    expect(evalProgram(prog, 10).beatHz).toBe(10)
  })
  it('entre dos pasos interpola linealmente', () => {
    const v = evalProgram(prog, 15)
    expect(v.beatHz).toBeCloseTo(8, 10)
    expect(v.carrierHz).toBeCloseTo(250, 10)
    expect(evalProgram(prog, 30).beatHz).toBeCloseTo(4, 10)
  })
  it('en un paso exacto da el valor del paso', () => {
    expect(evalProgram(prog, 20).beatHz).toBeCloseTo(6, 10)
  })
  it('pasado el final mantiene el último paso', () => {
    expect(evalProgram(prog, 40).beatHz).toBe(2)
    expect(evalProgram(prog, 1000).beatHz).toBe(2)
  })
  it('el motor sigue el programa', () => {
    const e = measureEngine({ mode: 'binaural' })
    e.setProgram({ name: 'p', durationSec: 100, steps: [{ atSec: 0, beatHz: 10 }, { atSec: 10, beatHz: 4 }] }, 0)
    render(e, FS * 12)
    expect(e.getState().beatHz).toBeCloseTo(4, 1)
  })
})
