import { describe, expect, it } from 'vitest'
import { loopSecondsFor, renderJob } from '../src/audio/render'
import { DEFAULT_PARAMS, type EngineParams } from '../src/dsp/types'

const FS = 4000
const withBreath = (over: Partial<EngineParams> = {}, rpm = 6): EngineParams => ({
  ...DEFAULT_PARAMS,
  toneGain: 0,
  noiseType: 'none',
  noiseGain: 0,
  masterGain: 1,
  loudnessComp: false,
  breath: {
    enabled: true,
    pattern: { rpm, inhaleRatio: 0.4, holdInSec: 0, holdOutSec: 0, rampFromRpm: 8, rampSec: 120 },
    cues: { swell: false, guideTone: false, chime: true },
    stopAtSec: 600,
    safetyLimits: true,
  },
  ...over,
})

/** Muestras de la izquierda del bucle (sin fondo, el fichero es solo el cuerpo). */
function loopLeft(params: EngineParams, loopSec: number, seed = 3): Float32Array {
  const chunks: Int16Array[] = []
  renderJob({ kind: 'loop', params, loopSec, sampleRate: FS }, (c) => chunks.push(c), () => {}, { seed })
  const total = chunks.reduce((s, c) => s + c.length / 2, 0)
  const out = new Float32Array(total)
  let k = 0
  for (const c of chunks) for (let i = 0; i < c.length; i += 2) out[k++] = (c[i] as number) / 32767
  return out
}

describe('bucle con respiración', () => {
  it('la duración contiene un número entero de ciclos respiratorios', () => {
    for (const rpm of [6, 5.5, 4.5, 7, 10]) {
      const T = loopSecondsFor(withBreath({}, rpm))
      const cycles = (T * rpm) / 60
      expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-9)
      expect(Math.abs(T - 300)).toBeLessThanOrEqual(60 / rpm / 2 + 1e-9) // el múltiplo más cercano
    }
  })

  it('a 6 rpm son exactamente 5 min (30 ciclos); sin respiración, 5 min', () => {
    expect(loopSecondsFor(withBreath({}, 6))).toBe(300)
    expect(loopSecondsFor({ ...withBreath({}, 6), breath: { ...withBreath().breath, enabled: false } })).toBe(300)
  })

  it('la campanilla cae en el mismo instante de cada ciclo: el bucle se repite sin desfase', () => {
    // 20 s a 6 rpm = 2 ciclos de 10 s. Fase de inspiración al inicio y en 10 s; espiración en 4 s y 14 s.
    const L = loopLeft(withBreath(), 20)
    expect(L.length).toBe(20 * FS)
    const onsets: number[] = []
    let quiet = 1e9
    for (let i = 0; i < L.length; i++) {
      if (Math.abs(L[i] as number) > 1e-3) {
        if (quiet >= 48) onsets.push(i / FS)
        quiet = 0
      } else quiet++
    }
    console.log(`  notas del bucle (s): ${onsets.map((t) => t.toFixed(2)).join(', ')}`)
    expect(onsets.length).toBe(4)
    for (const [got, want] of onsets.map((t, k) => [t, [0, 4, 10, 14][k]] as const)) {
      expect(Math.abs(got - (want as number))).toBeLessThan(0.01)
    }
  })

  it('el empalme del bucle no tiene salto: la última muestra y la primera son continuas', () => {
    const L = loopLeft(withBreath(), 20)
    let maxStep = 0
    for (let i = 1; i < L.length; i++) maxStep = Math.max(maxStep, Math.abs((L[i] as number) - (L[i - 1] as number)))
    const seam = Math.abs((L[L.length - 1] as number) - (L[0] as number))
    console.log(`  salto en el empalme ${seam.toExponential(2)} frente a paso máximo ${maxStep.toExponential(2)}`)
    expect(seam).toBeLessThanOrEqual(maxStep * 2)
  })

  it('con el oleaje activado y el ruido en «ninguno», el bucle produce oleaje (el motor de fondo existe)', () => {
    const p = withBreath({ noiseType: 'none', noiseGain: 0 })
    p.breath.cues.swell = true
    const chunks: Int16Array[] = []
    const r = renderJob({ kind: 'loop', params: p, loopSec: 12, sampleRate: FS }, (c) => chunks.push(c), () => {}, { seed: 9 })
    // 12 s a 6 rpm no es un número entero de ciclos: el bucle se ajusta a 10 s (dos ciclos de 5 s no; uno de 10 s sí)
    expect(r.frames).toBe(Math.round(loopSecondsFor(p, 12) * FS))
    expect(r.frames).toBe(10 * FS)
    let energy = 0
    for (const c of chunks) for (let i = 0; i < c.length; i++) energy += (c[i] as number) ** 2
    expect(energy).toBeGreaterThan(0)
  })
})
