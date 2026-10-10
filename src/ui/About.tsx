import { ABOUT, REFERENCE } from '../texts'

export function About() {
  return (
    <main className="app about">
      <a className="back" href="#">
        ← Volver
      </a>
      <h1>{ABOUT.title}</h1>
      {ABOUT.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <section>
        <h2>Referencia</h2>
        <p>
          {REFERENCE.citation}{' '}
          <a href={REFERENCE.doi} target="_blank" rel="noopener noreferrer">
            DOI
          </a>
        </p>
      </section>
    </main>
  )
}
