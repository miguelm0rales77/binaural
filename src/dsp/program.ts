import type { Program } from './types'

export interface ProgramValue {
  beatHz: number
  carrierHz?: number
}

function set(out: ProgramValue, beatHz: number, carrierHz: number | undefined): ProgramValue {
  out.beatHz = beatHz
  out.carrierHz = carrierHz
  return out
}

/**
 * Valor del programa en el instante `tSec` (interpolación lineal entre pasos).
 * Antes del primer paso devuelve el primero; pasado el último, se mantiene el último.
 * Si se pasa `out` se reutiliza (sin reservar memoria). La portadora se interpola si ambos pasos la definen; si solo uno, se usa esa.
 */
export function evalProgram(
  program: Program,
  tSec: number,
  out: ProgramValue = { beatHz: 0 },
): ProgramValue {
  const steps = program.steps
  const first = steps[0]
  if (!first) throw new Error('Programa sin pasos')
  const last = steps[steps.length - 1] as typeof first
  if (tSec <= first.atSec) return set(out, first.beatHz, first.carrierHz)
  if (tSec >= last.atSec) return set(out, last.beatHz, last.carrierHz)
  let i = 0
  while (i < steps.length - 2 && tSec >= (steps[i + 1] as typeof first).atSec) i++
  const a = steps[i] as typeof first
  const b = steps[i + 1] as typeof first
  const span = b.atSec - a.atSec
  const t = span > 0 ? (tSec - a.atSec) / span : 1
  const beatHz = a.beatHz + t * (b.beatHz - a.beatHz)
  const carrierHz =
    a.carrierHz !== undefined && b.carrierHz !== undefined
      ? a.carrierHz + t * (b.carrierHz - a.carrierHz)
      : (a.carrierHz ?? b.carrierHz)
  return set(out, beatHz, carrierHz)
}
