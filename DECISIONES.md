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
