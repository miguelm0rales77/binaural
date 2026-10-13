# Binaural

Aplicación web instalable (PWA) que genera en tu dispositivo, en tiempo real, tonos con un pulso regular:
**binaurales**, **monaurales** e **isocrónicos**, con ruido de fondo (blanco, rosa, marrón) o sonidos de la
naturaleza (lluvia, viento, tormenta, río, bosque) o de meditación (cuencos tibetanos y gong), todos sintetizados. Incluye presets, un programa que cambia de
frecuencia con el tiempo («Pre-sueño»), temporizador, exportación a WAV y un modo de reproducción en
segundo plano para iPhone.

> **Uso personal o de bienestar. No es un producto sanitario ni hace ninguna afirmación terapéutica.**
> No la uses si tienes epilepsia o crisis desencadenadas por sonidos sin consultarlo con tu médico, ni
> conduciendo o manejando maquinaria. Mantén el volumen bajo. Los textos de la aplicación (en español) están en
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
  presets.ts, bands.ts, warnings.ts, storage.ts, texts.ts, viz.ts
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
  que el bucle no se nota.
- **Visualización (opcional):** dibuja el patrón del pulso **sin parpadeos** a propósito: un destello a 3–30 Hz
  puede desencadenar crisis en personas fotosensibles. Está desactivada por defecto y respeta
  `prefers-reduced-motion`.

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
  plano», que genera un WAV de 5 min y lo reproduce en bucle con un elemento `<audio>`. En ese modo **no se
  aplica el temporizador** (usa el del móvil), no hay fundido de entrada y un programa no puede repetirse en
  bucle.
- **Exportar 60 min** pesa ~635 MB y puede fallar por memoria en móviles.
- **El pulso binaural se debilita** con portadoras altas (por encima de ~500 Hz) y a más de ~30 Hz suele
  percibirse como dos tonos; la aplicación avisa de ambas cosas.
- Los sonidos de la naturaleza se **sintetizan**, no son grabaciones: suenan artificiales.

## Iconos

El dibujo original está en [`assets/icon-source.png`](assets/icon-source.png). El script genera de él las cuatro
variantes (esquinas transparentes, maskable de Android al 80 %, iPhone a sangre y 192/512):

```bash
python3 scripts/make-icons.py   # regenera public/icon-*.png y apple-touch-icon.png (requiere Pillow)
```
