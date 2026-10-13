# Decisiones

- **Linter:** se mantiene oxlint (el que trae la plantilla de Vite) en lugar de ESLint; es lo más simple y evita dependencias extra. `npm run lint`.
- **React 18:** la plantilla instala React 19; se fija React 18 como exige el plan.
- **tsconfig:** `strict` + `noUncheckedIndexedAccess`; `tests/` entra en la comprobación de tipos de `tsc -b`.
- **Fase 1 – programas y manual:** si el usuario cambia `beatHz`/`carrierHz` con un programa activo, el programa se cancela (`setParams`). Mientras corre, beat/portadora siguen al programa con τ=0,25 s.
- **Fase 1 – fin de sesión:** el motor inicia el fundido de salida cuando `elapsed ≥ sessionSec` (temporizador) o cuando el programa llega a `durationSec`; el sonido dura 8 s más por el fundido.
- **Fase 1 – cambio de modo/ruido:** los pesos de modo y de tipo de ruido se suavizan (50 ms), así que cambiarlos no produce clics. Se calculan siempre los tres osciladores/ruidos (coste despreciable).
- **Fase 1 – compensación ISO 226:** se recalcula cada 128 muestras con la portadora *actual* (suavizada), no con el objetivo, para que siga el deslizamiento de 2 s.
- **Fase 1 – interpolación de portadora en programas:** se interpola si ambos pasos la definen; si solo uno, se usa ese valor.
- **Fase 1 – rangos:** `setParams` recorta portadora a 100–1000, beat a 0,5–40, profundidad a 0,5–0,98 y ganancias a 0–1.
- **Fase 1 – tests de ruido:** la pendiente se mide directamente sobre `NoiseGenerator` (Welch, Hann, bandas logarítmicas 100 Hz–8 kHz). El marrón da −5,4 dB/oct porque el integrador con pérdida (polo en 1/1,02) aplana por debajo de ~150 Hz; entra en la tolerancia del plan.
- **Fase 2 – mensaje `timer`:** además de los cuatro mensajes del plan, el worklet acepta `{type:'timer', sec}` para el temporizador de sesión (el motor ya lo soporta).
- **Fase 2 – parámetros iniciales:** se pasan al worklet por `processorOptions` y el motor, al arrancar desde parado (`start()`), fija de golpe todos los suavizados. Así no hay deslizamiento desde valores por defecto al pulsar Play.
- **Fase 2 – tipos del worklet:** `src/audio/worklet-globals.d.ts` declara `AudioWorkletProcessor`, `registerProcessor` y `sampleRate`, que el lib DOM no incluye.
- **Fase 2 – sliders:** ya en escala logarítmica (portadora 100–1000, pulso 0,5–40), aunque el plan lo pide en la Fase 3.
- **Fase 2 – ciclo de vida:** tras `stopped` el contexto no se cierra ni se suspende; se reutiliza en el siguiente Play.
- **Fase 3 – sanitizado compartido:** `src/dsp/params.ts` (`sanitizeParams`, `RANGES`) sustituye al sanitizado privado del motor y lo usan también `localStorage` y la UI, así un estado guardado corrupto o fuera de rango nunca llega al audio.
- **Fase 3 – bandas:** límite superior exclusivo (4 Hz → Theta, 8 → Alfa, 13 → Beta, 30 → Gamma). La banda mostrada sigue el pulso *real* mientras suena (sigue el programa o el suavizado).
- **Fase 3 – temporizador:** es la duración total de la sesión medida desde el Play. Si se cambia durante la reproducción y ya se ha pasado, el fundido de salida empieza enseguida. El sonido dura el temporizador + 8 s de fundido.
- **Fase 3 – qué se guarda:** parámetros y temporizador (clave `binaural:state:v1`), con retardo de 250 ms. No se guarda si está sonando ni el programa.
- **Fase 3 – avisos:** solo en modo binaural (portadora > 500 Hz, pulso > 30 Hz). El aviso de isocrónico 13–40 Hz es de la Fase 5.
- **Fase 3 – volúmenes:** sliders lineales (0–100 %), como indica el plan.
- **Fase 4 – presets y volúmenes:** los presets integrados solo fijan modo, frecuencias, ruido (tipo y nivel) y profundidad; **no tocan** `toneGain` ni `masterGain`, para no cambiar el volumen del usuario al cargarlos. «Rosa bajo» = ruido al 15 %; marrón de Pre-sueño = 25 %.
- **Fase 4 – duraciones:** «30–45 min» de Concentración se fija en 30 min. Como 20 min (Relajación, Meditación) no está en la lista fija del temporizador, el temporizador acepta cualquier entero 1–240 min y el selector muestra el valor actual como opción extra.
- **Fase 4 – temporizador (cambia lo de la Fase 3):** ahora cuenta desde que se fija (al elegirlo o al cargar un preset a mitad de sesión), no desde el Play. El motor informa de `remainingSec` (el menor entre el temporizador y el final del programa) y la UI lo muestra.
- **Fase 4 – programas:** el tiempo del programa cuenta desde que se carga (`programOrigin`), así que cargar Pre-sueño a mitad de sesión empieza en su minuto 0. Al llegar a `durationSec` el motor hace el fundido de salida y para.
- **Fase 4 – carga en caliente:** al cargar un preset sonando se envían primero los parámetros (cancelan el programa anterior), luego el programa y el temporizador; modo, ruido y ganancias se suavizan en 50 ms y portadora/pulso con τ=2 s (o 0,25 s si hay programa).
- **Fase 4 – presets del usuario:** se guardan con todos los parámetros actuales (volúmenes incluidos), el programa activo si lo hay y el temporizador. Clave `binaural:presets:v1`, máx. 50, nombre ≤ 40 caracteres, validados al leer. Cualquier cambio manual desmarca el preset activo; tocar pulso o portadora cancela el programa.
- **Fase 4 – lo que no se recuerda:** el programa en curso no se guarda en `binaural:state:v1`; tras recargar queda la configuración (en Pre-sueño, 10 Hz) pero sin programa.
- **Fase 5 – techo de volumen:** `MASTER_CEILING = 0,8` en `src/dsp/params.ts`; lo aplican `sanitizeParams` (UI, estado guardado, presets) y el propio motor (inicial y `setParams`), así que no se puede superar por ninguna vía. El motor admite `masterCeiling` por opción (por eso «por defecto»); los tests de ganancia máxima lo ponen a 1. El slider va de 0 a 0,8 y muestra el porcentaje **sobre el techo** (100 % = 0,8).
- **Fase 5 – primer uso:** diálogo modal (`role="dialog"`, foco atrapado en «Entendido») que tapa la app y bloquea Play hasta aceptar. Se guarda en `binaural:accepted:v1`; si el almacenamiento no está disponible, se mostrará en cada visita (no hay forma de recordarlo).
- **Fase 5 – aviso isocrónico 13–40 Hz:** aviso en línea con botón «Entendido»; «la primera vez» = hasta que se pulsa (se guarda en `binaural:iso-warning-seen:v1`), no una vez por sesión. Aparece también al cargar Gamma 40 Hz.
- **Fase 5 – compensación de sonoridad:** casilla activada por defecto (ya lo estaba en el motor desde la Fase 1).
- **Fase 5 – «Acerca de / Ciencia»:** ruta por hash (`#acerca`) sin dependencias; el botón Atrás del navegador funciona. Cita verificada en PubMed: Garcia-Argibay, Santed y Reales, *Psychol Res* 2019;83(2):357–372, doi:10.1007/s00426-018-1066-8 — 22 estudios, g = 0,45 (efecto medio). La heterogeneidad y que el arrastre medido con EEG no es concluyente vienen del plan, no del resumen del artículo.
- **Fase 5 – textos:** viven en `src/texts.ts` para poder testearlos; un test busca promesas terapéuticas y exige los cuatro avisos del plan.
- **Fase 5 – sonidos de la naturaleza:** el plan los excluye si son grabaciones (§0). No se han implementado en esta fase; propuesta aparte (síntesis procedural).

## Bloque extra (tras la Fase 5): sensibilidad sensorial y sonidos de la naturaleza
- **Nota de sensibilidad sensorial** (TEA, hiperacusis, misofonía) en el aviso de primer uso y sección propia en «Acerca de». Habla de volumen mínimo, pruebas cortas, pulsos lentos y no usar durante una sobrecarga o migraña; **no prohíbe ningún modo** (los relatos revisados son contradictorios: algunas personas prefieren isocrónico). Dice explícitamente que no hay estudios concluyentes. Como el texto legal cambió, `ACCEPTED_KEY` pasa a `v2` y el aviso se muestra una vez más.
- **Volúmenes de arranque más bajos:** tono 0,6 → 0,5 y general 0,5 → 0,3 (con el techo de 0,8, el slider muestra 37 %). Los usuarios que ya tenían un estado guardado conservan el suyo.
- **Sonidos de la naturaleza** (`src/dsp/nature.ts`): lluvia, viento, tormenta, río y bosque, **todos sintetizados** (ruido filtrado + modulación lenta + gotas), sin grabaciones, mono, sin reservar memoria y deterministas con `rand` inyectable. Son opciones del selector «Fondo», que sustituye a «Ruido de fondo»; el `noiseType` y su volumen se reutilizan, así que presets y estados antiguos siguen valiendo.
- **Nivel:** calibrados para tener un RMS parecido al del ruido rosa (≈0,19), de modo que el slider de volumen se comporta igual con cualquier fondo. Medido en 4 min: lluvia 0,21, viento 0,21, río 0,22, tormenta 0,17, bosque 0,19 (varía con la semilla porque las ráfagas son lentas).
- **Sin picos repentinos:** los truenos tienen ataque de 0,6–1,4 s con coseno alzado, decaimiento largo, separación ≥ 10 s y el primero no antes de 8 s; la tormenta no suena nunca con silencio previo a un trueno seco. Test: ataque 10→90 % de 1,15 s; ninguna subida a 100 ms por encima del 35 % del pico.
- **Bosque:** sale como viento suave más susurro de hojas (~87 % de la energía bajo 800 Hz); sin pájaros a propósito, porque un canto sintético sería un sonido repentino y poco creíble. **Es el que menos convence sobre el papel; hay que oírlo.**
- **Cambio de fondo:** los pesos se suavizan en 50 ms (sin clics); un generador solo calcula muestras mientras su peso > 1e-4.
- **Tests y carga de la máquina:** mientras se hacía esto otro proceso del usuario (un juego) usaba >400 % de CPU y los tests iban ~10× más lentos; `testTimeout` global sube a 120 s y los tests de Pre-sueño usan 4 kHz.

## Fase 6 — Exportación WAV, segundo plano y PWA
- **Un solo motor:** la exportación usa el mismo `DspEngine` (`src/audio/render.ts`, TypeScript puro). Test: la salida del WAV coincide con el motor muestra a muestra (0 LSB de diferencia). El render corre en un Web Worker (`export.worker.ts`) por trozos de 10 s con progreso y cancelación (se termina el worker).
- **Formato:** WAV PCM 16 bits estéreo a 44 100 Hz (el motor offline crea su propia instancia a 44,1 kHz, independiente del `AudioContext`). Redondeo y recorte, **sin dithering**: a los niveles de uso el error de cuantización es muy inferior al ruido de fondo. Máximo 60 min (≈ 635 MB), mínimo 1 s.
- **Memoria:** los trozos se agrupan en Blobs de ~32 MB según llegan, para que el navegador pueda sacarlos de memoria; el Blob final es [cabecera][head][cuerpo]. Se avisa a partir de ~300 MB (≈ 28 min). Un export de 60 min en móvil puede fallar por memoria; no se ha probado.
- **Sesión exportada:** incluye fundido de entrada de 8 s y de salida de 8 s que termina exactamente al final (temporizador interno = duración − 8 s). Con un programa activo se exporta el programa y la duración se limita a la del programa (si no, el motor lo termina y quedaría silencio).
- **Bucle de 5 min (sin costuras):**
  - Tono: portadora y pulso se **cuantizan** a múltiplos de 1/T para que cada oscilador dé un número entero de ciclos (cambio < 0,0035 Hz, imperceptible). Test: repetir el bucle da la misma onda con diferencia 0.
  - Fondo (ruido/naturaleza): aleatorio, así que se renderizan T + 3 s y la cola se mezcla con el principio con fundido cruzado de **potencia constante** (nivel plano medido: 0,223 / 0,224 / 0,221 / 0,217).
  - Tono y fondo se renderizan en dos motores, sin `tanh` (`softClip:false`, opción nueva del motor), se suman y se aplica el `tanh` una vez → idéntico a la app (diferencia < 1e-5).
  - El bucle no lleva fundidos ni programa; con programa se usa su primer paso.
- **Segundo plano (iOS):** `BackgroundPlayer` genera el bucle y lo reproduce con `<audio loop>` + `navigator.mediaSession` (título, play/pausa/stop, iconos). El elemento se «desbloquea» con un WAV silencioso dentro del gesto del usuario, porque la generación tarda y iOS bloquearía un `play()` posterior. Es exclusivo con el audio normal (arrancar uno detiene el otro). **El temporizador no se aplica en este modo** (los temporizadores JS se suspenden con la pantalla bloqueada; hay que usar el del móvil) y no hay fundido de entrada (iOS no deja controlar el volumen del elemento). Si cambias ajustes con el modo activo aparece «Regenerar».
- **PWA:** `vite-plugin-pwa` 2.0 (soporta Vite 8). Manifest (`display: standalone`, colores `#0f1218`, iconos 192/512/maskable), iconos generados con `scripts/make-icons.py` (Pillow). Precache de 19 archivos, incluidos el worklet y el worker de exportación.
- **Actualizaciones:** `registerType: 'prompt'` **sin aviso**: el service worker nuevo espera a que se cierre la app, así una actualización nunca recarga la página ni corta una sesión. Contrapartida: una versión nueva se ve al cerrar y reabrir.
- **Rutas absolutas:** `start_url`, `scope` y las rutas de los iconos asumen que la app se sirve en la raíz (`/`). Si se despliega en una subcarpeta (p. ej. GitHub Pages de un repositorio) hay que ajustar `base` — decisión de la Fase 7.
- **Verificación:** el navegador integrado de la app **no admite service workers** (ni uno vacío se registra), así que la PWA se probó en Chrome headless con perfil temporal controlado por CDP (scripts de prueba fuera del repositorio).

## Fase 7 — Pulido, visualización y despliegue
- **Visualización sin parpadeos (desvío deliberado del plan):** el plan pedía «un punto que pulse a la frecuencia del pulso». Se ha hecho **distinto a propósito**: un destello a 3–30 Hz es la gama que puede desencadenar crisis en personas fotosensibles (WCAG 2.3.1 pide ≤ 3 por segundo) y el pulso llega a 40 Hz, además de que la app ya avisa de la epilepsia. En su lugar se dibuja el **patrón de 1 s del pulso** (Δf lóbulos) como forma fija y un punto de brillo constante que lo recorre **una vez por segundo**. Medido: el brillo total del lienzo varía un 1,2 % (solo el propio punto). Está **desactivada por defecto** en cada visita, respeta `prefers-reduced-motion` (queda el patrón estático) y no toca el audio. Si se quisiera el parpadeo literal del plan habría que ponerlo bajo un aviso explícito de fotosensibilidad.
- **Diseño:** columna única de hasta 560 px con 16 px de margen lateral (más con `safe-area-inset`), barra de reproducción fija arriba (`position: sticky`) para llegar siempre a Play al desplazarse, secciones con títulos, y «Exportar a WAV» y «Reproducir en segundo plano» como paneles plegables (`<details>`) cerrados por defecto. Todos los controles interactivos miden ≥ 44 px. Oscuro por diseño (`color-scheme: dark`).
- **Ruta base:** `BASE_PATH` (variable de entorno) controla `base` de Vite, `start_url` y `scope` del manifest y las rutas de los iconos. Verificado con `/` y con `/binaural/`: instalable sin errores en ambos, y audio + exportación funcionan en la subcarpeta.
- **Despliegue:** flujo de GitHub Pages (`.github/workflows/deploy.yml`: tests → build con `BASE_PATH=/<repo>/` → Pages), `netlify.toml` y `vercel.json` (solo salida y `Cache-Control: no-cache` para `sw.js`). **Ninguno de los tres se ha ejecutado** (no hay repositorio remoto ni cuentas); solo se ha comprobado el build equivalente en local.
- **Lighthouse 13.5 (build de producción, Chrome headless):** móvil 99 / 100 / 100 / 100 y escritorio 100 / 100 / 100 / 100 (rendimiento / accesibilidad / buenas prácticas / SEO). Antes de esta fase: 99 / 100 / 100 / 91 (faltaba `robots.txt`). **Lighthouse ya no tiene categoría PWA** (se retiró en la v12): la instalabilidad se comprobó con `Page.getInstallabilityErrors` del protocolo de Chrome → sin errores. Lighthouse se ejecutó con `npx` desde fuera del proyecto: no se añadió ninguna dependencia.
- **Navegadores:** solo se ha verificado Chrome. Safari (macOS/iOS) y Firefox **no se han probado**: no hay Firefox instalado y automatizar Safari exige activar `safaridriver` con contraseña de administrador. Las APIs usadas (AudioWorklet, módulos en Web Worker, Media Session) están en sus versiones actuales, pero hay que comprobarlo a mano.
- **README:** reescrito (qué es, comandos, estructura, despliegue, límites conocidos).

## Leyendas de las bandas (tras la Fase 7)
- **Qué se añadió:** cada banda (delta, theta, alfa, beta, gamma) muestra bajo el indicador una leyenda de una frase (`BAND_LEGENDS` en `src/texts.ts`) y la nota «Es lo que se mide en el cerebro, no un efecto de escuchar este pulso». Antes ninguna banda tenía leyenda, solo nombre y rango.
- **Cómo está redactado:** siempre «En el EEG, …»: describe la actividad cerebral que se mide, **no** lo que hace la aplicación. Un test exige ese arranque, prohíbe construcciones del tipo «te ayuda / te permite / produce» y pasa la leyenda por el mismo filtro de promesas terapéuticas que el resto de textos.
- **Gamma y «resolución de problemas»:** la asociación existe pero es más acotada de lo que suele contarse. Verificado en PubMed: Jung-Beeman et al. (2004, *PLoS Biology*, doi:10.1371/journal.pbio.0020097) registraron con EEG una ráfaga de actividad gamma en el lóbulo temporal anterior derecho ~0,3 s **antes** de soluciones con *insight* («ajá»), no de la resolución de problemas en general. La leyenda dice «insight» y no «resolución de problemas», y «Acerca de» explica que eso describe lo que hace el cerebro por sí mismo y no demuestra que escuchar un pulso de esa frecuencia lo provoque.
- **Qué no se cita:** las leyendas de delta/theta/alfa/beta son descripción de manual del EEG, sin referencia concreta; solo gamma-insight lleva cita.
- **Nombre del preset gamma:** «Gamma 40 Hz» pasa a «Reflexión (gamma)» (a propuesta del usuario; antes se probó «Resolución de problemas (gamma)», descartado por ser una promesa más específica de lo que respalda la evidencia: solo el insight) para ser coherente con «Relajación (alfa)», «Concentración (beta)» y «Meditación (theta)», que ya llevaban etiqueta de uso. Es una etiqueta de uso, igual de «blanda» que las otras tres: no implica que el pulso produzca ese estado (véase «Acerca de»). El `id` interno sigue siendo `gamma-40`; el preset (isocrónico, 400 Hz, 40 Hz, D=0,8, 15 min) no cambia.

## Bloque B — Fase 8: reloj respiratorio y señales sonoras
- **Reloj puro:** `src/dsp/breath.ts` (`breathState`, `breathStateInto`) es función del tiempo. El motor usa `breathStateInto` (sin reservar memoria) en cada muestra; la interfaz y los tests usan la misma función.
- **Integración de la rampa:** en lugar de integrar muestra a muestra, la fase es la integral en forma cerrada de rpm/60 (`cyclesAt`). Es equivalente y evita acumular error; no hay saltos al cambiar de ritmo.
- **Retenciones:** se dan en segundos al ritmo actual. La parte respiratoria del ciclo es `1 − holdIn − holdOut` y se reparte según `inhaleRatio`. Con ritmo constante son exactas; con rampa varían suavemente. Las retenciones se limitan a 0,8 del ciclo.
- **Desvío del plan (texto de la rampa):** el plan dice que «la duración de los ciclos decrece» al bajar de 8 a 6 rpm, pero sus propias cifras (7,5 s al principio, 10 s al final) indican lo contrario: la duración **crece** porque el ritmo baja. Se implementa el ritmo que baja y el test comprueba que cada ciclo dura más que el anterior.
- **Rampa opcional:** solo hay rampa si el patrón trae `rampFromRpm`. Los valores por defecto (8 rpm, 120 s) los pondrá la interfaz en la Fase 9.
- **Campanillas:** suenan al empezar cada fase (inspiración y retención de inspiración a 660 Hz; espiración y retención de espiración a 440 Hz). Seno más 0,3 de segundo armónico, ataque de 5 ms y caída de 60 dB en 1,2 s. Amplitud 0,2, escalada por el volumen del tono: así el bucle de exportación no duplica la campanilla al sumar sus dos motores.
- **Tono guía:** de 220 a 330 Hz según el pulmón; −18 dB (×0,126) respecto al tono; también escalado por el volumen del tono.
- **Oleaje:** ganancia del ruido ×(0,6 + 0,4·pulmón). Con rosa o marrón, además un paso bajo de un polo que sube de 400 a 2500 Hz con el pulmón. Con «sin ruido», rosa a ×0,4 del volumen de ruido, solo mientras suena el oleaje. Blanco y sonidos de la naturaleza solo cambian de ganancia.
- **Suavizado:** el pulmón que usan las señales pasa por un one-pole de 50 ms (no `breathState`, que es exacto). Así los cambios de patrón no producen clics.
- **Reloj del motor:** el origen del reloj se fija al empezar y se recoloca cuando se activa el metrónomo o cambia el patrón mientras suena. El motor informa de `breathOriginSec`; la interfaz mapeará su reloj de contexto con ese valor.
- **Fundidos:** 0,5 s al activar o desactivar; 30 s cuando se cumple `maxSec` (Pre-sueño, Fase 9).
- **Valores por defecto:** oleaje y campanilla activados, tono guía desactivado (según el plan).
- **Exportación en bucle:** el bucle se ajusta a un número entero de ciclos (`loopSecondsFor`): 300 s a 6 rpm; a 5,5 rpm, 294,5 o 305,5 s según el redondeo. El patrón del bucle no tiene rampa y las señales no caducan, para que el bucle sea periódico. La rejilla de frecuencias del tono se cuantiza a esa duración.
- **Estado:** el mensaje `state` del worklet incluye `breathOriginSec`.
- **Rangos:** el motor acepta 3–12 rpm, `inhaleRatio` 0,2–0,8 y retenciones de 0–20 s; la interfaz usará los rangos del plan (4–7 rpm, 0,3–0,5).
- **Pruebas:** `tests/breath.test.ts` (11 + 1 pruebas): duraciones 4,0 s y 6,0 s (±1 ms), continuidad del pulmón (<1e-3 por muestra a 48 kHz), rampa, retenciones, campanilla (±1 muestra), frecuencia del guía (330/220 Hz ±1 %), nivel −18 dB, correlación del oleaje (r > 0,9), silencio exacto sin oleaje, fundido de 30 s y longitud del bucle.
- **Pendiente manual:** «con los ojos cerrados se puede seguir el ritmo solo con el oleaje» se comprobará al escuchar, no con tests.

## Bloque B — Fase 9: interfaz de respiración, presets y sesiones
- **Pantalla:** «Respirar» es una sección dentro de la misma pantalla de reproducción, no una ruta aparte. Así comparte un único motor de audio y un único estado con los presets de sonido.
- **Círculo:** se actualiza en cada fotograma con refs (sin re-renderizar React). Lee el reloj del contexto de audio: `AudioController.breathTimeSec()` = tiempo del contexto − inicio − `breathOriginSec` (que informa el motor). Solo cambia de tamaño; sin destellos. Cuenta atrás con `phaseLengthSec`.
- **Labios fruncidos:** solo es un texto durante la espiración (no se guarda).
- **Rangos:** rpm en pasos de 0,5 entre 4,0 y 7,0; proporción 0,30–0,50 (el motor acepta más). Modo personalizado: segundos de inspiración, retención, espiración y retención; el ritmo sale del ciclo completo (`patternFromSeconds`), y 4-4-4-4 se puede montar, sin ser preset.
- **Rampa:** casilla «Rampa de entrada» (8 → ritmo en 120 s). Se fusiona con cuidado: un parche que menciona la rampa manda sobre la del estado; si no la menciona, se conserva. Sin esto, un patrón parcial heredaba la rampa por defecto (bug encontrado en los tests).
- **Valor por defecto:** el patrón es resonancia 6 con rampa, pero la guía viene desactivada; el usuario la activa.
- **Presets de respiración:** «Resonancia 6» (20 min, con rampa), «Microdosis 3 min» (6 rpm sin rampa) y «Pre-sueño 5,5 rpm» (proporción 0,35, ruido marrón, sin campanilla). Cada uno fija el patrón, las señales y la duración del temporizador.
- **Presets de sonido:** Relajación (alfa) y Pre-sueño llevan la respiración activada; el resto la apaga y conserva el patrón del usuario. Pre-sueño la limita a 10 min (`maxSec: 600`), con fundido de 30 s. Los presets sin respiración ponen `maxSec: null` para no heredar el límite de otro preset.
- **Tipos:** los presets aceptan un parche parcial de respiración (`ParamsPatch`, `BreathPatch`); el motor y `sanitizeParams` lo fusionan.
- **Resumen:** al terminar una sesión con respiración de al menos 1 min aparece el resumen (duración y rpm). El registro de práctica llega en la Fase 10.
- **Primer uso de respiración:** el aviso de seguridad del plan (B4) se muestra una vez, hasta pulsar «Entendido» (`binaural:breath-safety:v1`).
- **Comprobación:** tests de ritmo, segundos, cuenta atrás, presets y fusión de la rampa (`tests/breathing.test.ts`). Con Chromium headless (390 px): sin desbordamiento horizontal (scrollWidth = 390) y sin errores de consola.
- **Pendiente manual:** sesión de 20 min en ordenador y en iPhone con la pantalla bloqueada (modo de segundo plano con señales).

## Bloque B — Fase 10: registro de práctica y «Mi frecuencia»
- **Registro:** `binaural:practice:v1` (localStorage, try/catch). Cada sesión de respiración de al menos 1 min guarda fecha local, minutos (un decimal), rpm y nombre del preset. Las pruebas de «Mi frecuencia» no se registran como práctica.
- **Racha:** días seguidos con práctica terminando hoy; si hoy aún no hay, cuenta desde ayer.
- **Objetivo:** 2 × 20 min al día por defecto, editable (1–10 sesiones, 1–120 min).
- **CSV:** cabecera `fecha,minutos,rpm,preset`, coma como separador y punto decimal. Sin BOM.
- **Sin notificaciones push**, como pide el plan.
- **Prueba escalonada:** 6,5 → 6,0 → 5,5 → 5,0 → 4,5 rpm; 2 min con guía y 1 min de respiración libre entre escalones. Dura 14 min (el último escalón no tiene descanso). Los cambios de escalón los marca el reloj del motor (`stepAt`), no temporizadores de React.
- **Puntuación:** comodidad 1–5 y falta de aire, anotadas durante el descanso que sigue a cada escalón. La recomendación es el escalón más cómodo; en empate, el que no dio falta de aire y luego el ritmo más alto. Sin sensor, es una aproximación por comodidad; el texto de la pantalla lo dice.
- **Desvío menor:** el plan pide puntuar los cinco criterios de la Fase 16 (desfase, amplitud, LF…); aquí no hay sensor, así que se usan solo comodidad y falta de aire.
- **Uso de la frecuencia:** «Resonancia 6» usa la frecuencia guardada si existe; si no, 6 rpm.
- **Parada a mitad de prueba:** se muestran las puntuaciones que haya; si no hay ninguna, se descarta.
- **Sanitizado:** los números fuera de rango se recortan (como en los parámetros), en vez de descartarse.
- **Día actual:** se guarda en estado y se actualiza al terminar una sesión (evita leer la fecha durante el render).
- **Pruebas:** `tests/practice.test.ts` (racha, semana, objetivo, CSV, saneado y recarga, escalones de la prueba, recomendación). Chromium headless (390 px): sin desbordamiento y sin errores de consola.
- **Pendiente:** la sensación de la prueba y el registro se comprueban al usarlos; no tienen tests de interfaz.

## Cierre del Bloque B
Fases 8–10 completas en verde: 176 tests, lint, typecheck y build.

## Bloque C — Fase 11: renderizador base WebGL2
- **Un solo shader:** `fractal.frag.glsl` (fBm con domain warping, hash entero, ruido de gradiente con interpolación quíntica), cargado con `?raw`. Un triángulo a pantalla completa, sin librerías.
- **Octavas:** 6 en escritorio, 5 en móvil. La calidad reducida baja una octava y escala a 0,45.
- **Resolución:** min(devicePixelRatio, 1,5) × 0,6, según el plan.
- **Tiempo del campo:** se acumula dt × velocidad, así cambiar la velocidad no salta la imagen.
- **Pausa:** con la pestaña oculta no se dibuja nada; al volver, el bucle se reinicia sin saltos.
- **Calidad:** si la media de dos segundos baja de 50 fps, se pasa a calidad reducida (una vez).
- **Alternativa sin WebGL2:** degradado CSS lento que solo cambia de posición; se desactiva con `prefers-reduced-motion`.
- **Comprobación:** Chromium headless (SwiftShader) compila el shader y dibuja sin errores; la captura muestra el campo con la paleta. Los 60 fps en portátil y 50 fps en iPhone son medidas manuales, pendientes.
- **Nota de tipos:** `erasableSyntaxOnly` prohíbe las propiedades de parámetro, así que el canvas se guarda en un campo explícito.
