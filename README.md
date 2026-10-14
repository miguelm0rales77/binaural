# Binaural

Aplicación web instalable (PWA) que genera en tu dispositivo, en tiempo real, tonos con un pulso regular:
**binaurales**, **monaurales** e **isocrónicos**, con ruido de fondo (blanco, rosa, marrón) o sonidos de la
naturaleza (lluvia, viento, tormenta, río, bosque) o de meditación (cuencos tibetanos y gong), todos sintetizados. Incluye presets, un programa que cambia de
frecuencia con el tiempo («Pre-sueño»), temporizador, exportación a WAV y un modo de reproducción en
segundo plano para iPhone. También incluye:

- **Respiración guiada:** un ritmo lento (por defecto 6 respiraciones por minuto) con un círculo, un oleaje en el
  fondo y, si lo activas, un tono guía y una campanilla. Tiene presets (resonancia, microdosis, pre-sueño) y un
  editor de tiempos personalizados.
- **«Mi frecuencia»:** una prueba escalonada, sin sensor, para encontrar tu ritmo más cómodo.
- **Registro de práctica:** las sesiones de respiración se guardan en el dispositivo, con objetivo diario, racha
  y exportación a CSV. Sin notificaciones.
- **Vista fractal:** un campo fractal a pantalla completa que cambia muy despacio, sin destellos, y que sigue la
  respiración si está activa.

> **Uso personal o de bienestar. No es un producto sanitario ni hace ninguna afirmación terapéutica.**
> No la uses si tienes epilepsia o crisis desencadenadas por sonidos sin consultarlo con tu médico, ni
> conduciendo o manejando maquinaria. Mantén el volumen bajo. No hagas las respiraciones con retenciones mientras
> nadas o estás en el agua, conduces, manejas maquinaria o haces cualquier actividad en la que perder el
> conocimiento pueda ponerte en peligro. Los textos de la aplicación (en español) están en
> [`src/texts.ts`](src/texts.ts).

Todo se calcula en el navegador: sin backend, sin cuentas, sin analítica y sin enviar ningún dato. Las
preferencias se guardan en `localStorage`.

## Requisitos y comandos

Node.js 20.19 o superior (se usa 22 en la integración continua).

```bash
npm install
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm test           # tests del DSP, la exportación y la interfaz (Vitest)
npm run lint       # oxlint
npm run build      # build de producción en dist/ (con service worker)
npm run preview    # sirve dist/ en local (http://localhost:4173)
```

Para ver la PWA y el modo sin conexión hay que usar el build (`build` + `preview`): en `dev` el service worker
está desactivado.

## Cómo funciona

El **mismo** `DspEngine` (TypeScript puro, sin APIs del navegador) lo usan el audio en tiempo real, la
exportación a WAV y los tests: lo que pasa los tests es exactamente lo que suena.

```
src/
  dsp/       Núcleo de audio: osciladores con acumulador de fase, ruido, sonidos de la naturaleza,
             envolvente isocrónica, compensación de sonoridad ISO 226, programas, motor (DspEngine)
  audio/     AudioWorklet y controlador, render offline, exportación WAV (Web Worker),
             reproducción en segundo plano
  ui/        Componentes React
  visual/    Vista fractal: shader WebGL2 (GLSL), copia CPU del campo para las pruebas, presets y calidad
  presets.ts, breathPresets.ts, practice.ts, resonance.ts, bands.ts, warnings.ts, storage.ts, texts.ts, viz.ts
tests/       Vitest, sobre la lógica pura (no hace falta navegador)
scripts/     make-icons.py: genera los iconos de la PWA (requiere Pillow)
```

- **Audio:** un único `AudioWorkletProcessor` envuelve el motor. Los parámetros viajan con `postMessage`;
  ninguno salta de golpe (suavizado de un polo) y hay fundidos de 8 s al empezar y al parar. Cadena master:
  ganancia → limitador → salida.
- **Seguridad:** el volumen general tiene un techo de 0,8 que el motor aplica por cualquier vía; hay un
  `tanh` final como red de seguridad y un limitador en la salida.
- **Exportación:** WAV PCM de 16 bits estéreo a 44,1 kHz, hasta 60 min, generado en un Web Worker. La opción
  «bucle de 5 min» ajusta las frecuencias para dar ciclos enteros y empalma el fondo con un fundido cruzado, así
  que el bucle no se nota. Con respiración guiada, la duración del bucle se ajusta a un número entero de ciclos
  respiratorios (puede ser unos segundos más o menos que 5 min) y la rampa de entrada no se incluye en el bucle.
- **Visualización (opcional):** dibuja el patrón del pulso **sin parpadeos** a propósito: un destello a 3–30 Hz
  puede desencadenar crisis en personas fotosensibles. Está desactivada por defecto y respeta
  `prefers-reduced-motion`.
- **Vista fractal:** un fBm con *domain warping* en un shader WebGL2. Cambia de forma muy lenta (sin destellos,
  oscilación ≤ 2 % entre fotogramas); con respiración, el brillo sube y baja un ±6 % a 0,1 Hz. Usa 2 o 3 octavas
  según el preset para que la dimensión fractal medida esté entre 1,25 y 1,55. Sin WebGL2 se muestra un color
  plano que cambia despacio.

Las decisiones de diseño y los desvíos respecto al plan están en [`DECISIONES.md`](DECISIONES.md).

## Despliegue

Es un sitio estático: sirve cualquier hosting. **Necesita HTTPS** (o `localhost`) para el AudioWorklet, el
service worker y la instalación.

La ruta base se controla con la variable de entorno `BASE_PATH`:

| Dónde se sirve | `BASE_PATH` |
|---|---|
| Raíz de un dominio (Netlify, Vercel, `usuario.github.io`) | *(vacía)* o `/` |
| Subcarpeta (GitHub Pages de un repositorio: `usuario.github.io/repo/`) | `/repo/` |

```bash
BASE_PATH=/repo/ npm run build
```

### GitHub Pages

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) ejecuta los tests, compila con
`BASE_PATH=/<nombre-del-repo>/` y publica `dist/`. En el repositorio: *Settings → Pages → Source: GitHub
Actions*. Si usas un dominio propio o un sitio `usuario.github.io`, quita la variable `BASE_PATH` del flujo.

### Netlify / Vercel

Detectan Vite solas. [`netlify.toml`](netlify.toml) y [`vercel.json`](vercel.json) solo fijan el directorio de
salida y evitan que se cachee el service worker. Variable `BASE_PATH`: no hace falta (raíz del dominio).

## Uso sin conexión y actualizaciones

El service worker precachea todo (incluido el worklet y el worker de exportación), así que tras la primera
visita funciona sin red. **Las actualizaciones se aplican al cerrar y volver a abrir la app**, nunca a mitad de
una sesión: un cambio de versión no corta el audio.

## Navegadores y límites conocidos

- **Verificado por el autor:** Chrome (escritorio): audio en tiempo real, exportación, bucle, modo en segundo
  plano, instalación y funcionamiento sin conexión.
- **No verificado:** Safari (macOS e iOS) y Firefox. Las APIs que se usan (AudioWorklet, módulos en Web Worker,
  Media Session) están disponibles en sus versiones actuales, pero hay que probarlas.
- **iPhone, pantalla bloqueada:** el Web Audio se detiene al bloquear la pantalla. Usa «Reproducir en segundo
  plano», que genera un WAV de unos 5 min y lo reproduce en bucle con un elemento `<audio>`. En ese modo **no se
  aplica el temporizador** (usa el del móvil), no hay fundido de entrada, un programa no puede repetirse en bucle
  y el fin automático de la respiración (Pre-sueño, a los 10 min) tampoco se aplica.
- **Limitaciones de seguridad de la respiración:** por defecto el ciclo mínimo es de 5 s y las retenciones de hasta
  10 s. Quitarlas es una decisión consciente, con un aviso, y solo está en el editor personalizado.
- **Pendiente de probar:** la vista fractal y la respiración en Safari (iOS) y Firefox, y la vibración de la
  respiración (solo en Android).
- **Exportar 60 min** pesa ~635 MB y puede fallar por memoria en móviles.
- **El pulso binaural se debilita** con portadoras altas (por encima de ~500 Hz) y a más de ~30 Hz suele
  percibirse como dos tonos; la aplicación avisa de ambas cosas.
- Los sonidos de la naturaleza se **sintetizan**, no son grabaciones: suenan artificiales.

## Iconos

Los iconos se dibujan por código con el estilo lineal de la marca (verde bosque y oro sobre crema, sin neón ni
degradados). El script genera de una vez las variantes: esquinas transparentes, maskable de Android al 80 %, iPhone
a sangre y 192/512:

```bash
python3 scripts/make-icons.py auriculares   # (por defecto) auriculares con una onda de batido
python3 scripts/make-icons.py corazon       # alternativa: corazón con una onda
```

Requiere Pillow. El icono de la pestaña (`public/favicon.svg`) es un SVG aparte.
