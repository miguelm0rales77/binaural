# Plan de implementación — App web de audio binaural, respiración y fractales

> **Estructura en bloques** (ejecútalos en este orden; cada uno es una entrega usable por sí misma):
> - **Bloque A — Audio binaural** (Fases 0–7)
> - **Bloque B — Metrónomo de respiración de resonancia** (Fases 8–10)
> - **Bloque C — Visualización fractal** (Fases 11–14)
> - **Bloque D — Biofeedback con sensor de pulso** (Fases 15–17, opcional; antes hay que tomar una decisión sobre la plataforma)

> Documento autocontenido para ejecutar en una sesión nueva. Léelo entero antes de empezar.
> Ejecuta las fases **en orden**, y no pases a la siguiente sin cumplir los criterios de aceptación de la actual.
> Todas las fórmulas que necesitas están aquí; no hace falta consultar otro documento.

---

## 0. Contexto y decisiones ya tomadas

**Objetivo:** aplicación web instalable (PWA) que genera en tiempo real ritmos binaurales, monaurales e isocrónicos, con ruido de fondo (blanco, rosa, marrón), programas que van cambiando de frecuencia con el tiempo, y exportación a WAV. Uso personal o de bienestar, **sin afirmaciones terapéuticas**.

**Stack (cerrado, no lo cambies):**
- Vite + TypeScript (modo `strict`) + React 18.
- Web Audio API con **un único `AudioWorkletProcessor` escrito en TypeScript**.
- Vitest para los tests.
- `vite-plugin-pwa` para el manifest y el service worker.
- Sin backend. Las preferencias se guardan en `localStorage`.

**Fuera del alcance (NO implementar, aunque aparezca en la documentación original):**
- C++, Rust, WebAssembly, Emscripten, `SharedArrayBuffer` o atomics. JavaScript en un AudioWorklet mueve sin esfuerzo unos pocos osciladores; `SharedArrayBuffer` además obliga a configurar cabeceras COOP/COEP en el hosting. Los parámetros se envían con `port.postMessage`.
- Mensajes subliminales o afirmaciones ocultas bajo ruido.
- Afirmaciones sobre 432 Hz, la "resonancia Schumann", Alzheimer/GENUS, TDAH o cualquier tratamiento. 432 Hz puede aparecer como una portadora más entre las opciones, sin texto que prometa nada.
- Cuentas de usuario, analítica, sincronización en la nube.
- Pistas de audio pregrabadas o sonidos de naturaleza grabados.

---

## 1. Arquitectura

```
src/
  dsp/                 ← TypeScript puro, SIN APIs del navegador (testeable en Node)
    oscillator.ts      acumulador de fase
    noise.ts           blanco, rosa (Kellet), marrón (integrador con pérdida)
    envelope.ts        envolvente isocrónica (coseno alzado)
    smoothing.ts       suavizado de parámetros (one-pole) y fundidos
    loudness.ts        compensación ISO 226:2003
    engine.ts          clase DspEngine: renderBlock(outL, outR, n)  ← núcleo único
    program.ts         interpolación de programas (frecuencias que cambian con el tiempo)
    types.ts           EngineParams, Program, Preset…
  audio/
    engine.worklet.ts  AudioWorkletProcessor que envuelve DspEngine
    AudioController.ts contexto, addModule, cadena master (gain → limitador → destino)
    wavExport.ts       renderiza con DspEngine offline → Blob WAV de 16 bits estéreo
  ui/                  componentes React
  presets.ts
  main.tsx
tests/                 Vitest, solo sobre src/dsp
```

**Principio clave:** el **mismo** `DspEngine` lo usan el worklet (tiempo real), `wavExport` (offline) y los tests. Así, lo que pasa los tests es exactamente lo que suena.

### Tipos principales (`dsp/types.ts`)

```ts
export type BeatMode = 'binaural' | 'monaural' | 'isochronic';
export type NoiseType = 'none' | 'white' | 'pink' | 'brown';

export interface EngineParams {
  mode: BeatMode;
  carrierHz: number;      // 100–1000 (para binaural, advertir por encima de 500)
  beatHz: number;         // 0.5–40
  isoDepth: number;       // 0.5–0.98 (solo isocrónico)
  toneGain: number;       // 0–1 (lineal)
  noiseType: NoiseType;
  noiseGain: number;      // 0–1
  loudnessComp: boolean;  // compensación ISO 226 activada/desactivada
  masterGain: number;     // 0–1, con techo duro (ver §5)
}

export interface ProgramStep { atSec: number; beatHz: number; carrierHz?: number; }
export interface Program { name: string; durationSec: number; steps: ProgramStep[]; } // interpolación lineal entre pasos
```

---

## 2. Especificación DSP (implementar exactamente así)

`fs` = frecuencia de muestreo (la de `sampleRate` en el worklet; 48000 en los tests). Trabaja siempre en `Float32Array`.

### 2.1 Oscilador con acumulador de fase (obligatorio)
Nunca calcules `sin(2π f t)` con el tiempo absoluto: al cambiar `f` la onda pega un salto audible (un "clic").
```
phase += 2π · f[n] / fs
if (phase >= 2π) phase -= 2π
y[n] = sin(phase)
```
Cada oscilador guarda su propia `phase` entre bloques.

### 2.2 Modos
Sea `fc` la portadora y `Δf` el pulso (beat).
- **Binaural:** oscilador izquierdo a `fc − Δf/2` y derecho a `fc + Δf/2`. `L = sinL`, `R = sinR`. Requiere auriculares.
- **Monaural:** los mismos dos osciladores, pero mezclados: `L = R = 0.5·(sinA + sinB)`.
- **Isocrónico:** un solo oscilador a `fc` multiplicado por una envolvente. La envolvente tiene su propio acumulador de fase `φp` en [0,1), que avanza `Δf/fs` por muestra:
  ```
  env = 1 − D · 0.5 · (1 + cos(2π·φp))     // D = isoDepth ∈ [0.5, 0.98]
  L = R = sin(phaseCarrier) · env
  ```
  (`env` vale `1−D` cuando φp=0 y vale 1 cuando φp=0.5.)

### 2.3 Ruido
`white = Math.random()*2 − 1`. Usa un PRNG con semilla (p. ej. mulberry32) inyectable, para que los tests sean deterministas.

**Rosa (filtro de Paul Kellet, versión completa):**
```
b0 = 0.99886*b0 + white*0.0555179
b1 = 0.99332*b1 + white*0.0750759
b2 = 0.96900*b2 + white*0.1538520
b3 = 0.86650*b3 + white*0.3104856
b4 = 0.55000*b4 + white*0.5329522
b5 = -0.7616*b5 - white*0.0168980
pink = (b0+b1+b2+b3+b4+b5+b6 + white*0.5362) * 0.11
b6 = white*0.115926
```

**Marrón (integrador con pérdida):**
```
last = (last + 0.02*white) / 1.02
brown = last * 3.5
```
Por último, aplica `Math.max(-1, Math.min(1, x))` a cada ruido por seguridad.

### 2.4 Suavizado y fundidos
- Ningún parámetro salta de golpe. Para frecuencias y ganancias usa un suavizado one-pole por muestra con una constante de tiempo de unos 50 ms para las ganancias y de unos 2 s para `beatHz`/`carrierHz` cuando los cambia el usuario:
  `a = exp(−1/(τ·fs)); cur = target + a·(cur − target)`.
- **Fundido de entrada** de 8 s al empezar y **fundido de salida** de 8 s al parar o cuando acaba el temporizador (rampa de ganancia de 0→1 y de 1→0). El motor solo informa de `stopped` cuando termina el fundido de salida.

### 2.5 Compensación de sonoridad (ISO 226:2003)
Sirve para que, al cambiar la portadora, el volumen **percibido** no cambie.
Calcula el SPL necesario `Lp(f)` para un nivel de sonoridad `Ln = 40` fon:
```
Af = 4.47e-3 · (10^(0.025·Ln) − 1.15) + (0.4 · 10^((Tf + Lu)/10 − 9))^αf
Lp = (10/αf) · log10(Af) − Lu + 94
```
Tabla (interpola linealmente en log(f) entre filas; limita f a [20, 1000]):

| f (Hz) | 20 | 25 | 31.5 | 40 | 50 | 63 | 80 | 100 | 125 | 160 | 200 | 250 | 315 | 400 | 500 | 630 | 800 | 1000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| αf | .532 | .506 | .480 | .455 | .432 | .409 | .387 | .367 | .349 | .330 | .315 | .301 | .288 | .276 | .267 | .259 | .253 | .250 |
| Lu | −31.6 | −27.2 | −23.0 | −19.1 | −15.9 | −13.0 | −10.3 | −8.1 | −6.2 | −4.5 | −3.1 | −2.0 | −1.1 | −0.4 | 0.0 | 0.3 | 0.5 | 0.0 |
| Tf | 78.5 | 68.7 | 59.5 | 51.1 | 44.0 | 37.5 | 31.5 | 26.5 | 22.1 | 17.9 | 14.4 | 11.4 | 8.6 | 6.2 | 4.4 | 3.0 | 2.2 | 2.4 |

Ganancia de compensación del tono, con 400 Hz como referencia:
```
compDb = clamp(Lp(fc) − Lp(400), −6, +12)
compGain = 10^(compDb/20)
```
Calcúlala solo cuando cambie `fc` (no en cada muestra) y pásala por el suavizado.
**Comprobación obligatoria en los tests:** `Lp(1000)` a 40 fon debe dar 40.0 ± 0.2 dB, y `Lp(100) > Lp(400) + 10`.

### 2.6 Mezcla y protección
```
tone  = (salida del modo) · toneGain · compGain
noise = ruido · noiseGain            (el mismo valor en L y R; ruido mono)
mix   = (tone + noise) · 0.5 · fade · masterGain
```
Después, en `renderBlock`, aplica un **soft clip** `x → tanh(x)` como última red de seguridad. Además, en `AudioController`, coloca un `DynamicsCompressorNode` que haga de limitador (threshold −6 dB, knee 0, ratio 20, attack 0.003, release 0.25) antes de `destination`.

---

## 3. Worklet y controlador

- `engine.worklet.ts`: `class BinauralProcessor extends AudioWorkletProcessor` con una instancia de `DspEngine`. En `process()` llama a `engine.renderBlock(outputs[0][0], outputs[0][1], 128)` y devuelve `true`. Mensajes que recibe por `port.onmessage`: `{type:'params', params: Partial<EngineParams>}`, `{type:'start'}`, `{type:'stop'}`, `{type:'program', program, startAtSec}`. Mensajes que envía: `{type:'state', playing, elapsedSec, beatHz, carrierHz}` como mucho 4 veces por segundo, y `{type:'stopped'}`.
- **Cargar el worklet con Vite:** `import workletUrl from './engine.worklet.ts?worker&url'` y después `await ctx.audioWorklet.addModule(workletUrl)`. Si da problemas en el build, la alternativa es una entrada de build separada (`build.rollupOptions.input`) que genere `engine.worklet.js` y cargarlo con `new URL(..., import.meta.url)`. Comprueba que funciona **tanto en `npm run dev` como en `npm run build && npm run preview`**.
- El nodo se crea con `outputChannelCount: [2]`.
- El `AudioContext` se crea o se reanuda **solo tras un gesto del usuario** (el botón Play), por la política de autoplay.
- Nada de reservar memoria (`new`, arrays) dentro de `process()`.

---

## 4. Fases de trabajo

### Fase 0 — Andamiaje
- `npm create vite@latest` (plantilla react-ts), Vitest, ESLint, `tsconfig` estricto, crear la estructura de carpetas de §1.
- ✅ Aceptación: `npm run dev`, `npm test` y `npm run build` funcionan sin errores.

### Fase 1 — Núcleo DSP con tests (sin interfaz)
Implementa `src/dsp/*` según §2. Tests obligatorios (en `tests/`):
1. **Continuidad de fase:** renderiza 1 s a 200 Hz, cambia a 210 Hz y renderiza otro segundo; la mayor diferencia entre muestras consecutivas no puede superar `2π·210/fs·1.01`.
2. **Binaural:** con fc=400 y Δf=10, una FFT de 1 s del canal L tiene su pico en 395 Hz ±1 y la del canal R en 405 Hz ±1.
3. **Isocrónico:** con D=0.9, el mínimo de la envolvente es 0.1 ±0.01 y el máximo 1.0 ±0.01; el periodo es igual a 1/Δf.
4. **Pendientes del ruido** (promedia la FFT de unos 10 s con semilla fija; ajusta una recta en dB frente a log2(f) entre 100 Hz y 8 kHz): rosa −3 ±1 dB/octava; marrón −6 ±1.5 dB/octava; blanco 0 ±1.
5. **ISO 226:** las comprobaciones de §2.5.
6. **Seguridad:** con todas las ganancias a 1 y ruido marrón, ninguna muestra de salida supera |1.0|.
7. **Fundidos:** las primeras muestras tras `start` son ≈0; tras `stop` + 8 s la salida es 0 y se emite `stopped`.
8. **Programas:** `program.ts` interpola correctamente entre pasos (casos en un extremo, entre dos pasos y pasado el final).
- ✅ Aceptación: todos los tests en verde. Escribe una FFT sencilla en `tests/fft.ts` (radix-2) en lugar de añadir dependencias.

### Fase 2 — Motor de audio y una interfaz mínima
- `AudioController` + worklet según §3. Interfaz: Play/Stop y dos sliders (portadora y pulso).
- ✅ Aceptación (manual, con auriculares): suena sin clics; mover los sliders no produce chasquidos; Stop hace el fundido de salida. No hay errores en la consola. Funciona en el build de producción.

### Fase 3 — Controles completos
- Selector de modo (binaural/monaural/isocrónico) con una explicación breve de cada uno; los modos monaural e isocrónico muestran "funciona también con altavoces".
- Sliders: portadora (100–1000 Hz, escala logarítmica), pulso (0.5–40 Hz, logarítmica), profundidad isocrónica, volumen del tono, tipo y volumen del ruido, volumen general.
- Indicador de la banda actual según el pulso: Delta 0.5–4, Theta 4–8, Alfa 8–13, Beta 13–30, Gamma 30–40.
- Temporizador de sesión (15/30/45/60/90 min o sin límite), que termina con fundido de salida.
- Avisos en línea: en modo binaural, si la portadora pasa de 500 Hz ("el efecto binaural se debilita por encima de unos 500–1000 Hz") o el pulso de 30 Hz ("por encima de unos 30 Hz suele percibirse como dos tonos; considera el modo isocrónico").
- Guarda el último estado en `localStorage` (envuelto en try/catch).
- ✅ Aceptación: todos los controles responden en menos de 100 ms y de forma suave; al recargar la página se recupera el último estado.

### Fase 4 — Presets y programas
`presets.ts`, con valores por defecto razonables (el usuario puede tocarlos después):

| Preset | Modo | Portadora | Pulso | Ruido | Duración sugerida |
|---|---|---|---|---|---|
| Relajación (alfa) | binaural | 250 Hz | 10 Hz | rosa bajo | 20 min |
| Concentración (beta) | binaural | 400 Hz | 16 Hz | rosa bajo | 30–45 min |
| Meditación (theta) | binaural | 200 Hz | 6 Hz | ninguno | 20 min |
| Pre-sueño (programa) | binaural | 200 Hz | 10→6→3 Hz | marrón | 30 min |
| Gamma 40 Hz | isocrónico (D=0.8) | 400 Hz | 40 Hz | ninguno | 15 min |

- "Pre-sueño" es un `Program`: 0–5 min a 10 Hz, rampa hasta 6 Hz en el minuto 15, rampa hasta 3 Hz en el minuto 25, y se mantiene hasta el final.
- El usuario puede guardar sus propios presets (en `localStorage`).
- Los nombres son descriptivos y **no prometen efectos** (nada de "cura la ansiedad").
- ✅ Aceptación: al cargar un preset todo cambia con suavidad; el programa avanza solo y la interfaz muestra el pulso actual y el tiempo restante.

### Fase 5 — Seguridad y textos legales
- **Pantalla de primer uso** (solo una vez, se guarda la aceptación): no usar con epilepsia ni con antecedentes de crisis desencadenadas por sonido sin consultar al médico; no usar conduciendo ni manejando maquinaria; volumen bajo; no es un producto sanitario ni sustituye a un tratamiento. Botón "Entendido".
- **Techo de volumen:** `masterGain` no puede superar 0.8 por defecto. El modo isocrónico entre 13 y 40 Hz muestra un aviso adicional la primera vez.
- Opción "Compensación de sonoridad" activada por defecto (§2.5).
- Página "Acerca de / Ciencia" con un texto **prudente**: hay un metaanálisis (Garcia-Argibay et al., 2019) con efectos moderados sobre ansiedad, memoria y dolor, pero la evidencia es heterogénea y la de "arrastre" medida con EEG no es concluyente. Sin más afirmaciones.
- ✅ Aceptación: la pantalla aparece solo la primera vez; el volumen no puede pasar del techo; el texto no contiene promesas terapéuticas.

### Fase 6 — Exportación WAV y PWA
- `wavExport.ts`: renderiza N minutos (máximo 60) con `DspEngine` en trozos dentro de un Web Worker (para no bloquear la interfaz), WAV PCM de 16 bits estéreo a 44100 Hz, y descarga con `URL.createObjectURL`. Muestra una barra de progreso. Opción "bucle de 5 min" para tamaños pequeños (si se exporta en bucle, que el pulso dure un número entero de ciclos para que el empalme no se note).
- **Reproducción en segundo plano (iOS):** el Web Audio se detiene al bloquear la pantalla en iPhone. Añade un modo "Reproducir en segundo plano" que genera un WAV de 5 min en bucle y lo reproduce con un elemento `<audio loop>`, más `navigator.mediaSession` (título y botones de play/pausa). Esto tampoco depende del interruptor de silencio del iPhone.
- `vite-plugin-pwa`: manifest (nombre, icono, `display: standalone`, colores) y funcionamiento offline completo.
- ✅ Aceptación: el WAV exportado se abre en un reproductor y suena igual que en la app; la app se instala y funciona sin conexión; en un iPhone el modo segundo plano sigue sonando con la pantalla bloqueada.

### Fase 7 — Pulido y despliegue
- Diseño limpio y oscuro, apto para móvil (columna única con márgenes laterales de 16 px y sin scroll horizontal), botones grandes y accesibles (etiquetas ARIA en los sliders).
- Visualización opcional y ligera: una onda o un punto que pulse a la frecuencia del pulso (con `requestAnimationFrame`, sin afectar al audio).
- Despliegue estático (GitHub Pages, Netlify o Vercel). README con instrucciones.
- ✅ Aceptación: Lighthouse PWA/Accesibilidad ≥ 90; funciona en Chrome, Safari (macOS e iOS) y Firefox.

---

## 5. Reglas para el ejecutor

1. Al final de cada fase: ejecuta `npm test` y `npm run build` y haz commit con el mensaje `fase N: …`.
2. No añadas dependencias aparte de las del §0 sin justificarlo.
3. Si un test de pendiente espectral falla por poco, revisa primero el método de medida (ventana de Hann, promediado, rango de frecuencias) antes de tocar los coeficientes de §2.3, que son correctos.
4. No reserves memoria en el hilo de audio; precalcula todo lo posible.
5. Si algo de este plan es ambiguo, elige la opción más simple y apúntala en `DECISIONES.md`.
6. Los textos de la interfaz, en español.


---
---

# BLOQUE B — Metrónomo de respiración de resonancia (Fases 8–10)

> Empieza solo con el Bloque A terminado y en verde.
> **Objetivo:** guiar la respiración lenta (por defecto 6 respiraciones por minuto, con espiración más larga que la inspiración) con señales **sonoras**, visuales y, si el dispositivo lo permite, hápticas. Debe funcionar con los ojos cerrados y combinarse con cualquier preset de audio.

## B1. Fundamento (para los textos de la app; no exagerar)
- Respirar a unas 6 rpm (0,1 Hz) hace coincidir la arritmia sinusal respiratoria con el barorreflejo, cuyo retraso es de unos 5 s, y eso amplía mucho las oscilaciones de la frecuencia cardíaca (modelo de Vaschillo y Lehrer). La frecuencia de resonancia individual suele estar entre 4,5 y 6,5 rpm.
- El protocolo clásico (Lehrer y Vaschillo) consiste en 20 min dos veces al día durante 8–10 semanas, y después mantenimiento con 10–15 min diarios. Sirven también "microdosis" de 1–3 min ante un estrés puntual.
- Hay metaanálisis de biofeedback de variabilidad cardíaca con efectos sobre estrés, ansiedad y síntomas depresivos (p. ej., Goessl et al., 2017; Pizzoli et al., 2021). La app **no** es biofeedback mientras no use un sensor (Bloque D): es un marcapasos respiratorio.
- **Errores del documento original que no hay que copiar:** atribuye a este campo la g = 0,45 del metaanálisis de binaurales (es otro estudio); y las afirmaciones sobre serotonina, ATP, flujo sanguíneo cerebral, 40 Hz y Alzheimer no se incluyen.

## B2. Decisiones cerradas
- **Reloj común:** toda la temporización sale de una función pura `breathState(tSec, pattern) → { phase: 'in'|'holdIn'|'out'|'holdOut', phaseProgress: 0–1, lung: 0–1, cycleIndex }`, en `src/dsp/breath.ts`. La usan el `DspEngine` (que la evalúa con el tiempo del `AudioContext`, `currentTime` dentro del worklet) y la interfaz (que la evalúa con `ctx.currentTime` en cada `requestAnimationFrame`). Nunca se usan `setInterval` ni `Date.now()` para el ritmo.
- `lung` es la curva de "llenado" de los pulmones: durante la inspiración `lung = 0.5 − 0.5·cos(π·p)`, durante la espiración `lung = 0.5 + 0.5·cos(π·p)` y en las retenciones se mantiene constante. Así la curva es suave (tipo seno) y no lineal.
- **Patrón por defecto:** 6 rpm, inspiración 4 s y espiración 6 s (40/60), sin retenciones. La retención solo existe en patrones personalizados.
- **Rampa de entrada:** opcional y activada por defecto. Empieza a 8 rpm y baja linealmente hasta la frecuencia objetivo en 2 min, para no forzar el cambio.

```ts
export interface BreathPattern {
  rpm: number;            // 4.0–7.0 en modo resonancia (paso 0.5); 3–12 en modo personalizado
  inhaleRatio: number;    // fracción del ciclo (sin retenciones) para inspirar: 0.3–0.5, por defecto 0.4
  holdInSec: number;      // 0 por defecto
  holdOutSec: number;     // 0 por defecto
  rampFromRpm?: number;   // 8 por defecto
  rampSec?: number;       // 120 por defecto
}
```
Con rampa, la duración de cada ciclo cambia con el tiempo. Para que no haya saltos, `breathState` integra la frecuencia instantánea (igual que el acumulador de fase de §2.1), **no** calcula `t mod período`.

## B3. Señales de guía (cada una se activa y desactiva por separado)
1. **Oleaje (por defecto):** el ruido de fondo del Bloque A "respira": su ganancia sube de ×0.6 a ×1.0 con `lung`, y si es ruido rosa o marrón se le aplica además un filtro paso bajo de un polo cuya frecuencia de corte va de 400 Hz (pulmones vacíos) a 2500 Hz (llenos). Si el ruido está en `none`, se usa ruido rosa a volumen bajo solo para el oleaje.
2. **Tono guía:** un seno suave cuya frecuencia sube de 220 a 330 Hz al inspirar y baja al espirar, a −18 dB respecto al tono binaural. Desactivado por defecto.
3. **Campanilla:** al empezar cada fase, una nota breve generada por síntesis (seno a 660 Hz al inspirar y 440 Hz al espirar, con caída exponencial de 1,2 s y algo de segundo armónico). Sin archivos de audio.
4. **Visual:** un círculo que crece y decrece con `lung`, el texto "Inspira · Espira · Mantén" y un contador de segundos de la fase actual. Sin destellos (las mismas reglas que en §C2).
5. **Háptica:** `navigator.vibrate(30)` al empezar cada fase, solo donde exista (Android). En iOS no hay vibración desde la web; no lo intentes.

Todas las señales sonoras se generan dentro del `DspEngine`, **en el hilo de audio**, con precisión de muestra. Así entran también en la exportación WAV y en el modo de segundo plano de iOS (Fase 6): el bucle exportado debe durar un número entero de ciclos respiratorios **y** de ciclos del pulso. Usa 5 min (300 s) a 6 rpm; si la rpm no divide 300 s exactamente, ajusta la duración al múltiplo más cercano.

## B4. Seguridad y textos
- Pantalla breve la primera vez:
  - Respira de forma suave y natural por la nariz, con el abdomen; **no hagas respiraciones profundas forzadas**.
  - Si notas mareo, hormigueo o palpitaciones (por exceso de ventilación), vuelve a respirar de forma normal.
  - Si tienes una enfermedad cardíaca o respiratoria importante, consulta antes.
  - En algunas personas con trastorno de pánico, centrarse en la respiración puede aumentar la ansiedad al principio; si es tu caso, empieza con sesiones cortas.
- Opción "labios fruncidos al espirar" como simple recordatorio de texto durante la espiración.

## B5. Fases

### Fase 8 — Reloj respiratorio y señales sonoras
- `src/dsp/breath.ts` (con `BreathPattern`, `breathState` e integración de la rampa) y las señales 1–3 de §B3 dentro del `DspEngine`, con parámetros nuevos en `EngineParams`: `breath: { enabled, pattern, cues: { swell, guideTone, chime } , startAtCtxTime }`.
- Tests:
  1. Con 6 rpm y ratio 0.4, la inspiración dura 4.0 s ±1 ms y la espiración 6.0 s ±1 ms.
  2. `lung` es continua: con muestreo a 48 kHz, ningún salto entre muestras supera 1e-3.
  3. Con rampa de 8 a 6 rpm en 120 s, la duración de los ciclos decrece monótonamente, el primer ciclo dura unos 7,5 s y a partir de los 120 s todos duran 10 s.
  4. Las campanillas suenan dentro de ±1 muestra del cambio de fase.
  5. Con el oleaje activado, la envolvente RMS del ruido (ventana de 250 ms) se correlaciona con `lung` con r > 0,9.
  6. Las retenciones mantienen `lung` constante.
- ✅ Aceptación: tests en verde; con los ojos cerrados se puede seguir el ritmo solo con el oleaje.

### Fase 9 — Interfaz de respiración, presets y sesiones
- Pantalla "Respirar" con el círculo de §B3.4 y controles: rpm (4.0–7.0 en pasos de 0.5), proporción inspiración/espiración, señales activables, duración (1, 3, 5, 10, 15 o 20 min) y rampa de entrada.
- Presets de respiración:
  - **Resonancia 6** (por defecto).
  - **Microdosis 3 min** (6 rpm, sin rampa).
  - **Pre-sueño** (5,5 rpm, ratio 0.35, oleaje con ruido marrón).
  - **Personalizado**: editor con inspiración, retención, espiración y retención, en segundos. Aquí puede montarse, por ejemplo, la respiración cuadrada 4-4-4-4, pero no se presenta como preset recomendado.
- Integración con el Bloque A:
  - Cada preset de audio puede llevar asociado un patrón respiratorio. Relajación (alfa) y Pre-sueño lo llevan activado por defecto; el resto no.
  - En el programa Pre-sueño, la respiración dura los primeros 10 min y después se desactiva con un fundido de 30 s, dejando solo el audio.
- La sesión termina con fundido de salida y una pantalla de resumen (duración y rpm).
- ✅ Aceptación: se puede hacer una sesión de 20 min sin cortes en el ordenador y en el iPhone (en el iPhone, con la pantalla bloqueada, usando el modo de segundo plano de la Fase 6 con las señales sonoras incluidas).

### Fase 10 — Registro de práctica y "mi frecuencia"
- **Registro local** (en `localStorage` o IndexedDB, envuelto en try/catch): fecha, duración, rpm y preset. Vista semanal con minutos por día y racha, y el objetivo configurable (por defecto 2 × 20 min al día, según el protocolo clásico). Sin notificaciones push en esta fase.
- **"Mi frecuencia" (sin sensor):** asistente de prueba escalonada a 6.5, 6.0, 5.5, 5.0 y 4.5 rpm, con 2 min por escalón y 1 min de respiración libre entre medias. Tras cada escalón, el usuario puntúa la comodidad del 1 al 5 y si ha notado falta de aire. La app propone la frecuencia más cómoda y la guarda como predeterminada. Texto honesto: "sin sensor de pulso esto es una aproximación por comodidad; la determinación precisa requiere medir la frecuencia cardíaca".
- Exportar el registro a CSV.
- ✅ Aceptación: el registro sobrevive a una recarga; la prueba escalonada completa dura unos 14 min, guarda la frecuencia elegida y los presets de respiración la usan.

---

# BLOQUE C — Visualización fractal (Fases 11–14)

> Empieza con el Bloque B terminado.
> **Objetivo:** modo a pantalla completa con un fractal estadístico (fBm con *domain warping*) generado en tiempo real. Se mueve muy despacio, está ligado al preset activo y **respira con el reloj del Bloque B** cuando la respiración está activa.

## C1. Decisiones cerradas
- **WebGL2** (`#version 300 es`) con un único *fragment shader* a pantalla completa (un triángulo que cubre el viewport). **Sin Three.js ni otras librerías.**
- Fractales **estadísticos** (ruido fBm), nunca fractales exactos tipo Koch o Sierpinski como fondo.
- Parámetro central: **exponente de Hurst H**. Con lacunaridad 2, `gain = 2^(−H)`. Para el contorno de un campo fBm, `D ≈ 2 − H`. Objetivo D = 1.3–1.5, es decir, **H entre 0.5 y 0.7** (por defecto 0.65, gain ≈ 0.637).
- **Fuera del alcance:**
  - Parpadeo o estroboscopio a la frecuencia del pulso (lo que los documentos llaman "AVE").
  - Parpadeo visual a 40 Hz.
  - Afirmaciones sobre serotonina, endorfinas, Alzheimer, TDAH o "frecuencias curativas".
  - La cifra de "recuperación un 60 % más rápida".

## C2. Reglas de seguridad visual (obligatorias)
1. **Nada de destellos.** La luminancia media no puede oscilar más de un 8 % por encima de 0.3 Hz, ni puede haber más de 3 cambios bruscos de luminancia por segundo (WCAG 2.3.1). La imagen **nunca** pulsa al ritmo del pulso del audio; solo puede seguir la respiración (≤ 0.2 Hz).
2. **Movimiento lento:** deriva máxima de 0.03 unidades de coordenada por segundo; sin zooms rápidos ni rotaciones continuas.
3. Con `prefers-reduced-motion: reduce`, el fractal se queda casi estático (velocidad × 0.1) y la respiración se muestra solo con el círculo o una barra.
4. **Modo noche** (Pre-sueño y programas de sueño): paleta cálida (ámbar o rojizo, sin azules saturados) y brillo máximo del 35 %. La luz azul por la noche retrasa la melatonina; los documentos originales sugieren lo contrario, no les hagas caso.
5. Aviso de fotosensibilidad la primera vez que se activa el modo visual.
6. Salida siempre accesible (Esc o un toque), con los controles de audio y de respiración superpuestos.

## C3. Especificación del shader

**Hash entero** (idéntico en GPU y CPU; no uses `fract(sin(...))`):
```glsl
uint hash(uvec2 v){ v = v*1664525u + 1013904223u; v.x += v.y*1664525u; v.y += v.x*1664525u;
  v ^= v>>16u; v.x += v.y*1664525u; v.y += v.x*1664525u; v ^= v>>16u; return v.x ^ v.y; }
```
En TypeScript, el mismo cálculo con `Math.imul` y `>>> 0`.

**Ruido de gradiente 2D:** un gradiente por esquina elegido con `hash(celda + seed) & 7` entre 8 direcciones; interpolación quíntica `t*t*t*(t*(t*6.-15.)+10.)`.

**fBm:**
```glsl
float fbm(vec2 p){
  float a = 1.0, s = 0.0, n = 0.0;
  for (int i = 0; i < OCTAVES; i++) { s += a*noise(p); n += a; p = rot * p * 2.0; a *= u_gain; }
  return s / n;          // rot = rotación fija de ~37°
}
```
`OCTAVES` = 6 en escritorio y 5 en móvil.

**Domain warping:**
```glsl
vec2 q = vec2(fbm(p + u_t*0.010), fbm(p + vec2(5.2, 1.3) - u_t*0.008));
vec2 r = vec2(fbm(p + u_warp*q + vec2(1.7, 9.2)), fbm(p + u_warp*q + vec2(8.3, 2.8)));
float v = fbm(p + u_warp*r);
```
`u_warp` va de 0 a 4 (por defecto 2.5).

**Color:** paleta coseno `col = a + b*cos(6.28318*(c*v + d))`, mezclada con `length(q)` y `r.x`; multiplica por `u_brightness`.

**Respiración:** `u_lung` (0–1, de `breathState`) modula **solo** el warp (±10 %) y una escala muy leve del campo (±3 %), con un efecto de "expansión". El brillo se modula como mucho un 6 %. Si la respiración está desactivada, `u_lung = 0.5` fijo.

**Uniforms:** `u_t, u_res, u_gain, u_warp, u_brightness, u_lung, u_palette (4×vec3), u_seed`.

**Rendimiento:** resolución interna de `min(devicePixelRatio, 1.5) × 0.6`; si la media de los últimos 2 s baja de 50 fps, escala 0.45 y una octava menos. Pausa cuando `document.hidden`. Si no hay WebGL2, un degradado CSS lento.

## C4. Presets visuales

| Preset | Paleta | H | Warp | Velocidad |
|---|---|---|---|---|
| Relajación (alfa) | verdes/azules suaves | 0.65 | 2.5 | 1.0 |
| Concentración (beta) | neutra, de bajo contraste | 0.7 | 1.5 | 0.6 |
| Meditación (theta) | azul profundo/violeta | 0.6 | 3.0 | 0.8 |
| Pre-sueño | ámbar oscuro (modo noche) | 0.7 | 2.0 | 0.4 |
| Gamma 40 Hz | neutra | 0.65 | 2.0 | 0.6 |
| Respiración (sin audio) | verde azulado suave | 0.65 | 2.5 | 0.7 |

## C5. Fases

### Fase 11 — Renderizador base
- `src/visual/FractalRenderer.ts`, `src/visual/shaders/fractal.frag.glsl` (con `?raw`) y `VisualMode.tsx`.
- ✅ Aceptación: 60 fps en el portátil y ≥ 50 fps en un iPhone reciente (anótalo en `DECISIONES.md`); pausa con la pestaña oculta; la alternativa CSS funciona.

### Fase 12 — Presets, paletas, controles y conexión con la respiración
- Tabla de §C4 y controles avanzados (H, warp, velocidad, brillo, paleta). Conectar `u_lung` con `breathState(ctx.currentTime, …)`. Al activar la vista fractal desde la pantalla "Respirar", el círculo pasa a ser un anillo discreto superpuesto.
- ✅ Aceptación: al cambiar de preset, los parámetros se interpolan durante unos 3 s; la "respiración" del fractal coincide con las campanillas con un desfase menor de 50 ms (compruébalo grabando la pantalla).

### Fase 13 — Seguridad visual
- Implementa §C2. **Test de destellos** con la versión CPU (`src/visual/cpuField.ts`, de la Fase 14; si hace falta, adelanta su creación): 64×64 píxeles, 30 fotogramas por segundo, 20 s, parámetros extremos, respiración a 7 rpm. Ningún par de fotogramas consecutivos difiere más de un 2 % en luminancia media y la oscilación total es ≤ 8 %.
- ✅ Aceptación: test en verde; el modo noche limita el brillo; `prefers-reduced-motion` funciona.

### Fase 14 — Validación de la dimensión fractal (box-counting)
- `src/visual/cpuField.ts`: copia exacta en TypeScript del shader (hash, ruido, fBm y warp).
- `tests/boxcount.test.ts`: campo de 1024×1024, umbral en la mediana, borde con vecindad 4, cajas de 2, 4, …, 256 píxeles y 4 desplazamientos de rejilla (recuento mínimo por tamaño). D es la pendiente de log N(ε) frente a log(1/ε).
- Comprobaciones: cada preset de §C4 da **1.25 ≤ D ≤ 1.55**, y D(H=0.4) > D(H=0.65) > D(H=0.9). Si falla, ajusta H y luego las octavas; no cambies el método.
- ✅ Aceptación: test en verde y valores de D apuntados en `DECISIONES.md`.

**Texto en "Acerca de / Ciencia":** hay estudios (Taylor, Hägerhäll y colaboradores) que observan preferencia estética y cambios de EEG compatibles con relajación al mirar fractales de complejidad media (D ≈ 1.3–1.5). Son estudios pequeños y la app no promete efectos terapéuticos.

---

# BLOQUE D — Biofeedback con sensor de pulso (Fases 15–17, opcional)

> **Antes de empezar: decisión de plataforma (pregúntasela al usuario).** Una PWA no puede leer sensores en todas partes:
> - **Banda de pecho Bluetooth** (p. ej., Polar H10) con Web Bluetooth: funciona en Chrome de escritorio y de Android, **no en Safari de iOS**.
> - **Cámara con flash (PPG):** el control del flash (`torch`) funciona en Chrome Android; en iOS Safari no está garantizado. Compruébalo al empezar.
> - Si el uso principal es el **iPhone**, este bloque requiere envolver la app con **Capacitor** (plugin de Bluetooth LE y/o cámara nativa) y distribuirla como app nativa. Eso es otro alcance: confírmalo antes de seguir.
>
> Si se decide seguir como PWA: implementa la banda de pecho (fiable) primero y la cámara después, marcada como **experimental**.

## D1. Fuentes de intervalos RR
- **Banda BLE:** servicio `heart_rate`, característica `heart_rate_measurement` (notificaciones). Byte 0 = flags: el bit 0 indica si la FC viene en uint8 (0) o uint16 (1), y el bit 4 si hay intervalos RR. Los RR vienen como uint16 little-endian en unidades de 1/1024 s y puede haber varios por notificación. Convierte a ms con `rr*1000/1024`.
- **Cámara PPG (experimental):** `getUserMedia({ video: { facingMode: 'environment', frameRate: { ideal: 60 } } })` y el flash con `applyConstraints({ advanced: [{ torch: true }] })` cuando esté disponible. Para cada fotograma, usa `requestVideoFrameCallback` para tener el `mediaTime` real y dibuja en un canvas de 32×32 píxeles para promediar el canal verde (y el rojo; quédate con el de mayor relación señal/ruido en los primeros 10 s). Después:
  1. Filtro paso banda de 0.5 a 4 Hz (Butterworth de 2.º orden en dos biquads, aplicado en ventanas de 8 s hacia delante y hacia atrás).
  2. Primera derivada.
  3. Detección de picos con una distancia mínima de 0.33 s.
  4. Interpolación parabólica del pico con los 3 puntos vecinos.

  Los intervalos entre picos son los RR. Muestra un indicador de calidad de señal y pide quitar el dedo o recolocarlo si la calidad es baja.
- **Limpieza de artefactos (común):** descarta los RR fuera de 300–2000 ms o que se desvíen más de un 20 % de la mediana de los 5 anteriores. Sustitúyelos por interpolación lineal y marca el porcentaje corregido; si supera el 10 %, la ventana no es válida.

## D2. Métricas (en `src/hrv/`, TypeScript puro y testeado)
- **Frecuencia cardíaca instantánea** `60000/RR`, remuestreada a 4 Hz por interpolación cúbica para las gráficas y el análisis espectral.
- **Amplitud pico-valle por ciclo respiratorio:** media de (FC máxima − FC mínima) dentro de cada ciclo del marcapasos. Es la métrica principal que se muestra al usuario, en lpm.
- **Desfase FC-respiración:** retardo de la correlación cruzada máxima entre la FC remuestreada y `lung`, expresado en grados del ciclo (lo ideal está cerca de 0°).
- **Espectro:** periodograma de Lomb-Scargle sobre los RR en ventanas de 64 s con un paso de 5 s. Calcula la potencia LF (0.04–0.15 Hz) y HF (0.15–0.4 Hz), y la frecuencia del pico máximo.
- **Índice de coherencia:** busca el pico máximo en 0.04–0.26 Hz y llama "pico" a la potencia en ±0.015 Hz alrededor de él. `ratio = pico / (total(0.0033–0.4 Hz) − pico)`. En la interfaz se muestra como baja (< 0.5), media (0.5–2) o alta (> 2). Es un índice orientativo, no clínico.
- **RMSSD y SDNN** de la sesión (solo informativos).
- Tests con señales sintéticas: RR con oscilación sinusoidal conocida a 0.1 Hz y ±8 lpm, más ruido. Comprueba que la amplitud pico-valle vale unos 16 lpm ±1, que el pico espectral sale en 0.1 Hz ±0.005, que el desfase es correcto si se introduce un retardo conocido y que la coherencia es alta. Con RR aleatorios, la coherencia debe salir baja. Prueba también la limpieza de artefactos con latidos ectópicos insertados.

## D3. Fases

### Fase 15 — Conexión del sensor y métricas
- Conexión BLE (botón "Conectar banda"), flujo de RR, limpieza de artefactos y las métricas de §D2 con sus tests. Gráfica en vivo de la FC (canvas 2D) superpuesta a la curva `lung`.
- ✅ Aceptación: con una banda real, la FC coincide con la que muestra la app del fabricante (±2 lpm); los tests de métricas pasan.

### Fase 16 — Prueba de frecuencia de resonancia con sensor
- La misma prueba escalonada que en la Fase 10 (6.5 → 4.5 rpm, 2 min por escalón y 1 min de descanso), pero puntuando cada escalón con los criterios en este orden: (1) desfase más cercano a 0°, (2) mayor amplitud pico-valle, (3) mayor potencia LF, (4) pico LF más alto y (5) curva más regular. Usa la suma ponderada de rangos con pesos 5, 4, 3, 2 y 1. Muestra una tabla con los resultados y la frecuencia recomendada, que el usuario puede aceptar o cambiar.
- ✅ Aceptación: con datos sintéticos que tienen la resonancia en 5.5 rpm, la prueba recomienda 5.5.

### Fase 17 — Biofeedback en sesión y cámara experimental
- Durante la respiración se muestran la amplitud pico-valle y el índice de coherencia, actualizados cada 5 s. Opción de "retirar la guía": a partir del minuto 5, las señales del marcapasos se atenúan progresivamente para que el usuario siga su propia FC (como en el protocolo clásico). El resumen de la sesión añade las métricas, que también se guardan en el registro.
- Fuente cámara PPG detrás de un aviso de "experimental" y comparada con la banda si ambas están disponibles.
- ✅ Aceptación: sesión de 10 min con la banda sin desconexiones y con las métricas guardadas; con la cámara, la FC queda dentro de ±5 lpm de la banda en reposo, o se marca como no fiable.

**Texto:** "El biofeedback de esta app es orientativo y no sustituye a una evaluación clínica. No es un producto sanitario."
