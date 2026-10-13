import { ABOUT, REFERENCE, REFERENCE_INSIGHT } from '../texts'
import { ArrowLeftIcon } from './icons'

export function About() {
  return (
    <main className="app about">
      <a className="back" href="#">
        <ArrowLeftIcon />
        Volver
      </a>
      <p className="eyebrow">Información · Evidencia</p>
      <h1>{ABOUT.title}</h1>
      <div className="rule" aria-hidden="true" />
      {ABOUT.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <section>
        <h2>Referencias</h2>
        {[REFERENCE, REFERENCE_INSIGHT].map((r) => (
          <p key={r.doi} className="cite">
            {r.citation}{' '}
            <a href={r.doi} target="_blank" rel="noopener noreferrer">
              DOI
            </a>
          </p>
        ))}
      </section>
    </main>
  )
}
