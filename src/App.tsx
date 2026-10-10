import { useEffect, useRef, useState } from 'react'
import { AudioController, type StateInfo } from './audio/AudioController'
import { DEFAULT_PARAMS, type EngineParams } from './dsp/types'

const CARRIER = { min: 100, max: 1000 }
const BEAT = { min: 0.5, max: 40 }
const STEPS = 1000

/** Slider logarítmico: posición 0..STEPS ↔ valor en [min, max]. */
const toValue = (pos: number, r: { min: number; max: number }) =>
  r.min * Math.pow(r.max / r.min, pos / STEPS)
const toPos = (v: number, r: { min: number; max: number }) =>
  Math.round((Math.log(v / r.min) / Math.log(r.max / r.min)) * STEPS)

type Status = 'stopped' | 'starting' | 'playing' | 'stopping'

export default function App() {
  const controller = useRef<AudioController | null>(null)
  const [params, setParams] = useState<EngineParams>(DEFAULT_PARAMS)
  const [status, setStatus] = useState<Status>('stopped')
  const [info, setInfo] = useState<StateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const c = new AudioController()
    c.onState = setInfo
    c.onStopped = () => setStatus('stopped')
    controller.current = c
    return () => {
      void c.dispose()
    }
  }, [])

  const update = (patch: Partial<EngineParams>) => {
    setParams((p) => ({ ...p, ...patch }))
    controller.current?.setParams(patch)
  }

  const toggle = async () => {
    const c = controller.current
    if (!c) return
    if (status === 'playing') {
      setStatus('stopping')
      c.stop()
      return
    }
    if (status !== 'stopped') return
    setStatus('starting')
    setError(null)
    try {
      await c.play(params)
      setStatus('playing')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('stopped')
    }
  }

  const busy = status === 'starting' || status === 'stopping'
  const label =
    status === 'playing' ? 'Detener' : status === 'stopping' ? 'Deteniendo…' : 'Reproducir'

  return (
    <main className="app">
      <h1>Binaural</h1>
      <p className="hint">Ritmos binaurales: usa auriculares y mantén el volumen bajo.</p>

      <button className="play" onClick={toggle} disabled={busy} aria-live="polite">
        {label}
      </button>
      {error && (
        <p className="error" role="alert">
          No se pudo iniciar el audio: {error}
        </p>
      )}

      <label className="field">
        <span>
          Portadora <output>{Math.round(params.carrierHz)} Hz</output>
        </span>
        <input
          type="range"
          min={0}
          max={STEPS}
          value={toPos(params.carrierHz, CARRIER)}
          aria-label="Frecuencia portadora en hercios"
          onChange={(e) => update({ carrierHz: toValue(Number(e.target.value), CARRIER) })}
        />
      </label>

      <label className="field">
        <span>
          Pulso <output>{params.beatHz.toFixed(1)} Hz</output>
        </span>
        <input
          type="range"
          min={0}
          max={STEPS}
          value={toPos(params.beatHz, BEAT)}
          aria-label="Frecuencia del pulso en hercios"
          onChange={(e) => update({ beatHz: toValue(Number(e.target.value), BEAT) })}
        />
      </label>

      <p className="status" data-testid="status">
        {status === 'playing' && info
          ? `Sonando · ${info.elapsedSec.toFixed(0)} s · pulso ${info.beatHz.toFixed(2)} Hz · portadora ${info.carrierHz.toFixed(1)} Hz`
          : status}
      </p>
    </main>
  )
}
