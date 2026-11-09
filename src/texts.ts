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
      'No hagas estas respiraciones mientras haces actividades en las que perder el conocimiento podría ponerte en peligro: nadar o estar en el agua, conducir, manejar maquinaria o subir a una escalera.',
      'No es un producto sanitario ni sustituye a ningún tratamiento médico o psicológico.',
    ],
    button: 'Entendido',
  },
  /** Frase de cierre del panel: el biofeedback aún no existe, así que la guía es solo un ritmo. */
  notSensor:
    'Es un ritmo para guiar la respiración, no un biofeedback: la aplicación no mide tu pulso.',
  lips: 'Espira despacio, con los labios fruncidos.',
  /** Aviso al quitar las limitaciones de seguridad del editor. */
  advanced:
    'Sólo para respiradores avanzados. Sin estas limitaciones puedes elegir ciclos muy rápidos, con riesgo de respirar de más (mareo, hormigueo), o retenciones largas, con riesgo de mareo o pérdida de conocimiento. Al quitarlas asumes ese riesgo.',
  /** Recordatorio permanente: nunca con retenciones en actividades peligrosas si se pierde el conocimiento. */
  activities:
    'No hagas estas respiraciones, sobre todo las retenciones, mientras haces actividades en las que perder el conocimiento podría ponerte en peligro: nadar o estar en el agua, conducir, manejar maquinaria o subir a una escalera.',
} as const

/** Aviso de fotosensibilidad de la vista fractal: se muestra la primera vez que se abre (§C2.5). */
export const FIRST_USE_VISUAL = {
  title: 'Antes de usar la vista fractal',
  text: 'La imagen cambia de color y de forma muy despacio, sin destellos y sin seguir el pulso del audio. Aun así, si tienes epilepsia o eres sensible a la luz, no la uses. Sal con el botón «Salir» o con la tecla Esc.',
  button: 'Entendido',
} as const

/** Etiquetas de la vista fractal. */
export const VISUAL_LABELS = {
  night: 'Modo noche',
  palettes: {
    calm: 'Verdes y azules suaves',
    focus: 'Neutra, de bajo contraste',
    depth: 'Azul profundo y violeta',
    night: 'Ámbar oscuro',
    neutral: 'Neutra',
    teal: 'Verde azulado suave',
  },
  staticHint: 'La imagen no parpadea ni sigue al pulso del audio: solo puede seguir la respiración, que es muy lenta.',
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

/**
 * Meditación bilateral (uso personal de prueba, no clínico). Ningún texto promete efectos, ni alivio ni
 * relajación garantizada: el test de «Textos» de tests/bilateral-texts.test.ts lo vigila.
 */
export const BILATERAL_TEXT = {
  title: 'Meditación bilateral',
  banner: 'Uso personal de prueba. No sustituye a un tratamiento. Si el malestar es intenso, para la sesión y busca apoyo.',
  intro:
    'Una sesión guiada con un sonido que se mueve de un oído a otro. La idea es observar cómo se siente y cómo cambia tu atención al escucharlo. No hay ningún resultado que esperar.',
  headphones: 'Usa auriculares. Sin ellos no se percibe el paneo entre oídos.',
  stereoMissing:
    'Tu salida de audio no admite estéreo. Conecta auriculares o unos altavoces estéreo para usar esta sección.',
  headphonesUnknown: 'La aplicación no puede comprobar si los auriculares están conectados; solo si la salida admite estéreo.',
  limits: 'La sesión dura como máximo 30 minutos. Puedes pararla en cualquier momento con «Salir».',
  defaults: 'Velocidades, duraciones y volúmenes por defecto neutros: ajustables y no validados.',
  speed: {
    label: 'Velocidad del paneo',
    hint: 'Ciclos por segundo (Hz). Un ciclo es ir de un lado al otro y volver.',
  },
  modes: {
    pulses: '(a) Paneo alternante de pulsos discretos',
    continuous: '(b) Paneo continuo sobre tono sostenido',
    none: '(c) Sin paneo, solo fondo',
  },
  modeLabel: 'Modo de estimulación',
  blindOn:
    'Modo ciego: la app elige el modo al azar al empezar y no lo muestra hasta el registro, al final de la sesión.',
  blindOff: 'Modo visible: eliges tú el modo.',
  blindHidden: 'Modo oculto hasta el final de la sesión.',
  bgBinaural: 'Fondo binaural: dos tonos fijos, uno en cada oído. No se pasean.',
  bgBeat: 'Diferencia entre los dos tonos (Hz)',
  bedLabel: 'Cama: suena en «Calma» y, en el modo (c), durante toda la sesión',
  bedNames: { rain: 'Lluvia (síntesis)', pink: 'Ruido rosa filtrado', drone: 'Dron neutro' },
  haptics: 'Vibración al cambiar de lado (si el dispositivo la admite)',
  hapticsUnavailable: 'Este navegador no permite vibrar (por ejemplo, iOS Safari). La opción está desactivada.',
  start: 'Empezar la calibración',
  calibration: {
    title: 'Calibración',
    intro:
      'Antes de empezar, comprueba que cada tono suena en el oído indicado. Sube el volumen hasta que lo oigas bien, sin molestarte.',
    left: 'Ahora suena un tono solo en el oído izquierdo. ¿Lo oyes solo en el izquierdo?',
    right: 'Ahora suena un tono solo en el oído derecho. ¿Lo oyes solo en el derecho?',
    yes: 'Sí, lo oigo',
    no: 'No lo oigo bien',
    retry: 'Repetir la calibración',
    stuck:
      'Si no lo oyes en el oído correcto, revisa los auriculares (canales invertidos o cable) y repite. No se empieza sin calibrar.',
  },
  meditation: {
    title: 'Meditación',
    calma: 'Calma',
    exit: 'Salir',
    discomfort: 'Malestar (0 = ninguno, 10 = el máximo)',
    remaining: 'Quedan',
    limit: 'Límite de 30 min',
  },
  guide: [
    { text: 'Siéntate con la espalda cómoda. Deja que el sonido suene de fondo, sin buscar nada en especial.', sec: 40 },
    { text: 'Nota cómo respiras, sin cambiarlo.', sec: 60 },
    { text: 'Pausa. Solo escucha.', sec: 40 },
    { text: 'Lleva la atención al cuerpo: los apoyos, el peso, la temperatura. Lo que aparezca, déjalo estar.', sec: 60 },
    { text: 'Pausa.', sec: 40 },
    { text: 'Escucha el sonido: dónde está, cuánto se mueve, cómo cambia. Cuando te distraigas, vuelve a él sin juzgarte.', sec: 90 },
    { text: 'Si algo te incomoda, sube la marca de malestar o pulsa «Calma». No hay que aguantar nada.', sec: 40 },
  ],
  pause: {
    title: 'Calma',
    text: 'El paneo se atenúa poco a poco hasta casi quedarse quieto, y entra una cama continua sin alternancia. Sigue el círculo y respira a tu ritmo.',
    resume: 'Volver a la meditación',
    resumeBlocked: 'Hay un malestar de 8 o más marcado. Para volver a la meditación, baja primero la marca por debajo de 8.',
    alert:
      'Has marcado un malestar de 8 o más. La alternancia se ha detenido. Quédate en Calma con la respiración o sal de la sesión. Si el malestar persiste, busca apoyo de una persona de confianza o de un profesional.',
  },
  closing: {
    title: 'Cierre',
    steps: [
      'Vuelve a la respiración: nota cómo entra y sale el aire, sin cambiarlo.',
      'Nota el cuerpo: los puntos de apoyo, el peso, la temperatura.',
      'Mira a tu alrededor y reconoce dónde estás, aquí y ahora.',
    ],
    button: 'Continuar',
  },
  endReasons: {
    usuario: 'Terminaste la sesión cuando quisiste.',
    duracion: 'Se alcanzó la duración que elegiste.',
    limite: 'Se alcanzó el límite de 30 minutos.',
  },
  record: {
    title: 'Registro (opcional)',
    intro: 'Si quieres, anota cómo ha sido. Todo se guarda solo en este dispositivo.',
    scales: { calma: 'Calma', atencion: 'Atención', activacion: 'Activación', malestar: 'Malestar' },
    scaleHint: '0 = mínimo, 10 = máximo. Déjalo vacío si no quieres marcarlo.',
    note: 'Nota libre',
    modeTitle: 'Modo de esta sesión',
    modeHidden: 'El modo estaba oculto durante la sesión.',
    save: 'Guardar',
    skip: 'No guardar',
    done: 'Listo. Puedes empezar otra sesión cuando quieras.',
  },
  data: {
    delete: 'Borrar todos los datos de esta sección',
    confirm: '¿Borrar la configuración y el registro de la meditación bilateral de este dispositivo? No se puede deshacer.',
    deleted: 'Datos de la meditación bilateral borrados de este dispositivo.',
  },
} as const
