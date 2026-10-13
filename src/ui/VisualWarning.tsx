interface Props {
  onAccept: () => void
}

/** Aviso de fotosensibilidad: solo la primera vez que se abre la vista fractal. */
export function VisualWarning({ onAccept }: Props) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="visual-warning-title">
      <div className="modal-card">
        <h2 id="visual-warning-title">Vista fractal</h2>
        <p>
          Las imágenes cambian muy despacio y no tienen destellos. Aun así, si eres fotosensible o tienes epilepsia,
          consúltalo con tu médico antes de usarla. Puedes salir en cualquier momento con Esc o con el botón «Salir».
        </p>
        <button type="button" onClick={onAccept} autoFocus>
          Entendido
        </button>
      </div>
    </div>
  )
}
