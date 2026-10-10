# Decisiones

- **Linter:** se mantiene oxlint (el que trae la plantilla de Vite) en lugar de ESLint; es lo más simple y evita dependencias extra. `npm run lint`.
- **React 18:** la plantilla instala React 19; se fija React 18 como exige el plan.
- **tsconfig:** `strict` + `noUncheckedIndexedAccess`; `tests/` entra en la comprobación de tipos de `tsc -b`.
