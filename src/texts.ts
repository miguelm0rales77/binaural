/** Textos legales y de información. Son prudentes a propósito: no prometen ningún efecto. */

export const FIRST_USE = {
  title: 'Antes de empezar',
  intro: 'Lee estos avisos. Solo aparecen la primera vez.',
  items: [
    'No uses esta aplicación si tienes epilepsia o has tenido crisis desencadenadas por sonidos o estímulos rítmicos, a menos que lo consultes antes con tu médico.',
    'No la uses mientras conduces ni manejas maquinaria, ni en ninguna situación en la que necesites estar plenamente atento.',
    'Mantén el volumen bajo: empieza por un volumen mínimo y súbelo poco a poco. Si algo te molesta, detén el sonido.',
    'Si eres especialmente sensible a los sonidos (por ejemplo, por TEA, hiperacusis o misofonía), empieza con el volumen al mínimo, prueba unos minutos con pulsos lentos y detén el sonido si te molesta. Evita usarla durante una sobrecarga sensorial o una migraña.',
    'No es un producto sanitario ni sustituye a ningún tratamiento médico o psicológico.',
  ],
  button: 'Entendido',
} as const

/** Respiración guiada (§B4 del plan). Solo describe cómo respirar; no promete ningún efecto. */
export const BREATH_TEXT = {
  safety: {
    title: 'Antes de usar la respiración guiada',
    intro: 'Respira de forma suave y natural. Lee estos avisos; solo aparecen la primera vez.',
    items: [
      'Respira de forma suave y natural, por la nariz y con el abdomen. No hagas respiraciones profundas forzadas.',
      'Si notas mareo, hormigueo o palpitaciones, vuelve a respirar de forma normal: suelen aparecer al respirar más de lo necesario.',
      'Si tienes una enfermedad cardíaca o respiratoria importante, consulta antes con tu médico.',
      'En algunas personas con trastorno de pánico, centrarse en la respiración puede aumentar la inquietud al principio. Si es tu caso, empieza con sesiones cortas.',
      'No es un producto sanitario ni sustituye a ningún tratamiento médico o psicológico.',
    ],
    button: 'Entendido',
  },
  /** Frase de cierre del panel: el biofeedback aún no existe, así que la guía es solo un ritmo. */
  notSensor:
    'Es un ritmo para guiar la respiración, no un biofeedback: la aplicación no mide tu pulso.',
  loopNote:
    'El modo de segundo plano y la exportación en bucle todavía no incluyen la respiración guiada.',
  lips: 'Espira despacio, con los labios fruncidos.',
} as const

export const ISO_FAST_WARNING = {
  text: 'Los pulsos isocrónicos rápidos (13–40 Hz) se perciben como un parpadeo de volumen intenso. Empieza con volumen bajo y detén el sonido si notas molestias. Evítalos si tienes epilepsia o crisis desencadenadas por sonidos.',
  button: 'Entendido',
} as const

export const REFERENCE = {
  citation:
    'Garcia-Argibay, M., Santed, M. A. y Reales, J. M. (2019). Efficacy of binaural auditory beats in cognition, anxiety, and pain perception: a meta-analysis. Psychological Research, 83(2), 357–372.',
  doi: 'https://doi.org/10.1007/s00426-018-1066-8',
} as const

/** Qué se mide en el EEG en cada banda. Describe actividad cerebral, no un efecto de esta aplicación. */
export const BAND_LEGENDS = {
  delta: 'En el EEG, la actividad delta es típica del sueño profundo.',
  theta: 'En el EEG, la actividad theta se observa en la somnolencia, la meditación y algunos procesos de memoria.',
  alpha: 'En el EEG, el ritmo alfa es típico de la vigilia relajada, sobre todo con los ojos cerrados.',
  beta: 'En el EEG, la actividad beta se asocia con la vigilia activa y la concentración.',
  gamma:
    'En el EEG, la actividad gamma se ha asociado con la atención, la percepción y la memoria, y con el instante en que se «ve» de golpe la solución de un problema (insight).',
} as const

export const BAND_NOTE = 'Es lo que se mide en el cerebro, no un efecto de escuchar este pulso.'

export const REFERENCE_INSIGHT = {
  citation:
    'Jung-Beeman, M., Bowden, E. M., Haberman, J., Frymiare, J. L., Arambel-Liu, S., Greenblatt, R., Reber, P. J. y Kounios, J. (2004). Neural activity when people solve verbal problems with insight. PLoS Biology, 2(4), e97.',
  doi: 'https://doi.org/10.1371/journal.pbio.0020097',
} as const

export const ABOUT = {
  title: 'Acerca de / Ciencia',
  sections: [
    {
      heading: 'Qué hace esta aplicación',
      paragraphs: [
        'Genera en tu dispositivo, en tiempo real, tonos con un pulso regular. En el modo binaural cada oído recibe un tono ligeramente distinto y el pulso se percibe por la diferencia (hacen falta auriculares). En el monaural los dos tonos se mezclan antes de llegar al oído. En el isocrónico un solo tono sube y baja de volumen a un ritmo regular.',
        'Como fondo puedes elegir ruido blanco, rosa o marrón, o sonidos de la naturaleza (lluvia, viento, tormenta, río, bosque) o de meditación (cuencos tibetanos y gong). Estos últimos se generan por síntesis y suenan artificiales: no son grabaciones.',
        'Todo se calcula localmente: no usa grabaciones, cuentas ni analítica, y no envía ningún dato.',
      ],
    },
    {
      heading: 'Qué dice la investigación',
      paragraphs: [
        'Un metaanálisis de 22 estudios (Garcia-Argibay, Santed y Reales, 2019) encontró un efecto global de tamaño medio (g = 0,45) de los pulsos binaurales sobre la memoria, la atención, la ansiedad y la percepción del dolor.',
        'Los nombres de las bandas (delta, theta, alfa, beta, gamma) son los convencionales del EEG y describen la actividad que se mide en el cerebro. Por ejemplo, un estudio con EEG registró una ráfaga de actividad gamma justo antes de que las personas resolvieran un problema «de golpe», con una sensación de ¡ajá! (Jung-Beeman et al., 2004). Eso describe lo que hace el cerebro por sí mismo: no demuestra que escuchar un pulso de esa frecuencia produzca ese estado.',
        'Aun así, la evidencia es heterogénea: los estudios son pocos y usan frecuencias, duraciones y medidas distintas, y los resultados no son uniformes. Además, que el cerebro se «sincronice» con el pulso, medido con EEG, no está demostrado de forma concluyente.',
      ],
    },
    {
      heading: 'Qué no afirma esta aplicación',
      paragraphs: [
        'Los nombres de las bandas (delta, theta, alfa, beta, gamma) y de los presets son solo descriptivos. La aplicación no promete ningún efecto sobre la salud, el sueño, el ánimo ni el rendimiento, y no diagnostica ni trata nada. Si tienes un problema de salud, consulta con un profesional.',
      ],
    },
    {
      heading: 'Sensibilidad sensorial',
      paragraphs: [
        'Las reacciones a estos sonidos son muy individuales. Algunas personas, también dentro del espectro autista, los toleran bien como fondo; otras los encuentran molestos, sobre todo con volumen alto o con pulsos rápidos. No hay estudios concluyentes sobre cómo les sientan a las personas con TEA, hiperacusis o misofonía.',
        'Si eres sensible a los sonidos: empieza con el volumen al mínimo, prueba unos minutos en un momento de calma (no durante una sobrecarga sensorial ni una migraña), elige pulsos lentos y, si quieres, solo un fondo suave sin tono. Detén el sonido en cuanto notes molestias.',
      ],
    },
    {
      heading: 'Uso responsable',
      paragraphs: [
        'Mantén el volumen bajo y no la uses conduciendo, manejando maquinaria ni si tienes epilepsia o crisis desencadenadas por sonidos sin consultarlo antes con tu médico. Si notas molestias, detén el sonido. Al detenerlo, el volumen baja con un fundido de 8 segundos.',
      ],
    },
  ],
} as const
