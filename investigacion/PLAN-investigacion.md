# Plan de investigación: base clínica de la app (binaurales, respiración de resonancia y fractales)

Documento maestro. Cada etapa se ejecuta en un chat distinto, pasándole este archivo y el prompt de esa etapa (§7). Autor del diseño: Miguel Morales (psiquiatra). Los chats ejecutores no cambian el método; si algo no encaja, lo anotan en "Incidencias".

## 1. Objetivo

Construir un dossier clínico riguroso y actualizado sobre las tres intervenciones de la app, con tres usos:

- Saber qué puede afirmar la app (textos de "Ciencia", avisos y presets) y qué no.
- Servir como material de referencia clínico, propio y citable.
- Ser la fuente única de los extractos para el blog y las RRSS. Ningún contenido divulgativo puede afirmar algo que no esté en el dossier con su nivel de certeza.

Los documentos de partida (tres informes generados con IA, sobre binaurales, fractales y HRVB) contienen afirmaciones mezcladas: unas sólidas, otras exageradas y otras erróneas o mal citadas. No se usan como fuente, solo como lista de afirmaciones a verificar (§3).

## 2. Método

**Preguntas PICO por tema.** Población: adultos sanos o con ansiedad, estrés, insomnio o depresión. Intervención: la técnica. Comparador: placebo (p. ej., tono sin pulso), lista de espera, música o atención habitual. Resultados: ansiedad, estrés, sueño, cognición, dolor, variabilidad cardíaca, EEG.

**Jerarquía de evidencia** (busca siempre de arriba abajo):

1. Metaanálisis y revisiones sistemáticas (priorizando los de los últimos 8 años).
2. Ensayos controlados aleatorizados (ECA), sobre todo los que tienen grupo placebo activo.
3. Estudios experimentales controlados (laboratorio, EEG).
4. Observacionales, pilotos, modelos animales: solo para contexto o hipótesis, nunca para respaldar una afirmación de la app.

**Nivel de certeza** asignado a cada afirmación (GRADE simplificado):

- **Alta:** varios metaanálisis o ECA consistentes, con efecto clínicamente relevante.
- **Moderada:** un metaanálisis con heterogeneidad o sesgo de publicación, o varios ECA pequeños pero consistentes.
- **Baja:** ECA aislados, pilotos o resultados inconsistentes.
- **Muy baja o sin evidencia:** solo teoría, estudios con animales, fuentes comerciales, o hallazgos que no se han podido replicar.
- **Refutada:** la evidencia de calidad apunta en contra.

**Herramientas:**

- **Consensus** (conector): búsqueda principal. Pregunta en inglés y en formato de pregunta (las preguntas de sí/no activan el "Consensus Meter").
- **PubMed** (conector): para confirmar el DOI y el PMID, leer el abstract completo y buscar estudios que Consensus no saque.
- **verify_reference / lookup_article_by_citation**: para comprobar que toda referencia existe y está bien citada. No se admite ninguna referencia sin DOI o PMID verificado.

No uses blogs, webs de apps comerciales ni Medium como fuente.

## 3. Registro de afirmaciones a verificar

Estado previo = mi valoración inicial (es una hipótesis, no una conclusión). Las búsquedas de §4 están pensadas para resolver cada fila.

### 3.1 Ritmos binaurales y audio

| ID | Afirmación (de los documentos originales) | Estado previo | Búsquedas |
|---|---|---|---|
| A1 | Los binaurales reducen la ansiedad (efecto medio, g ≈ 0.45) | Moderada; hay que revisar la heterogeneidad y el sesgo de publicación | B01–B03 |
| A2 | Los binaurales "arrastran" el EEG hacia la frecuencia del pulso | Baja o inconsistente (el documento citaba al revés una revisión de 2023) | B04–B05 |
| A3 | Los isocrónicos producen una respuesta cortical (ASSR) más fuerte que los binaurales | Plausible a nivel fisiológico; falta saber si eso se traduce en beneficio clínico | B06 |
| A4 | Mejoran el sueño (delta) | Baja | B07 |
| A5 | Reducen el dolor percibido | Moderada o baja | B08 |
| A6 | Reducen la ansiedad preoperatoria | Moderada (ECA en cirugía y odontología) | B09 |
| A7 | Mejoran la memoria y la atención; theta empeora el recuerdo verbal | Baja o mixta | B10 |
| A8 | Gamma (40 Hz) aumenta la flexibilidad cognitiva | Baja (pocos estudios) | B11 |
| A9 | La estimulación a 40 Hz reduce el amiloide y frena el Alzheimer | Muy baja en humanos; hay datos de no replicación en ratones | B12–B13 |
| A10 | El ruido rosa nocturno mejora la memoria | Confundida: la estimulación en lazo cerrado (closed-loop) sobre las ondas lentas es distinta del ruido continuo, que podría perjudicarla | B14–B15 |
| A11 | La portadora óptima está por debajo de 1000 Hz (~400 Hz) | Sólida en psicoacústica | B16 |
| A12 | 432 Hz relaja más que 440 Hz | Muy baja | B17 |
| A13 | Los mensajes subliminales enmascarados tienen efecto | Muy baja; se excluye de la app | B18 |
| A14 | Riesgo de crisis epilépticas y efectos adversos | Hay que documentarlo para los avisos | B19 |
| A15 | Binaurales frente a música elegida por el paciente | Por aclarar | B20 |

### 3.2 Respiración de resonancia y biofeedback de variabilidad cardíaca (HRVB)

| ID | Afirmación | Estado previo | Búsquedas |
|---|---|---|---|
| R1 | El HRVB reduce el estrés y la ansiedad | Moderada o alta | R01–R02 |
| R2 | El HRVB mejora los síntomas depresivos | Moderada | R03 |
| R3 | La respiración lenta sin biofeedback (solo el marcapasos) también funciona | Clave para la app; por aclarar | R04–R05 |
| R4 | La frecuencia de resonancia individual es mejor que 6 rpm fijas | Por aclarar | R06–R07 |
| R5 | Espirar más tiempo que inspirar aumenta el efecto vagal | Baja o moderada | R08 |
| R6 | Protocolo de 20 min dos veces al día durante 8–10 semanas; microdosis | Hay que documentar la dosis y respuesta | R09 |
| R7 | HRVB en TEPT, pánico e insomnio | Por aclarar por indicación | R10–R12 |
| R8 | HRVB en hipertensión y asma | Moderada (asma) / por aclarar | R13–R14 |
| R9 | Las apps con marcapasos respiratorio son eficaces | Por aclarar | R15 |
| R10 | La medición de la variabilidad con la cámara del móvil (PPG) es válida | Moderada en reposo | R16 |
| R11 | Riesgos: hiperventilación y ansiedad interoceptiva en el pánico | Documentar | R17 |
| R12 | Validez de los índices de "coherencia" (HeartMath) | Por aclarar; posible sesgo comercial | R18 |

### 3.3 Visualización de fractales

| ID | Afirmación | Estado previo | Búsquedas |
|---|---|---|---|
| F1 | Preferencia universal por D ≈ 1.3–1.5 | Moderada (estudios psicofísicos replicados, pero pequeños) | V01 |
| F2 | Ver fractales aumenta el alfa frontal y el beta parietal | Baja (muestras pequeñas) | V02 |
| F3 | Los fractales estadísticos funcionan mejor que los exactos | Baja | V03 |
| F4 | La exploración ocular sigue un patrón fractal (D ≈ 1.4) | Baja | V04 |
| F5 | Recuperación del estrés "un 60 % más rápida" | Muy baja: probablemente no publicada en revistas revisadas | V05 |
| F6 | Las imágenes de naturaleza restauran la atención y reducen el estrés (teoría ART) | Moderada (revisiones con heterogeneidad) | V06–V07 |
| F7 | La naturaleza en pantalla o en realidad virtual reduce el estrés | Moderada o baja | V08 |
| F8 | Visualización fractal como intervención clínica | Probable laguna: confirmarlo | V09 |
| F9 | El parpadeo luminoso entre 3 y 30 Hz conlleva riesgo de epilepsia fotosensible | Alta (para los avisos) | V10 |
| F10 | La luz azul por la noche suprime la melatonina | Alta (contradice a los documentos) | V11 |
| F11 | El entrenamiento audiovisual (AVE) es eficaz | Baja | V12 |

### 3.4 Combinaciones (lo que hace la app de forma única)

| ID | Afirmación | Estado previo | Búsquedas |
|---|---|---|---|
| X1 | Combinar respiración lenta con música o binaurales potencia el efecto | Probable laguna | X01–X02 |
| X2 | Las intervenciones digitales autoguiadas de relajación reducen la ansiedad | Moderada | X03 |
| X3 | Expectativa y placebo en las intervenciones con sonido | Clave para interpretar todo | X04 |

## 4. Búsquedas para Consensus

Formato: ID — consulta, con el filtro sugerido entre corchetes. Lanza primero sin filtro; si salen más de 10 estudios débiles, repite con el filtro.

### 4.1 Binaurales y audio

- **B01** — Do binaural beats reduce anxiety? [study_types: meta-analysis, systematic review]
- **B02** — Efficacy of binaural auditory beats in cognition, anxiety, and pain perception: meta-analysis
- **B03** — Publication bias and heterogeneity in binaural beat studies
- **B04** — Do binaural beats entrain brainwaves measured by EEG?
- **B05** — Systematic review of binaural beat effects on EEG power and functional connectivity
- **B06** — Auditory steady-state response to binaural beats versus monaural beats versus isochronic tones
- **B07** — Do binaural beats improve sleep quality or increase slow-wave sleep?
- **B08** — Do binaural beats reduce pain perception or analgesic use? [randomized controlled trial]
- **B09** — Binaural beats for preoperative or dental anxiety randomized controlled trial
- **B10** — Effect of theta and beta binaural beats on working memory and attention
- **B11** — Does 40 Hz gamma binaural beat stimulation improve cognitive flexibility or divergent thinking?
- **B12** — Does 40 Hz auditory or audiovisual sensory stimulation slow cognitive decline in Alzheimer's disease patients? [randomized controlled trial]
- **B13** — Failure to replicate 40 Hz gamma entrainment amyloid reduction in mouse models
- **B14** — Closed-loop auditory stimulation of slow oscillations during sleep and memory consolidation
- **B15** — Does continuous pink noise during sleep affect sleep-dependent memory or sleep architecture?
- **B16** — Optimal carrier frequency for perceiving binaural beats
- **B17** — Does music tuned to 432 Hz reduce heart rate or anxiety compared with 440 Hz?
- **B18** — Do subliminal auditory messages masked by noise influence behavior or mood?
- **B19** — Adverse effects of binaural beats or rhythmic auditory stimulation, including seizures
- **B20** — Binaural beats versus music for anxiety reduction

### 4.2 Respiración de resonancia y HRVB

- **R01** — Does heart rate variability biofeedback reduce stress and anxiety? [meta-analysis]
- **R02** — Heart rate variability biofeedback effects on emotional and physical health: systematic review and meta-analysis
- **R03** — Does heart rate variability biofeedback reduce depressive symptoms? [meta-analysis]
- **R04** — Does slow-paced breathing at six breaths per minute without biofeedback reduce anxiety?
- **R05** — Effects of voluntary slow breathing on heart rate variability: meta-analysis
- **R06** — Is breathing at individual resonance frequency more effective than six breaths per minute?
- **R07** — Reliability and determination of the resonance frequency in heart rate variability biofeedback
- **R08** — Effect of inhalation to exhalation ratio during slow breathing on heart rate variability and relaxation
- **R09** — Dose-response of heart rate variability biofeedback: session duration and number of sessions
- **R10** — Heart rate variability biofeedback for posttraumatic stress disorder randomized trial
- **R11** — Slow breathing or HRV biofeedback for panic disorder
- **R12** — Heart rate variability biofeedback or slow breathing for insomnia
- **R13** — Does slow breathing or HRV biofeedback lower blood pressure in hypertension?
- **R14** — Heart rate variability biofeedback for asthma randomized controlled trial
- **R15** — Efficacy of smartphone breathing apps or paced breathing apps for stress
- **R16** — Validity of smartphone camera photoplethysmography for heart rate variability
- **R17** — Can slow or paced breathing trigger hyperventilation or anxiety in panic disorder?
- **R18** — Validity of the HeartMath coherence ratio as a measure of psychophysiological coherence

### 4.3 Fractales, naturaleza y seguridad visual

- **V01** — Do people prefer fractal patterns with mid-range fractal dimension between 1.3 and 1.5?
- **V02** — EEG responses to viewing fractal images with different fractal dimensions
- **V03** — Statistical versus exact fractals: differences in perception and physiological response
- **V04** — Are human eye movement search patterns fractal?
- **V05** — Does viewing fractal patterns reduce physiological stress measured by skin conductance?
- **V06** — Attention restoration theory: systematic review of exposure to natural environments
- **V07** — Do images or videos of nature reduce stress compared with urban images?
- **V08** — Does virtual reality nature exposure reduce stress and anxiety?
- **V09** — Fractal art or fractal visualization as an intervention for anxiety or stress
- **V10** — Photosensitive epilepsy flash frequency thresholds and guidelines for visual media
- **V11** — Does evening exposure to blue light or screens suppress melatonin and delay sleep?
- **V12** — Efficacy of audio-visual entrainment for anxiety, sleep, or cognition

### 4.4 Combinaciones

- **X01** — Does combining slow breathing with music increase heart rate variability or relaxation?
- **X02** — Binaural beats combined with breathing or meditation
- **X03** — Efficacy of self-guided digital relaxation interventions for anxiety [meta-analysis]
- **X04** — Placebo and expectation effects in binaural beat or sound-based interventions

## 5. Plantillas

### 5.1 Ficha de estudio

Una por artículo incluido; en `fichas/<tema>/<PrimerAutor><Año>.md`.

```markdown
# <Primer autor> <año> — <título corto>
- Cita completa (Vancouver): …
- DOI: …   PMID: …   (verificado: sí/no)
- Diseño: MA / RS / ECA / experimental / otro      N total: …
- Población: …
- Intervención (parámetros exactos: frecuencia, portadora, duración, nº de sesiones): …
- Comparador: …
- Resultados principales (tamaño del efecto con IC 95 %): …
- Limitaciones (sesgo, heterogeneidad, financiación, conflicto de interés): …
- Afirmaciones del registro a las que responde: A1, A6…  → apoya / contradice / matiza
- Parámetros útiles para la app: …
- Cita breve divulgativa (≤ 25 palabras, con mis palabras): …
```

### 5.2 Tabla resumen por tema

Archivo `sintesis/<tema>-evidencia.md`.

```markdown
| ID | Afirmación | Veredicto | Certeza | Estudios clave | Qué puede decir la app | Qué NO puede decir |
```

### 5.3 Bibliografía

Un archivo `bibliografia.csv` con las columnas `id, autores, año, titulo, revista, doi, pmid, diseño, tema, afirmaciones`. Opcional: importarlo en Zotero.

## 6. Productos finales

### 6.1 Dossier clínico

Un documento por técnica y un capítulo de integración: mecanismo propuesto, evidencia por indicación, parámetros con respaldo, seguridad y contraindicaciones, lagunas, y conclusiones con su nivel de certeza.

### 6.2 Registro de afirmaciones resuelto

§3 con su veredicto: es la "lista de lo que se puede decir".

### 6.3 Textos para la app

"Acerca de / Ciencia", avisos y descripción de los presets.

### 6.4 Banco de contenidos divulgativos

Cada pieza remite a las IDs del registro. Ideas de piezas:

- "¿Funcionan los binaurales? Lo que dicen los metaanálisis"
- "Respirar a 6 por minuto: la fisiología del barorreflejo"
- "Fractales y naturaleza: qué sabemos y qué no"
- "40 Hz y Alzheimer: entre la esperanza y la replicación"
- "Mitos: 432 Hz, subliminales y 'frecuencias curativas'"

**Reglas para el contenido divulgativo:**

- Solo afirmaciones con certeza moderada o alta, siempre matizadas; las de certeza baja solo como "hay estudios preliminares".
- Nunca prometer curar o tratar enfermedades. Hay que tener en cuenta el RD 1907/1996 sobre publicidad de productos con pretendida finalidad sanitaria y, si la app se promociona con fines terapéuticos, el reglamento europeo de productos sanitarios (MDR).
- Cada pieza lleva sus referencias, o un enlace al dossier.

## 7. Prompts para cada chat

### Etapa 1 — Búsqueda (un chat por bloque: binaurales, respiración, fractales y combinaciones)

> Adjunto PLAN-investigacion.md. Eres el ejecutor de la Etapa 1 (búsqueda) para el bloque <BINAURALES §4.1 | RESPIRACIÓN §4.2 | FRACTALES §4.3 | COMBINACIONES §4.4>.
>
> 1. Lanza en Consensus cada búsqueda del bloque, en el orden indicado (como mucho 3 a la vez). Si una devuelve sobre todo estudios débiles, repítela con el filtro sugerido.
> 2. Selecciona por búsqueda los 3–6 mejores estudios según la jerarquía de §2 (prioriza metaanálisis, revisiones sistemáticas y ECA con placebo activo; incluye también los estudios que CONTRADICEN la afirmación).
> 3. Verifica cada estudio en PubMed (DOI/PMID) y descarta el que no puedas verificar.
> 4. Entrega: (a) una tabla por búsqueda con autor, año, diseño, N, hallazgo principal en una frase, DOI y afirmaciones del §3 a las que responde; (b) un borrador de `bibliografia.csv` (§5.3); (c) "Incidencias": búsquedas sin resultados útiles y nuevas búsquedas que propones.
>
> No redactes conclusiones todavía. No uses fuentes comerciales.

### Etapa 2 — Fichas y veredictos (un chat por tema)

> Adjunto PLAN-investigacion.md y la salida de la Etapa 1 del tema <X>. Eres el ejecutor de la Etapa 2.
>
> 1. Para cada estudio incluido, lee el abstract completo (o el texto completo si está en acceso abierto vía PubMed) y rellena la ficha de §5.1.
> 2. Con las fichas, rellena la tabla de §5.2 para todas las afirmaciones del tema en §3, asignando veredicto y certeza según §2. Sé conservador: ante la duda, el nivel inferior.
> 3. Señala las lagunas de evidencia y las contradicciones entre estudios.
>
> Entrega las fichas y la tabla de síntesis en Markdown.

### Etapa 3 — Dossier clínico

> Adjunto PLAN-investigacion.md y las tablas de síntesis y fichas de los tres temas. Redacta el dossier clínico de §6.1, en español, con un tono técnico para profesionales sanitarios: un capítulo por técnica más uno de integración y seguridad. Cada afirmación lleva su nivel de certeza y su cita (Vancouver, con DOI). Incluye un apartado de "Parámetros recomendados para la app" que se pueda contrastar con PLAN-app-binaural.md, y un "Registro de afirmaciones resuelto".

### Etapa 4 — Contenidos derivados

> Adjunto el dossier clínico y el registro de afirmaciones resuelto. Siguiendo las reglas de §6.4 de PLAN-investigacion.md, genera: <1 artículo de blog de unas 1200 palabras sobre X | 5 publicaciones para Instagram/LinkedIn | un hilo>. Cada afirmación debe corresponder a una ID del registro con certeza moderada o alta. Al final, lista las IDs y las referencias usadas. Tono divulgativo y riguroso, sin promesas terapéuticas.
