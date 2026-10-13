import { useEffect, useRef, useState } from 'react'
import { FractalRenderer, OCTAVES_DESKTOP, OCTAVES_MOBILE } from '../visual/FractalRenderer'
import { HURST_MAX, HURST_MIN, NIGHT_MAX_BRIGHTNESS, VISUAL_PRESETS, WARP_MAX, WARP_MIN, sanitizeVisual, type Palette, type VisualSettings } from '../visual/fractalParams'
import { Slider } from './Slider'

/** Tiempo para llegar a un preset nuevo (unos 3 s, según el plan). */
const SETTLE_TAU_SEC = 1

interface Props {
  settings: VisualSettings
  onChange: (s: VisualSettings) => void
  /** Pulmón 0–1 según el reloj de la respiración, o null si no hay respiración activa. */
  lungSource: () => number | null
  /** Muestra el anillo que respira (solo si hay respiración activa). */
  ring: boolean
  /** Control de audio superpuesto: el estado y la acción de Reproducir/Detener. */
  audio: { label: string; disabled: boolean; onToggle: () => void; status: string }
  onClose: () => void
  /** Presets visuales (con el id del preset de audio, si lo hay, para marcarlo). */
  presetId: string | null
  onPreset: (id: string) => void
}

const isMobile = () => window.matchMedia('(max-width: 640px), (pointer: coarse)').matches
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerpPalette = (a: Palette, b: Palette, k: number): Palette => {
  const mix = (x: readonly number[], y: readonly number[]) => [0, 1, 2].map((i) => lerp(x[i] ?? 0, y[i] ?? 0, k)) as unknown as Palette['a']
  return { a: mix(a.a, b.a), b: mix(a.b, b.b), c: mix(a.c, b.c), d: mix(a.d, b.d) }
}

/** Interpola hacia el objetivo. La semilla cambia de golpe (es una acción explícita del usuario). */
function settle(s: VisualSettings, target: VisualSettings, k: number): VisualSettings {
  if (s.seed !== target.seed) return target
  return {
    ...target,
    hurst: lerp(s.hurst, target.hurst, k),
    warp: lerp(s.warp, target.warp, k),
    speed: lerp(s.speed, target.speed, k),
    brightness: lerp(s.brightness, target.brightness, k),
    palette: lerpPalette(s.palette, target.palette, k),
  }
}

/**
 * Vista fractal a pantalla completa. El tiempo del campo se acumula (dt × velocidad), así que cambiar
 * la velocidad nunca salta. Los parámetros se interpolan hacia el objetivo. Se pausa con la pestaña
 * oculta y baja de calidad si los fotogramas van lentos.
 */
export function VisualMode(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef(p)
  const shown = useRef(p.settings)
  const ringEl = useRef<HTMLDivElement>(null)
  // Sin WebGL2 se muestra el degradado CSS; la comprobación es síncrona y no necesita efecto.
  const [fallback] = useState(() => !FractalRenderer.supported())

  useEffect(() => {
    latest.current = p
  })

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    if (fallback) return
    let renderer: FractalRenderer
    try {
      renderer = new FractalRenderer(el, isMobile() ? OCTAVES_MOBILE : OCTAVES_DESKTOP)
    } catch {
      return // el contexto no se pudo crear: queda el anillo y los controles
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
      const cur = latest.current
      shown.current = settle(shown.current, cur.settings, 1 - Math.exp(-dt / SETTLE_TAU_SEC))
      const s = shown.current
      acc += dt * s.speed * (reducedMotion() ? 0.1 : 1)
      const lung = cur.lungSource()
      renderer.render({ t: acc, lung: lung ?? 0.5, settings: s })
      if (ringEl.current) {
        ringEl.current.style.transform = `scale(${(0.5 + 0.5 * (lung ?? 0.5)).toFixed(4)})`
        ringEl.current.style.opacity = cur.ring && lung !== null ? '1' : '0'
      }
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
      if (e.key === 'Escape') latest.current.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const s = p.settings
  const set = (patch: Partial<VisualSettings>) => p.onChange(sanitizeVisual({ ...s, ...patch }))
  const maxBright = s.night ? NIGHT_MAX_BRIGHTNESS : 1

  return (
    <div className="visual-overlay" role="dialog" aria-modal="true" aria-label="Vista fractal">
      {fallback ? <div className="fractal-fallback" aria-hidden="true" /> : <canvas ref={canvas} className="visual-canvas" aria-hidden="true" />}
      <div ref={ringEl} className="breath-ring" aria-hidden="true" style={{ opacity: 0 }} />

      <div className="visual-bar">
        <button type="button" onClick={p.audio.onToggle} disabled={p.audio.disabled}>
          {p.audio.label}
        </button>
        <span className="visual-status">{p.audio.status}</span>
        <button type="button" className="visual-close" onClick={p.onClose}>
          Salir (Esc)
        </button>
      </div>

      <details className="visual-controls">
        <summary>Ajustes visuales</summary>
        <div className="visual-presets" role="group" aria-label="Presets visuales">
          {VISUAL_PRESETS.map((v) => (
            <button key={v.id} type="button" aria-pressed={p.presetId === v.id} onClick={() => p.onPreset(v.id)}>
              {v.name}
            </button>
          ))}
        </div>
        <Slider label="Estructura (H)" ariaLabel="Exponente de Hurst" min={HURST_MIN} max={HURST_MAX} step={0.01} value={s.hurst} format={(v) => v.toFixed(2)} onChange={(hurst) => set({ hurst })} />
        <Slider label="Deformación" ariaLabel="Intensidad de la deformación" min={WARP_MIN} max={WARP_MAX} step={0.05} value={s.warp} format={(v) => v.toFixed(2)} onChange={(warp) => set({ warp })} />
        <Slider label="Velocidad" ariaLabel="Velocidad de deriva" min={0} max={2} step={0.05} value={s.speed} format={(v) => `${v.toFixed(2)}×`} onChange={(speed) => set({ speed })} />
        <Slider label="Brillo" ariaLabel="Brillo" min={0} max={maxBright} step={0.01} value={Math.min(s.brightness, maxBright)} format={(v) => `${Math.round((v / maxBright) * 100)} %`} onChange={(brightness) => set({ brightness })} />
        <label className="check">
          <input type="checkbox" checked={s.night} onChange={(e) => set({ night: e.target.checked })} />
          <span>
            Modo noche
            <small>Paleta cálida y brillo máximo del 35 %.</small>
          </span>
        </label>
        <button type="button" onClick={() => p.onChange({ ...s, seed: (s.seed + 1) >>> 0 })}>
          Nueva forma
        </button>
      </details>
    </div>
  )
}
