# Manual de Despliegue — GrupoMetalicoEMF ERP

> **Stack**: NestJS (API) · Next.js 14 (Web) · PostgreSQL (DB) · pnpm workspaces · Turborepo  
> **Targets**: Railway (API + DB) · Vercel (Web) · Windows EXE (Print Bridge)

---

## Índice

1. [Variables de entorno](#1-variables-de-entorno)
2. [Deploy API → Railway](#2-deploy-api--railway)
3. [Deploy Web → Vercel](#3-deploy-web--vercel)
4. [Print Bridge → EXE Windows](#4-print-bridge--exe-windows)
5. [Post-deploy: migraciones y seed](#5-post-deploy-migraciones-y-seed)
6. [Flujo completo de primera puesta en producción](#6-flujo-completo-de-primera-puesta-en-producción)
7. [Actualizaciones posteriores](#7-actualizaciones-posteriores)
8. [Diagnóstico rápido](#8-diagnóstico-rápido)

---

## 1. Variables de entorno

### API (`apps/api`)

Crea un archivo `apps/api/.env` en local o configura estos valores en Railway:

```env
# Base de datos (Railway provee este valor automáticamente si usas su Postgres)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require"

# JWT — genera un secreto seguro con: openssl rand -base64 64
JWT_SECRET="CAMBIA_ESTO_POR_UN_SECRETO_LARGO_Y_ALEATORIO"
JWT_REFRESH_SECRET="OTRO_SECRETO_DIFERENTE_PARA_REFRESH"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# CORS — URL pública del frontend (sin barra final)
FRONTEND_URL="https://tu-app.vercel.app"

# Nodemailer (opcional — para envío de cotizaciones por email)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="tu-correo@gmail.com"
SMTP_PASS="contraseña-de-aplicación"
SMTP_FROM="GrupoMetalicoEMF <no-reply@grupometalicoEMF.com>"

# Puerto (Railway asigna $PORT automáticamente)
PORT=3001
NODE_ENV=production
```

### Web (`apps/web`)

Crea `apps/web/.env.local` en local o configura en Vercel:

```env
# URL pública de la API desplegada en Railway (sin barra final)
NEXT_PUBLIC_API_URL="https://tu-api.railway.app/api/v1"
```

---

## 2. Deploy API → Railway

### 2.1 Crear proyecto en Railway

1. Ingresa a [railway.app](https://railway.app) e inicia sesión.
2. **New Project → Deploy from GitHub repo** → selecciona el repositorio.
3. Railway detectará el monorepo. Si no lo hace automáticamente, configura el servicio manualmente.

### 2.2 Agregar PostgreSQL

1. En el proyecto Railway: **+ New → Database → Add PostgreSQL**.
2. Railway crea la base automáticamente y expone `DATABASE_URL` como variable de entorno del proyecto. Copia ese valor.

### 2.3 Configurar el servicio de API

En el servicio de la API (no en la base de datos):

**Settings → Build:**
```
Root Directory:   (vacío — la raíz del repo)
Build Command:    pnpm --filter @grupometalicoemf/database run generate && pnpm --filter @grupometalicoemf/api run build
Start Command:    node apps/api/dist/main
```

**Settings → Variables** — agrega todas las variables de [la sección 1](#api-appsapi):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | *(copiado del servicio Postgres de Railway)* |
| `JWT_SECRET` | *(secreto aleatorio)* |
| `JWT_REFRESH_SECRET` | *(secreto aleatorio diferente)* |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `FRONTEND_URL` | `https://tu-app.vercel.app` |
| `NODE_ENV` | `production` |
| `PORT` | `3001` *(Railway sobreescribe con $PORT — puedes omitirlo)* |
| `SMTP_*` | *(opcionales, para email)* |

**Settings → Networking:**
- Activa **Public Domain** para obtener la URL pública (`https://xxx.railway.app`).

### 2.4 Archivo `railway.json` (opcional pero recomendado)

Crea este archivo en la raíz del repo para que Railway lo lea directamente:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm --filter @grupometalicoemf/database run generate && pnpm --filter @grupometalicoemf/api run build"
  },
  "deploy": {
    "startCommand": "node apps/api/dist/main",
    "healthcheckPath": "/api/v1/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

> **Nota:** Railway usa Nixpacks para detectar pnpm. Si falla el build por falta de `pnpm`, agrega la variable `NIXPACKS_NODE_VERSION=18` y asegúrate de que `package.json` tenga `"packageManager": "pnpm@10.34.1"` (ya está).

### 2.5 Corrida de migraciones en producción

**Después del primer deploy**, ejecuta las migraciones. Ver [sección 5](#5-post-deploy-migraciones-y-seed).

---

## 3. Deploy Web → Vercel

### 3.1 Conectar repositorio

1. Ingresa a [vercel.com](https://vercel.com) e inicia sesión.
2. **Add New → Project → Import Git Repository** → selecciona el repositorio.
3. Vercel detectará el monorepo.

### 3.2 Configurar el proyecto en Vercel

En la pantalla de configuración del nuevo proyecto:

| Campo | Valor |
|---|---|
| **Framework Preset** | Next.js |
| **Root Directory** | `apps/web` |
| **Build Command** | *(dejar el default de Vercel: `next build`)* |
| **Output Directory** | *(dejar default: `.next`)* |
| **Install Command** | `pnpm install --frozen-lockfile` |

> **Importante:** El Root Directory debe ser `apps/web`. Vercel necesita poder resolver los workspace packages. Si da error con el workspace interno `@grupometalicoemf/shared`, agrega el Build Command explícito:
> ```
> cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @grupometalicoemf/web run build
> ```

### 3.3 Variables de entorno en Vercel

En **Settings → Environment Variables**:

| Variable | Entorno | Valor |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Production | `https://tu-api.railway.app/api/v1` |
| `NEXT_PUBLIC_API_URL` | Preview | `https://tu-api.railway.app/api/v1` |

### 3.4 Verificar PWA

El proyecto usa `@ducanh2912/next-pwa`. En producción Vercel habilitará el Service Worker automáticamente. Para verificar:
- Abre DevTools → Application → Service Workers → debe aparecer registrado.
- La app funcionará offline para páginas ya visitadas.

### 3.5 Dominio personalizado (opcional)

En **Settings → Domains** agrega tu dominio y configura los DNS según las instrucciones de Vercel.

---

## 4. Print Bridge → EXE Windows

El Print Bridge es un servicio local Windows que recibe payloads del navegador y los envía a la impresora térmica ESC/POS. **Solo se instala en la computadora de cada sucursal** (no va a Railway ni Vercel).

### 4.1 Pre-requisitos para compilar

En la máquina de desarrollo (con el repo clonado):

```bash
# Instalar dependencias del servicio
cd services/print-bridge
npm install

# Instalar la herramienta pkg globalmente (una sola vez)
npm install -g pkg
```

### 4.2 Compilar el EXE

```bash
cd services/print-bridge
npm run build:exe
```

Esto ejecuta:
```
pkg setup.js --target node18-win-x64 --output dist/PrintBridge-Setup.exe
```

El resultado es un único archivo: `services/print-bridge/dist/PrintBridge-Setup.exe`

> **¿Qué incluye el EXE?**
> - El servidor HTTP Express (puerto 7788)
> - El motor ESC/POS (tickets de venta, corte de caja, abonos)
> - `send-raw.ps1` — script PowerShell para imprimir vía Windows Spooler
> - `printer.config.json` — configuración por defecto embebida

### 4.3 Distribuir el instalador

Entrega a cada sucursal **dos archivos**:

```
PrintBridge-Setup.exe       ← ejecutable compilado
printer.config.json         ← configuración personalizada de la impresora
```

Pon ambos en la misma carpeta antes de ejecutar.

### 4.4 Instalar en Windows (en la sucursal)

1. Coloca `PrintBridge-Setup.exe` y `printer.config.json` en la misma carpeta (ej. Escritorio).
2. **Clic derecho → "Ejecutar como administrador"**.
3. El instalador:
   - Copia el EXE a `C:\Program Files\GrupoMetalicoEMF\PrintBridge\`
   - Copia `printer.config.json` al mismo directorio
   - Registra una **Tarea Programada** (`GrupoMetalicoEMF-PrintBridge`) que:
     - Se ejecuta al inicio de Windows como `SYSTEM`
     - Reinicia automáticamente si falla (hasta 5 veces, cada 2 min)
   - Inicia el servicio inmediatamente

4. Verifica en el navegador: `http://localhost:7788/ping`  
   Respuesta esperada:
   ```json
   { "status": "ok", "service": "GrupoMetalicoEMF Print Bridge", "version": "2.0.0" }
   ```

### 4.5 Configurar la impresora

Edita `C:\Program Files\GrupoMetalicoEMF\PrintBridge\printer.config.json`:

#### Opción A — USB conectada a Windows (más común)
```json
{
  "transport": "windows-printer",
  "printerName": "Ticketera",
  "columns": 48,
  "cutFeedLines": 5
}
```
> `printerName` debe coincidir exactamente con el nombre en **Panel de Control → Dispositivos e Impresoras**.

#### Opción B — Impresora en red (IP:puerto)
```json
{
  "transport": "network",
  "network": { "ip": "192.168.1.100", "port": 9100 },
  "columns": 48,
  "cutFeedLines": 5
}
```

#### Opción C — Puerto serie/paralelo
```json
{
  "transport": "windows-port",
  "windowsPort": "COM3",
  "columns": 48,
  "cutFeedLines": 5
}
```

Después de editar el config, reinicia el servicio:
```
PrintBridge-Setup.exe --restart
```
(ejecutar como administrador)

### 4.6 Comandos del EXE

| Comando | Descripción |
|---|---|
| `PrintBridge-Setup.exe` | Instala y registra la tarea de Windows |
| `PrintBridge-Setup.exe --service` | Inicia el servidor HTTP (lo usa la tarea programada) |
| `PrintBridge-Setup.exe --restart` | Reinicia el servicio sin reinstalar |
| `PrintBridge-Setup.exe --uninstall` | Detiene y elimina completamente |

### 4.7 Desinstalar

```
PrintBridge-Setup.exe --uninstall
```
(ejecutar como administrador) — elimina la tarea programada y borra `C:\Program Files\GrupoMetalicoEMF\PrintBridge\`.

---

## 5. Post-deploy: migraciones y seed

Estas acciones se ejecutan **una sola vez después del primer deploy** (y cada vez que haya nuevas migraciones).

### Opción A — Railway CLI (recomendado)

```bash
# Instalar Railway CLI (una sola vez)
npm install -g @railway/cli

# Autenticarse
railway login

# Linkear al proyecto
railway link

# Ejecutar migración en producción
railway run --service api pnpm --filter @grupometalicoemf/database run migrate

# Ejecutar seed (solo en la primera vez)
railway run --service api pnpm --filter @grupometalicoemf/database run seed
```

### Opción B — Desde local con DATABASE_URL de producción

```bash
# Copia el DATABASE_URL de Railway en tu .env local temporalmente
cd packages/database

# Ejecutar migraciones
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# Ejecutar seed
DATABASE_URL="postgresql://..." npx prisma db seed
```

### Opción C — Script de inicio automático

Agrega al `startCommand` en Railway:

```
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma && node apps/api/dist/main
```

> ⚠️ Esta opción ejecuta `migrate deploy` en cada reinicio. Es seguro (Prisma solo aplica migraciones nuevas) pero añade ~2s al arranque.

---

## 6. Flujo completo de primera puesta en producción

```
┌─────────────────────────────────────────────────────────────┐
│  PASO 1 — Preparar el repo                                   │
│  git add . && git commit -m "chore: production config"       │
│  git push origin main                                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 2 — Railway (API + DB)                                 │
│  1. Crear proyecto → conectar repo                           │
│  2. Agregar PostgreSQL plugin                                │
│  3. Configurar variables de entorno                          │
│  4. Configurar Build/Start command                           │
│  5. Activar Public Domain → copiar URL (ej. api.railway.app) │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 3 — Migraciones                                        │
│  railway run pnpm --filter @grupometalicoemf/database migrate│
│  railway run pnpm --filter @grupometalicoemf/database seed   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 4 — Vercel (Web)                                       │
│  1. Crear proyecto → conectar repo                           │
│  2. Root Directory = apps/web                                │
│  3. NEXT_PUBLIC_API_URL = https://api.railway.app/api/v1     │
│  4. Deploy → copiar URL (ej. app.vercel.app)                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 5 — Actualizar FRONTEND_URL en Railway                 │
│  FRONTEND_URL = https://app.vercel.app                       │
│  (para CORS — Railway redesplegará automáticamente)          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 6 — Print Bridge en cada sucursal                      │
│  1. cd services/print-bridge && npm run build:exe            │
│  2. Entregar PrintBridge-Setup.exe + printer.config.json     │
│  3. Ejecutar como Admin en la PC de la sucursal              │
│  4. Verificar: http://localhost:7788/ping                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Actualizaciones posteriores

### Actualizar API / Web

```bash
git add . && git commit -m "feat: descripción del cambio"
git push origin main
```

Railway y Vercel detectan el push y redesplegan automáticamente.

### Actualizar con nuevas migraciones de DB

```bash
git push origin main
# Después del deploy:
railway run --service api pnpm --filter @grupometalicoemf/database run migrate
```

### Actualizar Print Bridge en sucursal

```bash
# En la máquina de desarrollo:
cd services/print-bridge
npm run build:exe
# Entregar el nuevo dist/PrintBridge-Setup.exe a la sucursal

# En la sucursal (ejecutar como Admin):
PrintBridge-Setup.exe --uninstall
# Luego ejecutar el nuevo instalador
```

---

## 8. Diagnóstico rápido

### API no responde

```bash
# Ver logs en Railway
railway logs --service api

# Verificar que la API esté corriendo
curl https://tu-api.railway.app/api/v1/health
```

### Error de CORS en el frontend

- Verifica que `FRONTEND_URL` en Railway sea exactamente la URL de Vercel (sin barra final, con https://).
- Redespliega la API tras cambiar la variable.

### Print Bridge no imprime

1. Abre `http://localhost:7788/ping` en el navegador de la sucursal — si no responde, el servicio no está corriendo.
2. Verifica en **Programador de tareas** → `GrupoMetalicoEMF-PrintBridge` → estado debe ser "En ejecución".
3. Si está detenido: ejecuta `PrintBridge-Setup.exe --restart` como Admin.
4. Verifica el nombre de la impresora en `printer.config.json` — debe coincidir exactamente con **Panel de Control → Dispositivos e Impresoras**.

### Error "Cannot find module" en Railway

Asegúrate de que el Build Command incluye el generate de Prisma:
```
pnpm --filter @grupometalicoemf/database run generate && pnpm --filter @grupometalicoemf/api run build
```

### `pnpm install` falla en Vercel por workspace packages

Asegúrate de que el **Root Directory** en Vercel sea `apps/web` y que el Install Command sea:
```
cd ../.. && pnpm install --frozen-lockfile
```

---

## Referencia rápida de URLs

| Servicio | URL local | URL producción |
|---|---|---|
| API | `http://localhost:3001/api/v1` | `https://tu-api.railway.app/api/v1` |
| Swagger | `http://localhost:3001/api/docs` | *(deshabilitado en prod)* |
| Web | `http://localhost:3000` | `https://tu-app.vercel.app` |
| Print Bridge | `http://localhost:7788` | *(solo local en sucursal)* |
| Print Bridge ping | `http://localhost:7788/ping` | *(solo local en sucursal)* |
