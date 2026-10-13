import { isNature } from './dsp/params'
import type { BeatMode, NoiseType, Preset, Program } from './dsp/types'
import { bandFor } from './bands'
import { DEFAULT_CUES, makePattern } from './breathing'

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
 * Presets integrados. Fijan modo, frecuencias, ruido y el metrónomo de respiración; no tocan los volúmenes
 * del usuario. Los que no llevan respiración la apagan y conservan el patrón del usuario (`maxSec` se
 * reinicia para que un límite de otro preset no se herede). Los nombres no prometen ningún efecto.
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
      breath: { enabled: true, pattern: makePattern(6, 0.4, { ramp: true }), cues: DEFAULT_CUES, maxSec: null },
    },
    suggestedMinutes: 20,
  },
  {
    id: 'focus-beta',
    name: 'Concentración (beta)',
    params: { mode: 'binaural', carrierHz: 400, beatHz: 16, noiseType: 'pink', noiseGain: 0.15, breath: { enabled: false, maxSec: null } },
    suggestedMinutes: 30,
  },
  {
    id: 'meditation-theta',
    name: 'Meditación (theta)',
    params: { mode: 'binaural', carrierHz: 200, beatHz: 6, noiseType: 'none', breath: { enabled: false, maxSec: null } },
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
      breath: {
        enabled: true,
        pattern: makePattern(5.5, 0.35),
        cues: { swell: true, guideTone: false, chime: false },
        maxSec: 600, // 10 min de respiración; después, fundido de 30 s y solo audio
      },
    },
    program: PRE_SLEEP_PROGRAM,
    suggestedMinutes: 30,
  },
  {
    id: 'gamma-40',
    name: 'Reflexión (gamma)',
    params: { mode: 'isochronic', carrierHz: 400, beatHz: 40, isoDepth: 0.8, noiseType: 'none', breath: { enabled: false, maxSec: null } },
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
    parts.push(isNature(noise) ? NOISE_LABELS[noise].toLowerCase() : `ruido ${NOISE_LABELS[noise].toLowerCase()}`)
  }
  const b = p.params.breath
  if (b?.enabled && b.pattern?.rpm !== undefined) parts.push(`respiración ${+b.pattern.rpm.toFixed(1)} rpm`)
  if (p.suggestedMinutes !== null) parts.push(`${p.suggestedMinutes} min`)
  return parts.join(' · ')
}
