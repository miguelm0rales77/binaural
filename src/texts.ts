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

export const ISO_FAST_WARNING = {
  text: 'Los pulsos isocrónicos rápidos (13–40 Hz) se perciben como un parpadeo de volumen intenso. Empieza con volumen bajo y detén el sonido si notas molestias. Evítalos si tienes epilepsia o crisis desencadenadas por sonidos.',
  button: 'Entendido',
} as const

export const REFERENCE = {
  citation:
    'Garcia-Argibay, M., Santed, M. A. y Reales, J. M. (2019). Efficacy of binaural auditory beats in cognition, anxiety, and pain perception: a meta-analysis. Psychological Research, 83(2), 357–372.',
  doi: 'https://doi.org/10.1007/s00426-018-1066-8',
} as const

export const ABOUT = {
  title: 'Acerca de / Ciencia',
  sections: [
    {
      heading: 'Qué hace esta aplicación',
      paragraphs: [
        'Genera en tu dispositivo, en tiempo real, tonos con un pulso regular. En el modo binaural cada oído recibe un tono ligeramente distinto y el pulso se percibe por la diferencia (hacen falta auriculares). En el monaural los dos tonos se mezclan antes de llegar al oído. En el isocrónico un solo tono sube y baja de volumen a un ritmo regular.',
        'Como fondo puedes elegir ruido blanco, rosa o marrón, o sonidos de la naturaleza (lluvia, viento, tormenta, río, bosque). Estos últimos se generan por síntesis y suenan artificiales: no son grabaciones.',
        'Todo se calcula localmente: no usa grabaciones, cuentas ni analítica, y no envía ningún dato.',
      ],
    },
    {
      heading: 'Qué dice la investigación',
      paragraphs: [
        'Un metaanálisis de 22 estudios (Garcia-Argibay, Santed y Reales, 2019) encontró un efecto global de tamaño medio (g = 0,45) de los pulsos binaurales sobre la memoria, la atención, la ansiedad y la percepción del dolor.',
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
