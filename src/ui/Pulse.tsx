import { useEffect, useRef } from 'react'
import type { BeatMode } from '../dsp/types'
import { envelopeAt, sweepPosition } from '../viz'

interface Props {
  mode: BeatMode
  beatHz: number
  depth: number
  /** Hay audio sonando: el punto recorre el patrón. Parado, solo se dibuja el patrón. */
  active: boolean
}

const HEIGHT = 96
const PAD = 12
const ACCENT = '#6aa9ff'

/** Patrón del pulso (sin parpadeos, ver `viz.ts`). Usa requestAnimationFrame y no toca el audio. */
export function Pulse({ mode, beatHz, depth, active }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Valores actuales para el bucle de dibujo, sin reiniciarlo en cada cambio (beatHz llega 4 veces/s).
  const latest = useRef({ mode, beatHz, depth, active })
  useEffect(() => {
    latest.current = { mode, beatHz, depth, active }
  })

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let last = ''

    const draw = (now: number) => {
      const { mode, beatHz, depth, active } = latest.current
      const dpr = window.devicePixelRatio || 1
      const w = el.clientWidth
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(HEIGHT * dpr)) {
        el.width = Math.round(w * dpr)
        el.height = Math.round(HEIGHT * dpr)
        last = ''
      }
      const moving = active && !reduced.matches
      const pos = moving ? sweepPosition(now) : -1
      // Si nada cambió (parado o movimiento reducido) no se vuelve a dibujar.
      const key = `${w}|${mode}|${beatHz.toFixed(2)}|${depth.toFixed(2)}|${pos < 0 ? 'static' : pos.toFixed(3)}`
      if (key !== last) {
        last = key
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, HEIGHT)
        const y = (v: number) => HEIGHT - PAD - v * (HEIGHT - 2 * PAD)
        // patrón relleno
        ctx.beginPath()
        ctx.moveTo(0, y(0))
        for (let x = 0; x <= w; x += 1) ctx.lineTo(x, y(envelopeAt(mode, beatHz, depth, x / w)))
        ctx.lineTo(w, y(0))
        ctx.closePath()
        ctx.fillStyle = 'rgba(106, 169, 255, 0.16)'
        ctx.fill()
        ctx.beginPath()
        for (let x = 0; x <= w; x += 1) {
          const py = y(envelopeAt(mode, beatHz, depth, x / w))
          if (x === 0) ctx.moveTo(x, py)
          else ctx.lineTo(x, py)
        }
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 1.5
        ctx.stroke()
        // punto de brillo constante
        if (pos >= 0) {
          ctx.beginPath()
          ctx.arc(pos * w, y(envelopeAt(mode, beatHz, depth, pos)), 5, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvas}
      className="pulse"
      style={{ height: HEIGHT }}
      role="img"
      aria-label={`Patrón del pulso: ${beatHz.toFixed(1)} ciclos en un segundo`}
    />
  )
}
