# Stack Tecnológico Estándar

> Este documento describe la **tecnología base**, no el negocio del proyecto. Es la plantilla técnica que se reutiliza tal cual en otros ERPs del mismo tipo (monorepo Turborepo + pnpm, Next.js PWA, NestJS, Prisma/Postgres, deploy Vercel + Railway).

---

## 1. Monorepo — pnpm workspaces + Turborepo

```
apps/
  web/          ← Next.js 14 (frontend, PWA)
  api/          ← NestJS 11 (backend)

packages/
  database/     ← Prisma 5 (schema, cliente generado, migraciones)
  shared/       ← Tipos y schemas Zod compartidos entre web y api

services/
  print-bridge/ ← Servicio local Windows (fuera del monorepo de deploy)
```

- **Gestor de paquetes:** pnpm (`packageManager` fijado en `package.json`, actualmente `pnpm@10.34.1`).
- **Workspaces:** definidos en [pnpm-workspace.yaml](../pnpm-workspace.yaml) → `apps/*`, `packages/*`, `services/*`.
- **Orquestador de tareas:** Turborepo ([turbo.json](../turbo.json)). Cachea `build`, `lint`, `test`, `typecheck`; `dev` no se cachea y es persistente.
- **Por qué:** un solo repo, un solo `pnpm install`, cache incremental de builds, y los paquetes compartidos (`shared`, `database`) se referencian con `workspace:*` sin publicar a npm.

Comandos raíz (`package.json`):
```bash
pnpm dev          # turbo run dev (todas las apps en paralelo)
pnpm build        # turbo run build
pnpm typecheck / pnpm lint / pnpm test
pnpm db:generate / pnpm db:migrate / pnpm db:studio / pnpm db:seed
```

---

## 2. Frontend — Next.js 14 (App Router) como PWA

- **Framework:** Next.js `14.2.x`, React 18, App Router.
- **PWA:** [`@ducanh2912/next-pwa`](https://www.npmjs.com/package/@ducanh2912/next-pwa) — genera el Service Worker automáticamente en build de producción (Vercel lo activa solo).
- **Offline-first:** [Dexie.js](https://dexie.org/) + `dexie-react-hooks` sobre IndexedDB para persistencia local y sincronización cuando vuelve la conexión.
- **Data fetching / cache:** TanStack Query (`@tanstack/react-query`).
- **Formularios:** `react-hook-form` + `@hookform/resolvers` + `zod` para validación compartida con el backend.
- **Estado global:** `zustand`.
- **UI:** Radix UI (primitivas headless) + Tailwind CSS + `class-variance-authority` + `clsx`/`tailwind-merge` (patrón shadcn-like).
- **Extras:** `jspdf` + `html2canvas-pro` (exportar PDF), `qrcode` (generación de QR), `lucide-react` (iconos).
- **Testing:** Vitest (unitario) + Playwright (`test:e2e`) + MSW (mocks de red) + `fake-indexeddb` (mock de Dexie en tests).

**Por qué esta combinación:** Next.js da SSR/SSG + rutas de API si hacen falta; `next-pwa` resuelve el Service Worker sin configurarlo a mano; Dexie es la pieza que permite operar sin internet (requisito de mobile-primero / conexión intermitente).

---

## 3. Backend — NestJS 11 + Prisma 5

- **Framework:** NestJS `11.x` sobre Express (`@nestjs/platform-express`).
- **Auth:** `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`, hashing con `argon2`.
- **Validación:** `class-validator` + `class-transformer` (DTOs) — comparte convenciones de `zod` con el frontend vía `packages/shared`.
- **Docs de API:** `@nestjs/swagger` (expuesto en `/api/docs`, deshabilitado en producción).
- **Rate limiting:** `@nestjs/throttler`.
- **Seguridad HTTP:** `helmet`, `cookie-parser`.
- **Tareas programadas:** `@nestjs/schedule`.
- **Otros:** `nodemailer` (envío de correo), `exceljs`/`csv-parse` (import/export), `multer` (uploads).
- **Testing:** Vitest (no Jest — mismo runner que el frontend para consistencia en todo el monorepo).

**ORM — Prisma 5** (`packages/database`):
- Un único `schema.prisma`, cliente generado a `src/generated/client` y consumido como paquete workspace (`@grupometalicoemf/database`) desde `api`.
- Migraciones con `prisma migrate dev` (local) / `prisma migrate deploy` (producción).
- **Por qué:** tipado end-to-end (TypeScript nativo del schema al cliente), migraciones versionadas, y el mismo cliente se puede importar desde scripts de seed o utilidades sin duplicar modelos.

---

## 4. Base de datos e infraestructura local

- **PostgreSQL 15** — vía Docker Compose en desarrollo ([docker-compose.yml](../docker-compose.yml)), Railway Postgres en producción.
- **Redis 7** — Docker Compose en desarrollo; usado para cache/colas cuando aplica.
- **Por qué Postgres:** relacional, soporta bien los esquemas multi-tenant (empresa + ubicación) y JSON columns cuando se necesita flexibilidad puntual.

```bash
docker compose up -d     # levanta postgres:5433 y redis:6379 en local
```

---

## 5. Deploy

| Pieza | Plataforma | Config |
|---|---|---|
| **API** (NestJS) | Railway | [railway.json](../railway.json) — build con Nixpacks, migra y arranca `node apps/api/dist/main` |
| **DB** (Postgres) | Railway (plugin) | `DATABASE_URL` inyectada automáticamente al servicio |
| **Web** (Next.js) | Vercel | [vercel.json](../vercel.json) — `framework: nextjs`, Root Directory `apps/web` |
| **Print Bridge** | Local (Windows, por sucursal) | Compilado a `.exe` con `pkg`, fuera del flujo Railway/Vercel |

- Railway y Vercel se conectan directo al repo de Git: cada `git push` a `main` redespliega ambos automáticamente.
- El procedimiento paso a paso (variables de entorno, troubleshooting, primera puesta en producción) está en [DEPLOY.md](DEPLOY.md) — este documento (`STACK.md`) es solo el "qué" y el "por qué" de cada tecnología; `DEPLOY.md` es el "cómo".

---

## 6. Herramientas transversales

- **TypeScript 5.8** en todo el monorepo (`tsconfig.base.json` compartido).
- **ESLint 9** (flat config) + **Prettier 3**.
- **Node >= 18.17**, **pnpm >= 9**.

---

## 7. Checklist para replicar este stack en un proyecto nuevo

1. `pnpm-workspace.yaml` con `apps/*`, `packages/*`, `services/*`.
2. `turbo.json` con tasks `build`/`dev`/`lint`/`test`/`typecheck`.
3. `apps/web` → Next.js 14 + `@ducanh2912/next-pwa` + Dexie + Tailwind + Radix.
4. `apps/api` → NestJS 11 + Passport JWT + argon2 + Swagger.
5. `packages/database` → Prisma 5, cliente generado como export del paquete.
6. `packages/shared` → tipos/zod compartidos.
7. `docker-compose.yml` con Postgres 15 + Redis 7 para desarrollo local.
8. `vercel.json` (Root Directory = `apps/web`) + `railway.json` (build/start apuntando a `apps/api`).
9. Vitest como test runner único (web y api), Playwright solo en `web` para e2e.
