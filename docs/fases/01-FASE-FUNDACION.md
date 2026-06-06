# Fase 1 — Fundación

> Auth · Empresas · Ubicaciones · Usuarios · Configuración de columnas  
> **Dependencias:** ninguna — es la base de todo  
> **Duración estimada:** 8–10 días (1 desarrollador)

---

## Objetivo de la fase

Construir el esqueleto sobre el que todo lo demás se apoya: el modelo de datos de empresas y ubicaciones, el sistema de autenticación con RBAC, y la configuración parametrizable de columnas de inventario. Al terminar esta fase debe ser posible crear empresas, darles ubicaciones, asignarles usuarios con roles y definir cuántos precios y existencias mostrará el inventario en cada ubicación.

---

## 1. Schema Prisma — Fundación

```prisma
// ─────────────────────────────────────────
// EMPRESAS
// ─────────────────────────────────────────

model Empresa {
  id          String   @id @default(cuid())
  nombre      String
  razon_social String
  rfc         String
  logo_url    String?
  activa      Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  ubicaciones         Ubicacion[]
  usuarios            Usuario[]
  clientes            Cliente[]
  productos           Producto[]
  config_columnas     ConfigColumnasUbicacion[]
}

// ─────────────────────────────────────────
// UBICACIONES
// ─────────────────────────────────────────

model Ubicacion {
  id          String          @id @default(cuid())
  empresa_id  String
  nombre      String
  tipo        TipoUbicacion   // MATRIZ | FABRICA | PUNTO_VENTA
  activa      Boolean         @default(true)

  // Datos fiscales propios (se imprimen en el ticket)
  razon_social   String?
  rfc            String?
  regimen_fiscal String?
  calle          String?
  num_ext        String?
  num_int        String?
  colonia        String?
  municipio      String?
  estado         String?
  cp             String?
  telefono       String?

  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  empresa         Empresa               @relation(fields: [empresa_id], references: [id])
  usuarios        UsuarioUbicacion[]
  config_columnas ConfigColumnasUbicacion[]
  inventario      Inventario[]
  ventas          Venta[]
  entradas        Entrada[]
  salidas         Salida[]
  empleados       Empleado[]
}

enum TipoUbicacion {
  MATRIZ
  FABRICA
  PUNTO_VENTA
}

// ─────────────────────────────────────────
// USUARIOS Y AUTH
// ─────────────────────────────────────────

model Usuario {
  id          String   @id @default(cuid())
  empresa_id  String
  nombre      String
  apellidos   String
  email       String   @unique
  password_hash String
  rol         RolUsuario
  activo      Boolean  @default(true)
  ultimo_acceso DateTime?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  empresa     Empresa            @relation(fields: [empresa_id], references: [id])
  ubicaciones UsuarioUbicacion[]
  ventas      Venta[]
  refresh_tokens RefreshToken[]
}

// Tabla pivot usuario ↔ ubicación
// Un usuario puede estar asignado a varias ubicaciones de su empresa
// (excepto Admin que accede a todas, y SuperUsuario que accede a todo)
model UsuarioUbicacion {
  id           String    @id @default(cuid())
  usuario_id   String
  ubicacion_id String
  created_at   DateTime  @default(now())

  usuario   Usuario   @relation(fields: [usuario_id], references: [id])
  ubicacion Ubicacion @relation(fields: [ubicacion_id], references: [id])

  @@unique([usuario_id, ubicacion_id])
}

enum RolUsuario {
  SUPER_USUARIO
  ADMIN
  ENCARGADO
  VENDEDOR
  ALMACENISTA
  JEFE_MANUFACTURA
  JEFE_RH
}

model RefreshToken {
  id          String   @id @default(cuid())
  usuario_id  String
  token       String   @unique
  expires_at  DateTime
  revocado    Boolean  @default(false)
  created_at  DateTime @default(now())

  usuario  Usuario  @relation(fields: [usuario_id], references: [id])
}

// ─────────────────────────────────────────
// CONFIGURACIÓN DE COLUMNAS POR UBICACIÓN
// ─────────────────────────────────────────

// Define qué columnas de precio y existencia están activas
// en una empresa + ubicación, y cómo se llaman en el frontend.
// Es la "parametrización" que hace al inventario flexible.

model ConfigColumnasUbicacion {
  id           String    @id @default(cuid())
  empresa_id   String
  ubicacion_id String
  tipo         TipoColumna  // PRECIO | EXISTENCIA | DESCRIPCION
  numero       Int          // 1..10 para precios, 1..5 para existencias/descripciones
  label        String       // "Mayoreo", "Crédito", "Público", "Existencia Planta", etc.
  activa       Boolean   @default(true)
  orden        Int          // para ordenar en la tabla de inventario
  created_at   DateTime  @default(now())
  updated_at   DateTime  @updatedAt

  empresa   Empresa   @relation(fields: [empresa_id], references: [id])
  ubicacion Ubicacion @relation(fields: [ubicacion_id], references: [id])

  @@unique([empresa_id, ubicacion_id, tipo, numero])
}

enum TipoColumna {
  PRECIO
  EXISTENCIA
  DESCRIPCION
}
```

---

## 2. Módulos NestJS a crear

### 2.1 `AuthModule`
Responsable de login, generación de JWT, refresh tokens y guard global de roles.

**Endpoints:**
```
POST /auth/login            → { access_token, refresh_token, usuario }
POST /auth/refresh          → { access_token } (cookie httpOnly con refresh_token)
POST /auth/logout           → revoca refresh_token
GET  /auth/me               → usuario autenticado + permisos
```

**Guards:**
- `JwtAuthGuard` — valida el access_token en cada request
- `RolesGuard` — valida que el rol del usuario pueda ejecutar la acción
- `EmpresaUbicacionGuard` — valida que el usuario tenga acceso a la empresa/ubicación del recurso solicitado

**Decoradores:**
```typescript
@Roles(RolUsuario.ADMIN, RolUsuario.ENCARGADO)
@RequiereUbicacion()  // inyecta ubicacion_id en el request desde el JWT
```

### 2.2 `EmpresasModule`
Solo el Super Usuario y el Admin (de su empresa) pueden operar aquí.

**Endpoints:**
```
GET    /empresas                    → lista (Super Usuario ve todas; Admin ve la suya)
POST   /empresas                    → crear (solo Super Usuario)
GET    /empresas/:id                → detalle
PATCH  /empresas/:id                → editar
POST   /empresas/:id/logo           → subir logo (multipart → R2)
```

### 2.3 `UbicacionesModule`

**Endpoints:**
```
GET    /empresas/:empresaId/ubicaciones          → lista
POST   /empresas/:empresaId/ubicaciones          → crear (Admin)
GET    /empresas/:empresaId/ubicaciones/:id      → detalle con datos fiscales
PATCH  /empresas/:empresaId/ubicaciones/:id      → editar
DELETE /empresas/:empresaId/ubicaciones/:id      → desactivar (soft delete)
```

### 2.4 `UsuariosModule`

**Endpoints:**
```
GET    /usuarios                    → lista filtrada por empresa (Admin) o global (Super)
POST   /usuarios                    → crear usuario
GET    /usuarios/:id                → detalle
PATCH  /usuarios/:id                → editar (nombre, rol, ubicaciones asignadas)
POST   /usuarios/:id/reset-password → Admin resetea contraseña
DELETE /usuarios/:id                → desactivar (soft delete)
```

### 2.5 `ConfigColumnasModule`
El Admin de cada empresa configura cuántas columnas de precio/existencia activa en cada ubicación y cómo se llaman.

**Endpoints:**
```
GET    /config-columnas/:empresaId/:ubicacionId        → columnas activas
PUT    /config-columnas/:empresaId/:ubicacionId        → guardar configuración completa (upsert)
GET    /config-columnas/:empresaId/:ubicacionId/schema → esquema para el frontend de inventario
```

El endpoint `/schema` devuelve algo así, que el frontend de inventario consume para renderizar las columnas dinámicamente:

```json
{
  "precios": [
    { "numero": 1, "label": "Mayoreo",    "activa": true },
    { "numero": 2, "label": "Crédito",    "activa": true },
    { "numero": 3, "label": "Público",    "activa": true },
    { "numero": 4, "label": "No crédito", "activa": true }
  ],
  "existencias": [
    { "numero": 1, "label": "Existencia", "activa": true },
    { "numero": 2, "label": "En tránsito","activa": false }
  ],
  "descripciones": [
    { "numero": 1, "label": "Nombre",     "activa": true },
    { "numero": 2, "label": "Código",     "activa": true }
  ]
}
```

---

## 3. UI de la Fase 1

### 3.1 Pantallas requeridas

| Pantalla | Ruta | Rol mínimo |
|----------|------|------------|
| Login | `/login` | — |
| Dashboard raíz | `/dashboard` | Todos |
| Lista de empresas | `/configuracion/empresas` | Super Usuario |
| Detalle empresa | `/configuracion/empresas/:id` | Super Usuario / Admin |
| Lista de ubicaciones | `/configuracion/ubicaciones` | Admin |
| Detalle ubicación (datos fiscales) | `/configuracion/ubicaciones/:id` | Admin |
| Lista de usuarios | `/configuracion/usuarios` | Admin |
| Crear/editar usuario | `/configuracion/usuarios/:id` | Admin |
| Config columnas inventario | `/configuracion/columnas/:ubicacionId` | Admin |

### 3.2 Componente crítico: selector de contexto

En el header de la app, el usuario ve y puede cambiar su contexto activo:

```
[Logo empresa]  [EMFIMIFAR ▼]  [Matriz Monterrey ▼]   [Usuario ▼]
```

- **Super Usuario:** puede cambiar empresa y ubicación libremente (todas disponibles).
- **Admin:** puede cambiar entre las ubicaciones de su empresa.
- **Encargado/Vendedor/Almacenista:** ven solo su ubicación asignada (sin dropdown, es fijo).

El contexto activo se guarda en Zustand y se envía en cada request como headers `x-empresa-id` y `x-ubicacion-id`.

### 3.3 Configuración de columnas — UX

Es la pantalla más "técnica" de la fase. El Admin ve una tabla con todas las columnas posibles y puede:
- Activar/desactivar cada columna con un toggle.
- Editar el label de cada columna activa con un input inline.
- Reordenar con drag & drop (o flechas arriba/abajo para tablet).
- Guardar con un botón "Aplicar cambios".

Debe quedar muy claro en la UI que estos cambios afectan cómo se ve el inventario **en esa ubicación específica**. Mostrar siempre el nombre de la empresa y la ubicación en el título de la pantalla.

---

## 4. Plan de implementación

### Día 1 — Setup del monorepo
- Inicializar monorepo (pnpm workspaces o Turborepo).
- Crear `apps/api` con NestJS CLI.
- Crear `apps/web` con Next.js 14 + Tailwind + shadcn/ui.
- Configurar ESLint, Prettier, Husky + commitlint (Conventional Commits).
- Levantar PostgreSQL local con Docker Compose.
- Configurar Prisma y correr primera migración vacía.
- Subir a repositorio Git con rama `main` + `develop`.

### Día 2 — Schema y migraciones
- Escribir el schema completo de la Fase 1 en `schema.prisma`.
- Correr `prisma migrate dev --name fundacion`.
- Crear seeds: 3 empresas, 1-2 ubicaciones cada una, 1 Super Usuario, 1 Admin por empresa.
- Verificar schema con `prisma studio`.

### Día 3 — AuthModule
- Implementar `AuthModule` completo con JWT + Refresh Token.
- Guards: `JwtAuthGuard`, `RolesGuard`, `EmpresaUbicacionGuard`.
- Tests unitarios del guard de roles.
- Documentar endpoints en Swagger.

### Día 4 — EmpresasModule + UbicacionesModule
- CRUD de empresas con upload de logo a R2.
- CRUD de ubicaciones con datos fiscales.
- Tests de integración de los endpoints.
- Swagger documentado.

### Día 5 — UsuariosModule + ConfigColumnasModule
- CRUD de usuarios con asignación de ubicaciones.
- ConfigColumnasModule con endpoint `/schema`.
- Tests.

### Día 6 — Frontend: Login + Selector de contexto
- Pantalla de login con validación Zod.
- Header con selector de empresa/ubicación (Zustand).
- Layout base del área autenticada (sidebar + header).
- Manejo de tokens (httpOnly cookie + refresh automático).

### Día 7 — Frontend: Configuración de empresas y ubicaciones
- Pantalla lista de empresas (Super Usuario).
- Pantalla detalle empresa con upload de logo.
- Pantalla lista y detalle de ubicaciones con formulario de datos fiscales.

### Día 8 — Frontend: Usuarios y configuración de columnas
- Pantalla lista/crear/editar usuarios con selector de rol y ubicaciones.
- Pantalla configuración de columnas con toggle + label editable + drag & drop.
- Validaciones de frontend con Zod.

### Día 9 — PWA base + offline shell
- Configurar `next-pwa` con Workbox.
- Manifest.json con iconos por empresa (dinámico según contexto).
- Cache del shell (layout, assets estáticos).
- Inicializar Dexie.js para la sync queue (vacía por ahora).

### Día 10 — Testing, revisión y checklist de cierre
- E2E básico con Playwright: login → cambio de contexto → crear usuario.
- Revisar todos los criterios de aceptación.
- Deploy a staging.
- Demo grabada del flujo completo de configuración.

---

## 5. Criterios de aceptación

```
[ ] El Super Usuario puede ver todas las empresas y ubicaciones
[ ] El Admin solo ve su empresa y sus ubicaciones
[ ] Encargado/Vendedor/Almacenista solo acceden a su ubicación
[ ] Login con JWT funciona; refresh token rota automáticamente
[ ] Se puede crear una empresa con logo, razon social y RFC
[ ] Se puede crear una ubicación tipo MATRIZ/FABRICA/PUNTO_VENTA con datos fiscales completos
[ ] Se puede crear un usuario y asignarlo a una o más ubicaciones
[ ] La config de columnas de inventario se guarda por empresa+ubicación
[ ] El endpoint /schema devuelve el esquema correcto de columnas activas
[ ] El selector de contexto en el header funciona según el rol
[ ] La app carga como PWA (installable en Chrome/Edge)
[ ] El service worker cachea el shell correctamente
[ ] Tests con cobertura >70% en lógica de negocio
[ ] Swagger documenta todos los endpoints
[ ] Deploy a staging exitoso
```

---

## 6. Riesgos de la fase

**El guard de empresa/ubicación es lo más delicado.** Si queda flojo, un usuario de EMFIMIFAR podría ver datos de Metálicos Lyeva. Debe ser el primer código que se revise en code review.

**La config de columnas impacta todo lo que viene.** Si el esquema de `ConfigColumnasUbicacion` cambia después de la Fase 2, implica una migración costosa. Definir bien los máximos (10 precios, 5 existencias, 5 descripciones) y no tocarlos.

**El logo de empresa en el manifest PWA es dinámico.** El manifest.json estático no puede cambiar por usuario. La solución es un Route Handler en Next.js que sirve el manifest dinámicamente según el dominio o el primer login del usuario. Esto se puede simplificar usando un icono genérico del grupo para el MVP.

---

*Fase 1 de 8 · GrupoMetalicoEMF ERP · v1.0.0*
