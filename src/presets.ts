import { isGenerated } from './dsp/params'
import type { BeatMode, NoiseType, Preset, Program } from './dsp/types'
import { PRE_SLEEP_PATTERN, RESONANCE_PATTERN } from './breathPresets'
import { bandFor } from './bands'

export const MODE_LABELS: Record<BeatMode, string> = {
  binaural: 'Binaural',
  monaural: 'Monaural',
  isochronic: 'Isocrónico',
}

export const NOISE_LABELS: Record<NoiseType, string> = {
  none: 'Ninguno',
  white: 'Blanco',
  pink: 'Rosa',
  brown: 'Marrón',
  rain: 'Lluvia',
  wind: 'Viento',
  storm: 'Tormenta',
  river: 'Río',
  forest: 'Bosque',
  bowls: 'Cuencos tibetanos',
  gong: 'Gong',
}

const MIN = 60

/** 0–5 min a 10 Hz, rampa a 6 Hz en el minuto 15, rampa a 3 Hz en el minuto 25 y se mantiene hasta el final. */
export const PRE_SLEEP_PROGRAM: Program = {
  name: 'Pre-sueño',
  durationSec: 30 * MIN,
  steps: [
    { atSec: 0, beatHz: 10 },
    { atSec: 5 * MIN, beatHz: 10 },
    { atSec: 15 * MIN, beatHz: 6 },
    { atSec: 25 * MIN, beatHz: 3 },
  ],
}

/**
 * Presets integrados. Solo fijan modo, frecuencias y ruido: no tocan los volúmenes del usuario.
 * Los nombres son descriptivos y no prometen ningún efecto.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'relax-alpha',
    name: 'Relajación (alfa)',
    params: {
      mode: 'binaural',
      carrierHz: 250,
      beatHz: 10,
      noiseType: 'pink',
      noiseGain: 0.15,
      breath: { enabled: true, pattern: RESONANCE_PATTERN, stopAtSec: null },
    },
    suggestedMinutes: 20,
  },
  {
    id: 'focus-beta',
    name: 'Concentración (beta)',
    params: { mode: 'binaural', carrierHz: 400, beatHz: 16, noiseType: 'pink', noiseGain: 0.15, breath: { enabled: false } },
    suggestedMinutes: 30,
  },
  {
    id: 'meditation-theta',
    name: 'Meditación (theta)',
    params: { mode: 'binaural', carrierHz: 200, beatHz: 6, noiseType: 'none', breath: { enabled: false } },
    suggestedMinutes: 20,
  },
  {
    id: 'pre-sleep',
    name: 'Pre-sueño (programa)',
    params: {
      mode: 'binaural',
      carrierHz: 200,
      beatHz: 10,
      noiseType: 'brown',
      noiseGain: 0.25,
      // La respiración dura los primeros 10 min y después se apaga con un fundido de 30 s (§B5, Fase 9).
      breath: {
        enabled: true,
        pattern: PRE_SLEEP_PATTERN,
        stopAtSec: 10 * MIN,
      },
    },
    program: PRE_SLEEP_PROGRAM,
    suggestedMinutes: 30,
  },
  {
    id: 'gamma-40',
    name: 'Reflexión (gamma)',
    params: { mode: 'isochronic', carrierHz: 400, beatHz: 40, isoDepth: 0.8, noiseType: 'none', breath: { enabled: false } },
    suggestedMinutes: 15,
  },
]

/** Pulsos de un programa sin repeticiones consecutivas: [10,10,6,3] → "10→6→3 Hz". */
function programBeats(program: Program): string {
  const beats: number[] = []
  for (const s of program.steps) if (beats[beats.length - 1] !== s.beatHz) beats.push(s.beatHz)
  return `${beats.map((b) => +b.toFixed(1)).join('→')} Hz`
}

/** Resumen de una línea: modo · portadora · pulso (banda) · ruido · duración. */
export function describePreset(p: Preset): string {
  const mode = p.params.mode ?? 'binaural'
  const parts = [MODE_LABELS[mode]]
  if (p.params.carrierHz !== undefined) parts.push(`${Math.round(p.params.carrierHz)} Hz`)
  if (p.program) parts.push(programBeats(p.program))
  else if (p.params.beatHz !== undefined) {
    parts.push(`${+p.params.beatHz.toFixed(1)} Hz (${bandFor(p.params.beatHz).name})`)
  }
  const noise = p.params.noiseType ?? 'none'
  if (noise !== 'none') {
    parts.push(isGenerated(noise) ? NOISE_LABELS[noise].toLowerCase() : `ruido ${NOISE_LABELS[noise].toLowerCase()}`)
  }
  if (p.suggestedMinutes !== null) parts.push(`${p.suggestedMinutes} min`)
  return parts.join(' · ')
}
