# ⚙️ GrupoMetalicoEMF — Design System & Brand Reference

> **LEE ESTE ARCHIVO ANTES DE GENERAR CUALQUIER UI O COMPONENTE.**
> Es la fuente única de verdad para naming, marca, colores, tipografía, tablas, copy y patrones visuales del ERP **GrupoMetalicoEMF**.

---

## 📌 Identidad del sistema

**Nombre del sistema:** `GrupoMetalicoEMF`  
**Nunca escribir como:** ~~grupoMetalicoEMF~~, ~~Grupo Metalico EMF~~, ~~GRUPOMETALICOEMF~~, ~~grupo-metalico-emf~~  
**Tagline:** "Sistema de Gestión Industrial"  
**Empresas del grupo:**  
- `EMFIMIFAR` — manufactura y venta de anaqueles, góndolas y estantería metálica  
- `Metálicos Lyeva` — mismo giro, operación independiente  
- `Láminas Monterrey` — venta y fabricación de láminas  

### En todo el código

```typescript
// ✅ CORRECTO
export const APP_NAME = 'GrupoMetalicoEMF';
export const EMPRESAS = ['EMFIMIFAR', 'Metálicos Lyeva', 'Láminas Monterrey'];
<title>GrupoMetalicoEMF — Ventas · Matriz Monterrey</title>

// ❌ INCORRECTO
const APP_NAME = 'Grupo Metalico EMF';   // sin espacios en el nombre del sistema
const APP_NAME = 'grupometalicoemf';     // minúsculas
const empresa  = 'EMFIMIFAR S.A.';      // sin sufijo legal a menos que sea dato fiscal
```

---

## 🎨 Sistema de color

### Configuración Tailwind

```typescript
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  theme: {
    extend: {
      colors: {
        // Rojo EMF — color primario del sistema
        brand: {
          50:  '#FEF2F1',
          100: '#FDDDD9',
          200: '#FBBBB3',
          300: '#F7897D',
          400: '#F0584A',
          500: '#E74C3C',  // Rojo claro / hover
          600: '#C0392B',  // ★ PRIMARIO — Rojo EMF
          700: '#992D20',  // Rojo profundo
          800: '#7A2318',
          900: '#5C1A11',
        },
        // Acero — neutros industriales
        steel: {
          900: '#1C1C1C',  // negro industrial (sidebar bg)
          800: '#2C2C2C',  // superficies oscuras
          700: '#3D3D3D',  // bordes en modo oscuro
          600: '#5A5A58',  // texto muted en dark
          500: '#888880',  // texto secundario / iconos inactivos
          400: '#AAAAAA',  // placeholders
          300: '#CCCCCA',  // bordes default
          200: '#E0E0DE',  // bordes hover
          100: '#F2F2F0',  // background sección
          50:  '#F8F7F3',  // off-white industrial (surface principal)
        },
        // Semánticos operativos
        status: {
          paid:       '#065F46',  // verde — pagada / finalizada
          credit:     '#92400E',  // ámbar — a crédito / pendiente
          pending:    '#1E3A5F',  // azul oscuro — nota provisional
          alert:      '#C0392B',  // rojo — cancelada / alerta
          incomplete: '#6B21A8',  // morado — carga incompleta
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
}
```

### Reglas de uso del color

| Para | Usa | NO uses |
|------|-----|---------|
| Botón primario | `bg-brand-600 hover:bg-brand-700 text-white` | `bg-red-600` o hex directo |
| Botón secundario | `bg-white border border-steel-300 text-steel-900` | `bg-gray-100` |
| Botón destructivo | `bg-brand-600 hover:bg-brand-700 text-white` | igual que primario (el destructivo SÍ es rojo) |
| Texto principal | `text-steel-900` | `text-black` |
| Texto secundario | `text-steel-500` | `text-gray-500` |
| Texto muted / labels | `text-steel-400` | tonos arbitrarios |
| Sidebar background | `bg-steel-900` | azules o grises genéricos |
| Superficie de página | `bg-steel-50` | `bg-white` directo en el body |
| Card / panel | `bg-white border border-steel-200` | sombras dramáticas |
| Badge venta pagada | `bg-green-50 text-status-paid` | verdes genéricos |
| Badge a crédito | `bg-amber-50 text-status-credit` | amarillos genéricos |
| Badge nota provisional | `bg-blue-50 text-status-pending` | azules genéricos |
| Badge cancelada | `bg-brand-50 text-status-alert` | rojos genéricos |
| Badge carga incompleta | `bg-purple-50 text-status-incomplete` | morados genéricos |
| Existencia en cero | `text-brand-600 font-semibold` | rojo genérico |
| Existencia baja (< 5) | `text-amber-600` | amarillo genérico |

---

## 🔤 Tipografía

**Familia única:** `Inter`  
**Fallback:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

### Escala tipográfica

| Token | Tamaño | Peso | Uso |
|-------|--------|------|-----|
| `text-display-lg` | 28px / 1.2 | 700 | Page titles |
| `text-display-md` | 22px / 1.25 | 700 | Card titles, modal headers |
| `text-display-sm` | 18px / 1.3 | 600 | Subsection headers |
| `text-body-lg` | 16px / 1.5 | 400 | Lead text |
| `text-body` | 14px / 1.6 | 400 | Default — texto de la app |
| `text-body-sm` | 13px / 1.5 | 400 | Texto secundario, helper |
| `text-table` | 13px / 1.4 | 400 | **Celdas de tabla** |
| `text-table-header` | 11px / 1.4 | 600 | **Encabezados de tabla** (uppercase) |
| `text-eyebrow` | 11px / 1.4 | 600 | Section labels (uppercase) |
| `text-meta` | 11px / 1.4 | 500 | Timestamps, folios, refs |
| `text-mono` | 13px / 1.4 | 400 | Monoespaciado — cantidades, precios, códigos |

### Wordmark en código

```tsx
// Renderizado correcto del wordmark
<span className="font-bold tracking-tight text-steel-900">
  Metálico<span className="text-brand-600">EMF</span>
</span>

// En sidebar (fondo oscuro)
<span className="font-bold tracking-tight text-white">
  Metálico<span className="text-brand-400">EMF</span>
</span>
```

---

## 📐 Espaciado, radios y elevación

### Border radius
- `rounded` (4px) → badges inline, chips de estado
- `rounded-md` (6px) → inputs, botones, celdas editables
- `rounded-lg` (8px) → cards, dropdowns, tooltips
- `rounded-xl` (12px) → modales, paneles laterales, stat cards
- `rounded-full` → avatares, dots de estado

### Espaciado interno
- Stat cards: `p-4` (16px)
- Cards estándar: `p-4` o `p-5`
- Modales: `p-6`
- Secciones de página: `gap-4`

### Sombras (mínimas, industriales)
```css
/* Card default */
box-shadow: 0 1px 3px rgba(0,0,0,.05);

/* Card hover / dropdown */
box-shadow: 0 4px 10px rgba(0,0,0,.07);

/* Modal */
box-shadow: 0 16px 32px rgba(0,0,0,.10);
```

---

## 📊 Tablas — Reglas de oro

> Las tablas son el corazón de este ERP. Deben ser compactas, legibles y funcionar bien en tablet con muchas columnas.

### Principios

1. **Compactas siempre.** El padding de celda es `py-1.5 px-3` (6px vertical, 12px horizontal). Nunca `py-4` en tablas.
2. **Fuente pequeña.** Siempre `text-table` (13px) en celdas, `text-table-header` (11px uppercase) en headers.
3. **Sin bordes en celdas.** Solo `border-b border-steel-100` en cada fila. Sin bordes verticales entre columnas.
4. **Header fijo + scroll vertical.** Nunca toda la tabla en un solo scroll infinito. Paginación siempre del lado del servidor.
5. **Columnas de número a la derecha.** Precios, cantidades, totales: `text-right font-mono`.
6. **Columnas de texto a la izquierda.** Nombre, descripción, folio: `text-left`.
7. **Columnas de estado centradas.** Badges de estatus: `text-center`.
8. **Hover de fila.** `hover:bg-steel-50 cursor-default` en cada `<tr>`.
9. **Fila seleccionada.** `bg-brand-50 border-l-2 border-brand-600`.
10. **Sin texto "No hay datos".** Usar el componente `<EmptyState>` (ver abajo).

### Estructura base de tabla

```tsx
// ✅ Patrón correcto — tabla compacta
<div className="rounded-lg border border-steel-200 overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full border-collapse">
      <thead className="bg-steel-100 sticky top-0 z-10">
        <tr>
          <th className="py-2 px-3 text-left text-table-header text-steel-500 uppercase tracking-wide font-semibold whitespace-nowrap">
            Código
          </th>
          <th className="py-2 px-3 text-left text-table-header text-steel-500 uppercase tracking-wide font-semibold">
            Descripción
          </th>
          <th className="py-2 px-3 text-right text-table-header text-steel-500 uppercase tracking-wide font-semibold whitespace-nowrap">
            Precio
          </th>
          <th className="py-2 px-3 text-center text-table-header text-steel-500 uppercase tracking-wide font-semibold">
            Estatus
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-steel-100">
        <tr className="hover:bg-steel-50 transition-colors">
          <td className="py-1.5 px-3 text-table text-steel-500 font-mono whitespace-nowrap">
            ANA-001
          </td>
          <td className="py-1.5 px-3 text-table text-steel-900">
            Anaquel 5 niveles gris
          </td>
          <td className="py-1.5 px-3 text-table text-steel-900 font-mono text-right tabular-nums">
            $1,850.00
          </td>
          <td className="py-1.5 px-3 text-center">
            <Badge variant="paid">Pagada</Badge>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  {/* Paginación siempre presente */}
  <div className="border-t border-steel-200 px-4 py-2 flex items-center justify-between bg-white">
    <p className="text-body-sm text-steel-500">
      Mostrando 1–25 de 312 registros
    </p>
    <div className="flex items-center gap-1">
      <PaginationButton disabled>Anterior</PaginationButton>
      <PaginationButton active>1</PaginationButton>
      <PaginationButton>2</PaginationButton>
      <PaginationButton>3</PaginationButton>
      <PaginationButton>Siguiente</PaginationButton>
    </div>
  </div>
</div>

// ❌ Incorrecto — celdas con demasiado padding
<td className="py-4 px-6 text-base">...</td>
```

### Tamaños de página recomendados

| Módulo | Registros por página |
|--------|---------------------|
| Inventario | 25 |
| Ventas del día | 25 |
| Historial de ventas | 20 |
| Clientes | 25 |
| Movimientos de inventario | 30 |
| Empleados | 25 |
| Reportes | 20 |

### Tabla de inventario con columnas dinámicas

El inventario es el caso especial: sus columnas vienen del schema de `ConfigColumnasUbicacion`. El componente `<TablaInventario>` recibe el schema y solo renderiza las columnas activas.

```tsx
// Columnas fijas (siempre visibles)
// código | desc_1

// Columnas condicionales (según schema activo)
// desc_2..5 → solo si están activas en la config
// precio_1..10 → con su label ("Mayoreo", "Crédito", etc.)
// existencia_1..5 → con su label ("Existencia", "En tránsito", etc.)

// Regla de existencia en tabla de inventario:
// existencia = 0          → text-brand-600 font-semibold (alerta rojo)
// existencia > 0 y < 5    → text-amber-600               (alerta ámbar)
// existencia >= 5         → text-steel-900               (normal)
```

### Columna de acciones

Siempre la última columna, siempre `text-right`, siempre `w-[80px]` fijo para no empujar otras columnas.

```tsx
<td className="py-1.5 px-3 text-right w-20">
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="p-1 rounded hover:bg-steel-100 text-steel-400 hover:text-steel-700">
        <DotsHorizontalIcon className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem>Ver detalle</DropdownMenuItem>
      <DropdownMenuItem>Editar</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-brand-600">Cancelar</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</td>
```

---

## 🧩 Componentes base

```
components/ui/
├── button.tsx             variants: primary | secondary | ghost | destructive | outline
├── input.tsx
├── select.tsx
├── card.tsx
├── badge.tsx              variants: paid | credit | pending | incomplete | cancelled | process | default
├── dialog.tsx
├── sheet.tsx              edición lateral en tablet / detalle
├── data-table.tsx         ★ tabla base con paginación (ver patrón arriba)
├── tabla-inventario.tsx   ★ tabla dinámica según ConfigColumnasUbicacion
├── stat-card.tsx          ★ tarjeta de KPI del dashboard
├── context-switcher.tsx   ★ selector de empresa + ubicación (header)
├── empty-state.tsx        ★ pantalla vacía sin datos
├── search-input.tsx       búsqueda con debounce 300ms
├── pagination.tsx         paginación server-side
├── status-badge.tsx       badge de estatus de venta
├── folio-tag.tsx          etiqueta de folio monoespaciada
└── logo.tsx               ★ componentes de marca (ver abajo)
```

### StatCard (dashboard)

```tsx
// Stat card compacta para dashboards
<div className="bg-white border border-steel-200 rounded-xl p-4">
  <p className="text-eyebrow text-steel-500 uppercase tracking-wide">Ventas hoy</p>
  <p className="text-display-md font-bold text-steel-900 mt-1 tabular-nums">$48,350</p>
  <p className="text-body-sm text-steel-500 mt-0.5">23 ventas cerradas</p>
</div>

// Stat card con acento de marca (métrica principal)
<div className="bg-brand-600 rounded-xl p-4">
  <p className="text-eyebrow text-brand-200 uppercase tracking-wide">Total cobrado</p>
  <p className="text-display-md font-bold text-white mt-1 tabular-nums">$41,050</p>
  <p className="text-body-sm text-brand-200 mt-0.5">Efectivo + tarjeta + transferencia</p>
</div>
```

### StatusBadge (ventas)

```tsx
// Variantes exactas para estatus de venta
const variants = {
  EN_PROCESO:        'bg-steel-100 text-steel-600',
  NOTA_PROVISIONAL:  'bg-blue-50 text-status-pending border border-blue-200',
  PAGADA:            'bg-green-50 text-status-paid border border-green-200',
  A_CREDITO:         'bg-amber-50 text-status-credit border border-amber-200',
  NOTA_POR_PAGAR:    'bg-orange-50 text-orange-700 border border-orange-200',
  CARGADA:           'bg-teal-50 text-teal-700 border border-teal-200',
  CARGA_INCOMPLETA:  'bg-purple-50 text-status-incomplete border border-purple-200',
  FINALIZADA:        'bg-steel-100 text-steel-600 border border-steel-200',
  CANCELADA:         'bg-brand-50 text-status-alert border border-brand-200',
}

// Tamaño: siempre text-meta (11px), nunca más grande
<span className={`inline-flex items-center px-2 py-0.5 rounded text-meta font-medium ${variants[estatus]}`}>
  {labelEstatus[estatus]}
</span>
```

### FolioTag

```tsx
// Folio siempre monoespaciado y en color muted
<span className="font-mono text-meta text-steel-500 bg-steel-100 px-1.5 py-0.5 rounded">
  MX-000423
</span>
```

### EmptyState

```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-12 h-12 rounded-xl bg-steel-100 flex items-center justify-center mb-3">
    <BoxIcon className="h-6 w-6 text-steel-400" />
  </div>
  <p className="text-body font-medium text-steel-900">Sin ventas hoy</p>
  <p className="text-body-sm text-steel-500 mt-1">
    Las ventas del día aparecerán aquí una vez que se capturen.
  </p>
  <Button variant="primary" size="sm" className="mt-4">
    Nueva venta
  </Button>
</div>
```

---

## 🖥️ Layout general de la app

### Sidebar (escritorio / tablet horizontal)

```tsx
// Sidebar oscuro, colapsable en tablet
<aside className="w-56 bg-steel-900 h-screen flex flex-col sticky top-0">

  {/* Logo + nombre empresa */}
  <div className="px-4 py-4 border-b border-steel-700">
    <Logo variant="isotipo" size={28} className="text-white" />
    <span className="ml-2 text-white font-semibold text-body">EMFIMIFAR</span>
    <p className="text-steel-500 text-meta mt-0.5">Matriz Monterrey</p>
  </div>

  {/* Navegación por módulos */}
  <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
    <NavItem icon={<HomeIcon />} href="/dashboard">Dashboard</NavItem>
    <NavItem icon={<ShoppingCartIcon />} href="/ventas">Ventas</NavItem>
    <NavItem icon={<BoxIcon />} href="/inventario">Inventario</NavItem>
    <NavItem icon={<TruckIcon />} href="/entradas">Entradas</NavItem>
    <NavItem icon={<ArrowUpIcon />} href="/salidas">Salidas</NavItem>
    <NavItem icon={<UsersIcon />} href="/clientes">Clientes</NavItem>
    <NavItem icon={<ClipboardIcon />} href="/compras">Compras</NavItem>
    <NavItem icon={<PeopleIcon />} href="/rh">RH</NavItem>
    <NavItem icon={<BarChartIcon />} href="/reportes">Reportes</NavItem>
    {/* Solo Admin y Super Usuario */}
    <NavItem icon={<SettingsIcon />} href="/configuracion">Configuración</NavItem>
  </nav>

  {/* Usuario activo */}
  <div className="px-4 py-3 border-t border-steel-700">
    <UserMenuCompact />
  </div>
</aside>
```

### NavItem activo vs inactivo

```tsx
// Activo
<a className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-body font-medium">
  <Icon className="h-4 w-4" />
  Ventas
</a>

// Inactivo
<a className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-steel-400 hover:bg-steel-800 hover:text-white text-body transition-colors">
  <Icon className="h-4 w-4" />
  Inventario
</a>
```

### Header de página

```tsx
<div className="px-6 py-4 border-b border-steel-200 bg-white flex items-center justify-between">
  <div>
    <h1 className="text-display-sm font-bold text-steel-900">Ventas</h1>
    <p className="text-body-sm text-steel-500 mt-0.5">Matriz Monterrey · lunes 01 jun 2026</p>
  </div>
  <div className="flex items-center gap-2">
    {/* Acciones primarias de la página */}
    <Button variant="primary">Nueva venta</Button>
  </div>
</div>
```

### ContextSwitcher (selector empresa / ubicación)

El componente más crítico de la app. Siempre visible en el sidebar inferior o en el header.

```tsx
// Compacto para sidebar
<button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-steel-800 text-left">
  <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center">
    <span className="text-white font-bold text-[9px]">EF</span>
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-white text-body-sm font-medium truncate">EMFIMIFAR</p>
    <p className="text-steel-500 text-meta truncate">Matriz Monterrey</p>
  </div>
  <ChevronUpDownIcon className="h-3.5 w-3.5 text-steel-500 flex-shrink-0" />
</button>
```

---

## 🖼️ Referencias visuales (Mockups — fuente única)

**Ubicación:** `docs/reference/mockups.html`

Antes de crear cualquier pantalla, abre ese archivo y busca la pantalla correspondiente. Las pantallas de referencia son:

| # | Pantalla | Ruta |
|---|----------|------|
| 1 | Dashboard del Encargado (ventas del día + caja) | `/dashboard` |
| 2 | Nueva venta (carrito + cobro) | `/ventas/nueva` |
| 3 | Lista de ventas con filtros y paginación | `/ventas` |
| 4 | Tabla de inventario parametrizable | `/inventario` |
| 5 | Ficha de cliente con estado de cuenta | `/clientes/[id]` |

**Regla:** Si vas a crear una pantalla que no está en los mockups, describe el wireframe textual y confírmalo antes de codificar.

---

## 🖨️ Logos — componentes importables

```tsx
// apps/web/components/brand/Logo.tsx
export function Logo({ size = 28, variant = 'isotipo', empresa }: LogoProps) {
  // variant: 'horizontal' | 'vertical' | 'isotipo' | 'isotipo-mono' | 'isotipo-blanco'
  // empresa: 'grupo' | 'emfimifar' | 'metalicos-lyeva' | 'laminas-monterrey'
}

// Uso en sidebar (fondo oscuro)
<Logo size={28} variant="isotipo-blanco" empresa="grupo" />

// Uso en login
<Logo size={48} variant="vertical" empresa="grupo" />

// Uso en ticket (B/N)
<Logo size={32} variant="isotipo-mono" empresa="emfimifar" />
```

**SVGs en** `apps/web/public/brand/`:
- `grupo/logo-horizontal.svg`
- `grupo/logo-vertical.svg`
- `grupo/isotipo-color.svg`
- `grupo/isotipo-mono.svg`
- `grupo/isotipo-blanco.svg`
- `emfimifar/logo.svg`
- `metalicos-lyeva/logo.svg`
- `laminas-monterrey/logo.svg`
- `favicon.svg`

---

## ✍️ Tono de voz en la UI

### Microcopy — reglas

**SÍ usar:**
- "Venta registrada · Folio MX-000423"
- "Existencia insuficiente: hay 2 piezas, se solicitaron 5"
- "Saldo pendiente: $1,200.00 · Venta más antigua: MX-000311"
- "Modo sin conexión — datos al 01/06/2026 08:14"
- "Impresora no disponible — descarga el PDF"

**NO usar:**
- ❌ "¡Genial!" / "¡Perfecto!" / "¡Listo!" — sin celebraciones artificiales
- ❌ "Oops, algo salió mal" — sé específico del error
- ❌ Emojis en la UI operativa (solo en marketing)
- ❌ Inglés mezclado: "Loading...", "Save", "Cancel" → "Cargando…", "Guardar", "Cancelar"
- ❌ "Hola usuario" → usa el nombre real
- ❌ "Precio 1", "Precio 2" → usa el label configurado ("Mayoreo", "Crédito", etc.)

### Estados de error — específicos y accionables

```typescript
// ✅ Correcto
"No se pudo registrar el pago. El monto ingresado ($0.00) debe ser mayor a cero."
"La venta MX-000423 ya fue cancelada y no puede modificarse."
"Sin conexión. Esta venta se sincronizará cuando recuperes internet."

// ❌ Incorrecto
"Error al guardar"
"Operación fallida"
```

### Botones — verbos en infinitivo

- ✅ "Registrar venta", "Cobrar", "Imprimir ticket", "Confirmar carga", "Registrar abono"
- ❌ "Registramos tu venta", "Click aquí para cobrar", "Enviar"

### Confirmaciones destructivas

```
"¿Cancelar la venta MX-000423 por $12,650.00? Esta acción no se puede deshacer y quedará registrada en el historial."
```

---

## 🔖 Naming conventions en código

### Archivos

- Páginas Next.js: `kebab-case/page.tsx` → `/app/ventas/page.tsx`
- Componentes: `PascalCase.tsx` → `TablaVentas.tsx`, `ModalCobro.tsx`
- Hooks: `use` prefix → `useContextoActivo.ts`, `useInventario.ts`
- Utils: camelCase → `formatPrecio.ts`, `calcularCambio.ts`

### Variables y esquema Prisma

```typescript
// ✅ Español consistente en la UI, inglés en el schema
// UI / Zustand store
const { empresaActiva, ubicacionActiva } = useContexto();

// Prisma — snake_case
model Venta {
  id            String @id @default(cuid())
  empresa_id    String
  ubicacion_id  String
  total         Decimal @db.Decimal(12, 2)
  estatus       EstatusVenta
}

// DTOs NestJS — camelCase
class CreateVentaDto {
  empresaId: string;
  ubicacionId: string;
  clienteId?: string;
}
```

### URLs — siempre en español, kebab-case

```
/dashboard          (no /home)
/ventas             (no /sales)
/ventas/nueva       (no /ventas/new)
/inventario         (no /inventory)
/clientes           (no /customers)
/clientes/[id]/cuenta  (no /cuenta-corriente)
/entradas           (no /entries)
/salidas            (no /exits)
/compras            (no /purchases)
/rh                 (no /hr)
/reportes           (no /reports)
/configuracion      (no /settings o /config)
/configuracion/empresas
/configuracion/ubicaciones
/configuracion/usuarios
/configuracion/columnas
```

---

## 📱 Breakpoints y responsive

Este sistema opera en tres superficies:

| Superficie | Ancho | Uso |
|-----------|-------|-----|
| Móvil | 390px | Vendedor (venta rápida a mostrador) |
| Tablet | 768px–1024px | Encargado (ventas, carrito), Almacenista (carga) |
| Desktop | 1280px+ | Admin, Encargado, Super Usuario (tablas amplias) |

### Reglas de responsive en tablas

En móvil y tablet, las tablas colapsan a tarjetas. Cada fila se convierte en una card con los campos más importantes visibles y el resto en un acordeón expandible.

```tsx
// Tabla en desktop
<div className="hidden md:block">
  <TablaVentas ventas={ventas} />
</div>

// Tarjetas en móvil
<div className="md:hidden space-y-2">
  {ventas.map(v => <VentaCard key={v.id} venta={v} />)}
</div>
```

### VentaCard (móvil)

```tsx
<div className="bg-white border border-steel-200 rounded-lg p-4">
  <div className="flex items-center justify-between mb-1">
    <FolioTag folio={venta.folio} />
    <StatusBadge estatus={venta.estatus} />
  </div>
  <p className="text-body font-medium text-steel-900 mt-2">
    {venta.cliente?.nombre ?? 'Mostrador'}
  </p>
  <p className="text-body-sm text-steel-500">{formatFecha(venta.fecha_venta)}</p>
  <div className="flex items-center justify-between mt-3">
    <span className="text-display-sm font-bold text-steel-900 tabular-nums">
      {formatPrecio(venta.total)}
    </span>
    <button className="text-body-sm text-brand-600 font-medium">Ver detalle →</button>
  </div>
</div>
```

---

## 💬 Formato de precios y cantidades

**Siempre usar `Intl.NumberFormat` o una función utilitaria — nunca formato manual.**

```typescript
// utils/formatPrecio.ts
export function formatPrecio(monto: number | string | Decimal): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(monto));
}
// Output: "$1,850.00"

export function formatCantidad(cantidad: number | string | Decimal): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(cantidad));
}
// Output: "24" o "2.500"

export function formatFecha(fecha: Date | string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(fecha));
}
// Output: "01/06/2026 14:32"
```

**En las tablas, los precios siempre van con `font-mono tabular-nums`** para que las columnas de dinero se alineen perfectamente.

---

## 🚨 Checklist antes de hacer commit de cualquier UI

```
[ ] El nombre del sistema es "GrupoMetalicoEMF" (sin espacios intermedios en código)
[ ] "EMF" siempre en brand-600 cuando aparece en el wordmark
[ ] Usé bg-brand-600 para acciones primarias, no red-600 ni hex directo
[ ] El sidebar es bg-steel-900 (negro industrial), no azul ni gris genérico
[ ] Las tablas tienen py-1.5 px-3 en celdas (compactas) — no py-4 ni py-3
[ ] Los headers de tabla son text-table-header (11px uppercase), no text-sm
[ ] Las tablas tienen paginación server-side — no cargo todos los registros
[ ] Los precios usan font-mono tabular-nums y text-right
[ ] Importé <Logo /> del componente oficial, no recreé el SVG inline
[ ] Los textos están en español de México (sin inglés mezclado)
[ ] Los botones son verbos en infinitivo
[ ] Las URLs están en español, kebab-case
[ ] Los estatus de venta usan el componente <StatusBadge> con las variantes definidas
[ ] Los precios pasan por formatPrecio() — no Intl.NumberFormat inline
[ ] En móvil la tabla colapsa a tarjetas <VentaCard>
[ ] No usé emojis decorativos en la UI operativa
```

---

## 🚨 Cuando tengas dudas

1. Abre `docs/reference/mockups.html` → busca la pantalla más parecida
2. Revisa `docs/reference/BRAND-GUIDELINES.md` → reglas duras de marca
3. Revisa la sección "Tablas" de este archivo → es el componente más frecuente
4. Si sigue ambiguo, **pregunta antes de codificar** — 5 minutos de duda vale más que 2 horas de reescritura

---

**Mantener actualizado este archivo cuando:**
- Aparezcan componentes nuevos → agregarlos a la sección de componentes base
- Se ajuste la paleta → actualizar Tailwind config y tabla de uso
- Se diseñen nuevas pantallas → agregar referencia en la sección de mockups
- Cambien las variantes de badges → actualizar `StatusBadge`

*GrupoMetalicoEMF ERP · Design System v1.0.0 · junio 2026*
