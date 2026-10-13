import { useEffect, useRef, useState } from 'react'
import type { BreathPattern } from '../dsp/breath'
import { breathStateInto, type BreathState } from '../dsp/breath'
import { FractalRenderer } from '../visual/FractalRenderer'
import { PALETTES } from '../visual/cpuField'
import { VISUAL_PRESETS, VISUAL_RANGES, sanitizeVisual, type VisualParams, type VisualPreset } from '../visual/params'
import { FIRST_USE_VISUAL, VISUAL_LABELS } from '../texts'
import { readFlag, writeFlag } from '../storage'

export const VISUAL_WARNING_KEY = 'binaural:visual-warning-seen:v1'

interface Props {
  initial: VisualPreset
  playing: boolean
  /** La respiración guiada está activa: el fractal y el anillo siguen su llenado pulmonar. */
  breathOn: boolean
  pattern: BreathPattern
  clock: () => { now: number | null; startedAt: number }
  onTogglePlay: () => void
  onClose: () => void
}

const SEC_LUNG = 0.5 // sin respiración, los pulmones quedan a medio llenar (§C3)
const pct = (v: number) => `${Math.round(v * 100)} %`

/**
 * Vista fractal a pantalla completa (Bloque C). Se abre y se cierra desde la pantalla principal; la reproducción de
 * audio sigue sonando debajo. Salir: el botón «Salir», la tecla Esc o el botón de cerrar.
 */
export function VisualMode({ initial, playing, breathOn, pattern, clock, onTogglePlay, onClose }: Props) {
  const [preset, setPreset] = useState<VisualPreset>(initial)
  const [params, setParams] = useState<VisualParams>(() => sanitizeVisual(initial.params))
  const [warned, setWarned] = useState(() => readFlag(VISUAL_WARNING_KEY))
  // Sin WebGL2 se muestra la alternativa de color plano desde el primer render.
  const [fallback] = useState(() => !FractalRenderer.supported())
  const [showControls, setShowControls] = useState(true)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const renderer = useRef<FractalRenderer | null>(null)

  // Lectura de la respiración: la misma regla que el círculo de «Respirar» (reloj del motor, no setInterval).
  // Se guarda en una referencia dentro de un efecto, no durante el render.
  const lungNow = (): number => {
    if (!breathOn || !playing) return SEC_LUNG
    const { now, startedAt } = clock()
    if (now === null || startedAt <= 0 || now < startedAt) return SEC_LUNG
    return breathStateInto(scratch, now - startedAt, pattern).lung
  }
  const lungRef = useRef(lungNow)
  useEffect(() => {
    lungRef.current = lungNow
  })

  useEffect(() => {
    if (fallback || !canvas.current) return
    try {
      renderer.current = new FractalRenderer(canvas.current, () => lungRef.current(), sanitizeVisual(initial.params))
      renderer.current.start()
    } catch {
      // Si el contexto falla al crearse, la vista cae en la alternativa de color plano.
      renderer.current = null
    }
    return () => {
      renderer.current?.dispose()
      renderer.current = null
    }
  }, [fallback, initial])

  useEffect(() => {
    renderer.current?.setTarget(params)
  }, [params])

  // Anillo de respiración: un círculo discreto superpuesto, con el mismo llenado pulmonar.
  useEffect(() => {
    let raf = 0
    const frame = () => {
      const el = ring.current
      if (el) {
        const lung = lungRef.current()
        el.style.transform = `scale(${(0.6 + 0.4 * lung).toFixed(3)})`
        el.hidden = !(breathOn && playing)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [breathOn, playing])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choosePreset = (id: VisualPreset['id']) => {
    const p = VISUAL_PRESETS.find((x) => x.id === id) as VisualPreset
    setPreset(p)
    setParams(sanitizeVisual(p.params))
  }

  const change = (patch: Partial<VisualParams>) => setParams((p) => sanitizeVisual({ ...p, ...patch }))

  const acceptWarning = () => {
    writeFlag(VISUAL_WARNING_KEY)
    setWarned(true)
  }

  return (
    <div className="visual" role="dialog" aria-modal="true" aria-label="Vista fractal" data-testid="visual-mode">
      {fallback ? (
        <div className="visual-fallback" aria-hidden="true" />
      ) : (
        <canvas ref={canvas} className="visual-canvas" aria-hidden="true" onClick={() => setShowControls((v) => !v)} />
      )}

      <div className="visual-ring" ref={ring} hidden aria-hidden="true" />

      <div className="visual-bar">
        <button type="button" className="secondary" onClick={onTogglePlay}>
          {playing ? 'Detener el audio' : 'Reproducir'}
        </button>
        <button type="button" className="play" onClick={onClose} data-testid="visual-exit">
          Salir
        </button>
      </div>

      {showControls && (
        <div className="visual-controls">
          <p className="muted">
            {preset.name}
            {params.night ? ` · ${VISUAL_LABELS.night}` : ''}
          </p>
          <label className="field">
            <span>Preset</span>
            <select value={preset.id} onChange={(e) => choosePreset(e.target.value as VisualPreset['id'])}>
              {VISUAL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Dimensión (Hurst) <output>{params.hurst.toFixed(2)}</output>
            </span>
            <input
              type="range"
              min={VISUAL_RANGES.hurst.min}
              max={VISUAL_RANGES.hurst.max}
              step={0.01}
              value={params.hurst}
              aria-label="Exponente de Hurst"
              onChange={(e) => change({ hurst: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>
              Deformación <output>{params.warp.toFixed(1)}</output>
            </span>
            <input
              type="range"
              min={VISUAL_RANGES.warp.min}
              max={VISUAL_RANGES.warp.max}
              step={0.1}
              value={params.warp}
              aria-label="Deformación del campo"
              onChange={(e) => change({ warp: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>
              Velocidad <output>{pct(params.speed)}</output>
            </span>
            <input
              type="range"
              min={VISUAL_RANGES.speed.min}
              max={VISUAL_RANGES.speed.max}
              step={0.05}
              value={params.speed}
              aria-label="Velocidad del movimiento"
              onChange={(e) => change({ speed: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>
              Brillo <output>{pct(params.brightness)}</output>
            </span>
            <input
              type="range"
              min={VISUAL_RANGES.brightness.min}
              max={params.night ? VISUAL_RANGES.nightBrightness : VISUAL_RANGES.brightness.max}
              step={0.01}
              value={params.brightness}
              aria-label="Brillo"
              onChange={(e) => change({ brightness: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Paleta</span>
            <select value={params.palette} onChange={(e) => change({ palette: e.target.value as VisualParams['palette'] })}>
              {(Object.keys(PALETTES) as VisualParams['palette'][]).map((id) => (
                <option key={id} value={id}>
                  {VISUAL_LABELS.palettes[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={params.night} onChange={(e) => change({ night: e.target.checked })} />
            <span>
              {VISUAL_LABELS.night}
              <small>Paleta cálida y brillo máximo del 35 %. Pensada para la noche.</small>
            </span>
          </label>
          <p className="muted">{VISUAL_LABELS.staticHint}</p>
        </div>
      )}

      {!warned && (
        <div className="overlay">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="visual-warning-title">
            <h2 id="visual-warning-title">{FIRST_USE_VISUAL.title}</h2>
            <p>{FIRST_USE_VISUAL.text}</p>
            <button type="button" className="play" onClick={acceptWarning}>
              {FIRST_USE_VISUAL.button}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const scratch: BreathState = { phase: 'in', phaseProgress: 0, phaseSec: 0, lung: 0, cycleIndex: 0 }
