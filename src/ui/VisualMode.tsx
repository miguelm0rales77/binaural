import { useEffect, useRef, useState } from 'react'
import { FractalRenderer, OCTAVES_DESKTOP, OCTAVES_MOBILE } from '../visual/FractalRenderer'
import type { VisualSettings } from '../visual/fractalParams'

interface Props {
  settings: VisualSettings
  /** Pulmón 0–1 según el reloj de la respiración, o null si no hay respiración activa. */
  lungSource: () => number | null
  onClose: () => void
}

const isMobile = () => window.matchMedia('(max-width: 640px), (pointer: coarse)').matches
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Vista fractal a pantalla completa. El tiempo del campo se acumula (dt × velocidad), así que cambiar
 * la velocidad nunca salta. Se pausa con la pestaña oculta y baja de calidad si los fotogramas van lentos.
 */
export function VisualMode({ settings, lungSource, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ settings, lungSource })
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    latest.current = { settings, lungSource }
  })

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    let renderer: FractalRenderer
    try {
      renderer = new FractalRenderer(el, isMobile() ? OCTAVES_MOBILE : OCTAVES_DESKTOP)
    } catch {
      setFallback(true)
      return
    }
    const resize = () => renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let last = performance.now()
    let acc = 0
    let windowStart = last
    let frames = 0
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const { settings: s, lungSource: lung } = latest.current
      acc += dt * s.speed * (reducedMotion() ? 0.1 : 1)
      const l = lung()
      renderer.render({ t: acc, lung: l ?? 0.5, settings: s })
      // Si la media de los dos últimos segundos baja de 50 fps, calidad reducida (una vez).
      frames++
      if (now - windowStart >= 2000) {
        if (frames / ((now - windowStart) / 1000) < 50) renderer.setQuality('low')
        frames = 0
        windowStart = now
      }
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      last = performance.now()
      windowStart = last
      frames = 0
      raf = requestAnimationFrame(frame)
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) start() // con la pestaña oculta no se dibuja nada
    }
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', resize)
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="visual-overlay" role="dialog" aria-modal="true" aria-label="Vista fractal">
      {fallback ? <div className="fractal-fallback" aria-hidden="true" /> : <canvas ref={canvas} className="visual-canvas" aria-hidden="true" />}
      <button type="button" className="visual-close" onClick={onClose}>
        Salir (Esc)
      </button>
    </div>
  )
}
