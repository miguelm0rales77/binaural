import { useEffect, useRef } from 'react'
import { FIRST_USE } from '../texts'

/** Pantalla de primer uso: bloquea la app hasta pulsar «Entendido». */
export function FirstUse({ onAccept }: { onAccept: () => void }) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => button.current?.focus(), [])

  return (
    <div className="overlay">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-use-title"
        aria-describedby="first-use-intro"
        // Un solo control: el foco no puede salir del diálogo.
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault()
            button.current?.focus()
          }
        }}
      >
        <h2 id="first-use-title">{FIRST_USE.title}</h2>
        <p id="first-use-intro">{FIRST_USE.intro}</p>
        <ul>
          {FIRST_USE.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <button ref={button} type="button" className="play" onClick={onAccept}>
          {FIRST_USE.button}
        </button>
      </div>
    </div>
  )
}
