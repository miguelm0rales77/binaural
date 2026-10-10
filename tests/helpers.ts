import { DspEngine } from '../src/dsp/engine'

export const FS = 48000

export function render(engine: DspEngine, samples: number) {
  const L = new Float32Array(samples)
  const R = new Float32Array(samples)
  engine.renderBlock(L, R, samples)
  return { L, R }
}

/** Motor listo para medir: sin fundido, ganancias a 1, sin compensación de sonoridad. */
export function measureEngine(params: ConstructorParameters<typeof DspEngine>[1] = {}) {
  const e = new DspEngine(
    FS,
    { toneGain: 1, noiseGain: 1, masterGain: 1, loudnessComp: false, noiseType: 'none', ...params },
    { fadeSec: 0, rand: seeded(1234) },
  )
  e.start()
  return e
}

import { mulberry32 } from '../src/dsp/noise'
export function seeded(seed: number) {
  return mulberry32(seed)
}

/** Deshace la mezcla (·0.5) y el tanh final para recuperar la señal original de un tono. */
export const undoMix = (y: number) => Math.atanh(y) / 0.5
