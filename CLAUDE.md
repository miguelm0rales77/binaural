# Binaural — contexto del proyecto (para una sesión nueva)

App web instalable (PWA) que genera tonos con pulso (binaural, monaural, isocrónico) con fondos sintetizados,
presets, temporizador, exportación a WAV y reproducción en segundo plano. **Todo en español.**

- Web pública: https://miguelm0rales77.github.io/binaural/ · Repo: https://github.com/miguelm0rales77/binaural
- Carpeta: `~/Creaciones/Apps/Binaural` · Marca: `~/COMO SENTIRSE BIEN/DESIGN.md` (y `logos/`).
- Detalle de todas las decisiones y por qué: **`DECISIONES.md`** (léelo antes de cambiar algo). `README.md` = uso y despliegue.

## Estado (fases 0–7 del plan original hechas, más extras)
React 18 + TypeScript estricto + Vite + Vitest + `vite-plugin-pwa`. **237 tests**. Fases 0–14 del plan hechas (0–7 publicadas; 8 a 14 en commits locales, sin push), y además:
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
Decisiones tomadas en la revisión de pendientes (decidido por el usuario):
- **Plan `docs/PLAN-app-binaural.md`** (copiado al repo): Fases 0 y 1 ya estaban hechas (commits `fase 0` y `fase 1`). Fases 8 (reloj respiratorio, `src/dsp/breath.ts`) y 9 (sección «Respirar», presets y sesiones) hechas. Fase 10 hecha (registro de práctica y «Mi frecuencia»). Bloque C: fases 11–13 hechas (vista fractal, presets, seguridad visual). Fase 14 hecha con octavas por preset (2 o 3) para cumplir D 1,25–1,55 (decisión del usuario, ver DECISIONES.md). Revisión final hecha (ver DECISIONES.md): bucle con respiración en ciclos enteros, dos fallos corregidos. Ejecutar fase a fase con parada para revisión.
- **Bloque D (biofeedback con sensor de pulso): no se realiza por ahora.** No preguntar la plataforma hasta que se retome.
- Códigos de activación **firmados** (Ed25519): **aplazados**.
- Licencia: **todos los derechos reservados** por ahora.
- Tema: **sigue al sistema**, sin interruptor manual.

Pendiente de verificación por el usuario (no se puede hacer desde aquí):
- Probar en iPhone (segundo plano con pantalla bloqueada), Safari y Firefox: nunca verificado.
- Escuchar el trueno nuevo y el gong; ajustes previsibles listados en `DECISIONES.md`.
