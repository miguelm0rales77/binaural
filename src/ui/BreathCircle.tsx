import { useEffect, useRef } from 'react'
import { breathStateInto, phaseLengthSec, type BreathPattern, type BreathPhase, type BreathState } from '../dsp/breath'

const PHASE_TEXT: Record<BreathPhase, string> = {
  in: 'Inspira',
  holdIn: 'Mantén',
  out: 'Espira',
  holdOut: 'Mantén',
}

interface Props {
  /** true mientras la sesión suena: el círculo sigue el reloj del audio. */
  active: boolean
  pattern: BreathPattern
  /** Recordatorio de texto: labios fruncidos durante la espiración. */
  lips: boolean
  /** Segundos desde la fase 0 según el reloj de audio, o null si no hay sesión. */
  getTime: () => number | null
}

/**
 * Círculo que crece al inspirar y se encoge al espirar. Se actualiza en cada fotograma con refs (sin
 * re-renderizar React) y sin destellos: solo cambia de tamaño, a la velocidad de la respiración.
 */
export function BreathCircle({ active, pattern, lips, getTime }: Props) {
  const circle = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLParagraphElement>(null)
  const count = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const setIdle = () => {
      if (circle.current) circle.current.style.transform = 'scale(0.55)'
      if (label.current) label.current.textContent = 'Pulsa Reproducir para empezar'
      if (count.current) count.current.textContent = ''
    }
    if (!active) {
      setIdle()
      return
    }
    const st: BreathState = { phase: 'in', phaseProgress: 0, lung: 0, cycleIndex: 0 }
    let shown: BreathPhase | null = null
    let raf = 0
    const frame = () => {
      const t = getTime()
      if (t !== null && t >= 0) {
        breathStateInto(st, t, pattern)
        if (circle.current) circle.current.style.transform = `scale(${(0.55 + 0.45 * st.lung).toFixed(4)})`
        if (st.phase !== shown && label.current) {
          shown = st.phase
          label.current.textContent = st.phase === 'out' && lips ? 'Espira con los labios fruncidos' : PHASE_TEXT[st.phase]
        }
        if (count.current) {
          const left = (1 - st.phaseProgress) * phaseLengthSec(st.phase, t, pattern)
          count.current.textContent = String(Math.max(1, Math.ceil(left)))
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active, pattern, lips, getTime])

  return (
    <div className="breath-stage">
      <div className="breath-circle" aria-hidden="true">
        <div ref={circle} className="breath-disc" />
      </div>
      <p ref={label} className="breath-label" data-testid="breath-label" aria-live="off">
        Pulsa Reproducir para empezar
      </p>
      <span ref={count} className="breath-count" aria-hidden="true" />
    </div>
  )
}
