# Binaural — contexto del proyecto (para una sesión nueva)

App web instalable (PWA) que genera tonos con pulso (binaural, monaural, isocrónico) con fondos sintetizados,
presets, temporizador, exportación a WAV y reproducción en segundo plano. **Todo en español.**

- Web pública: https://miguelm0rales77.github.io/binaural/ · Repo: https://github.com/miguelm0rales77/binaural
- Carpeta: `~/Creaciones/Apps/Binaural` · Marca: `~/COMO SENTIRSE BIEN/DESIGN.md` (y `logos/`).
- Detalle de todas las decisiones y por qué: **`DECISIONES.md`** (léelo antes de cambiar algo). `README.md` = uso y despliegue.

## Estado (fases 0–7 del plan original hechas, más extras)
React 18 + TypeScript estricto + Vite + Vitest + `vite-plugin-pwa`. **168 tests**. Fases 0–7 completas y publicadas, y además:
sensibilidad sensorial (aviso TEA/hiperacusis), volúmenes de arranque bajos, techo de volumen 0,8, fondos sintetizados
(naturaleza: lluvia, viento, tormenta con truenos, río, bosque; meditación: cuencos tibetanos y gong), estilo de marca
Como Sentirse Bien (claro crema / oscuro verde bosque según el sistema), icono de auriculares con onda de batido.

## Comandos
`npm install` · `npm run dev` (5173) · `npm test` · `npm run lint` (oxlint) · `npm run build` · `npm run preview` (4173).
Los tests de DSP renderizan minutos de audio: pueden tardar si la máquina está cargada (`testTimeout` 120 s).

## Arquitectura (lo esencial)
- `src/dsp/` TypeScript **puro** (sin APIs del navegador): `DspEngine` es el núcleo ÚNICO que usan el worklet (tiempo real),
  la exportación WAV y los tests. `nature.ts` (ruidos de la naturaleza y trueno), `meditation.ts` (cuencos, gong).
- `src/audio/` worklet, `AudioController`, render offline (`render.ts`), exportación en Web Worker, reproducción en segundo plano.
- `src/ui/` componentes React · `src/texts.ts` TODOS los textos legales/informativos (testeados contra promesas terapéuticas).
- `tests/` solo sobre lógica pura. Nada de reservar memoria en `process()`/`next()`.

## Reglas del proyecto (decisiones del usuario)
- **Sin afirmaciones terapéuticas**; nombres descriptivos; textos prudentes. Sin mensajes subliminales.
- **Sin grabaciones**: todo se sintetiza (el usuario mantuvo esta restricción). Los sonidos suenan artificiales y se dice.
- Volumen general con techo 0,8. Visualización del pulso **sin parpadeos** (fotosensibilidad) y desactivada por defecto.
- Truenos y gong tienen inicio marcado a propósito (el usuario lo pidió); la interfaz avisa a quien sea sensible.
- Estilo: seguir `DESIGN.md` de la marca (crema `#FAF5EF`, verde bosque `#1D342E`, oro; sin degradados ni neón; ámbar solo en
  botones de conversión → no se usa). Tipografías propias (`@fontsource`), sin Google Fonts.
- Commits firmados con el correo `noreply` de GitHub (ya configurado en este repo). **No subir (`git push`) sin que el usuario lo pida**:
  cada push a `main` despliega solo en GitHub Pages. `gh` está instalado y autenticado.
- El usuario trabaja **por fases**: al acabar una, commit `fase N: …`, resumen con el resultado de los tests y **parar** para revisión.
  Si algo es ambiguo, la opción más simple y anotarlo en `DECISIONES.md`. No añadir dependencias sin justificarlas.
- Yo no puedo **oír** el audio: se verifica con medidas (espectro, nivel, envolventes) y en el navegador; el juicio sonoro es del usuario.

## Pendiente
1. **Evolución de la app** con `PLAN-app-binaural.md` (respiración de resonancia, fractales; bloques A–D, fases 0–17). El usuario ya
   pidió ejecutarlo fase a fase empezando por la 0, **pero el archivo del plan aún no está en el proyecto** (hay que pedirlo/colocarlo).
   Ojo: el plan puede chocar con decisiones ya tomadas (stack, «fuera de alcance»…); reconciliar con el usuario al empezar.
   Antes del Bloque D hay que preguntar la plataforma (iPhone o Android/escritorio).
2. Códigos de activación **firmados** (nivel 2: Ed25519, clave privada fuera del repo) como «regalo» a suscriptores: aplazado.
3. Elegir licencia del código (ahora «todos los derechos reservados»).
4. Probar en iPhone (segundo plano con pantalla bloqueada), Safari y Firefox: nunca verificado.
5. Escuchar el trueno nuevo (más corto, 4 oleadas, cola oscura) y el gong; ajustes previsibles listados en `DECISIONES.md`.
6. Icono: se eligieron los auriculares; alternativa `python3 scripts/make-icons.py corazon`. Un cerebro lineal necesita dibujo a mano.
7. Posible interruptor manual de tema claro/oscuro (hoy sigue el sistema).
