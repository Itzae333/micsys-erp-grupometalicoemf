# micsys-erp-grupometalicoemf — Proyecto Maestro

> ERP industrial multi-empresa para el Grupo Metálico EMF. Cubre manufactura, inventario, ventas, compras, cuentas de clientes, RH y reportería. Diseñado para operar con conectividad intermitente, desde celular hasta desktop, con impresión directa a ticketera térmica.

**Versión:** 1.0.0  
**Fecha:** junio 2026  
**Stack:** Node.js · Next.js 14 (App Router) · NestJS · Prisma · PostgreSQL · PWA

---

## 1. El grupo y sus empresas

El sistema gestiona tres empresas independientes bajo el paraguas de Grupo Metálico EMF. Cada empresa tiene su propio logo, sus propios datos fiscales por ubicación y su propia operación, pero comparten la misma plataforma.

| Empresa | Giro | Observaciones |
|---------|------|---------------|
| **EMFIMIFAR** | Manufactura y venta de anaqueles, góndolas y estantería metálica | Empresa principal del grupo |
| **Metálicos Lyeva** | Mismo giro que EMFIMIFAR | Operación independiente, misma lógica |
| **Láminas Monterrey** | Venta y fabricación de láminas | Comercializa también a las otras empresas del grupo |

---

## 2. Tipos de ubicación

Cada empresa puede tener N ubicaciones. El tipo de ubicación define qué puede hacer esa sucursal:

| Tipo | Manufactura | Venta | Compras a proveedor | Almacén propio |
|------|-------------|-------|---------------------|----------------|
| **Matriz** | ✅ | ✅ | ✅ (opera todas las compras del grupo hacia esa empresa) | ✅ |
| **Fábrica** | ✅ | ❌ | ❌ | ✅ (salidas hacia Matriz) |
| **Punto de Venta (PV)** | ❌ | ✅ | ❌ | ✅ (recibe de Matriz) |

Reglas de flujo de mercancía:
- Fábrica → Matriz: salida sin precio (movimiento interno).
- Matriz → PV (misma empresa): venta a precio interno (menor que precio público).
- Empresa A → Empresa B: venta a precio inter-empresa (menor que precio público, mayor que costo).
- Proveedor externo → Matriz: entrada con costo (afecta inventario valorizado).

---

## 3. Arquitectura general

```
micsys-erp-grupometalicoemf/
├── apps/
│   ├── web/                        ← Next.js 14 App Router (PWA)
│   │   ├── app/
│   │   │   ├── (auth)/             ← login, recuperar contraseña
│   │   │   ├── (app)/              ← área autenticada
│   │   │   │   ├── layout.tsx      ← sidebar + header con contexto empresa/ubicación
│   │   │   │   ├── dashboard/
│   │   │   │   ├── ventas/
│   │   │   │   ├── inventario/
│   │   │   │   ├── entradas/
│   │   │   │   ├── salidas/
│   │   │   │   ├── clientes/
│   │   │   │   ├── compras/
│   │   │   │   ├── rh/
│   │   │   │   ├── configuracion/
│   │   │   │   └── reportes/
│   │   │   └── api/                ← Route Handlers (proxy al backend)
│   │   ├── components/
│   │   │   ├── ui/                 ← componentes base del design system
│   │   │   ├── ventas/
│   │   │   ├── inventario/
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── offline/            ← IndexedDB + sync queue
│   │   │   └── print/             ← cliente para servicio de impresión
│   │   └── public/
│   │       ├── brand/              ← logos de las 3 empresas + grupo
│   │       └── manifest.json       ← PWA manifest
│   │
│   └── api/                        ← NestJS (backend)
│       ├── src/
│       │   ├── auth/
│       │   ├── empresas/
│       │   ├── ubicaciones/
│       │   ├── inventario/
│       │   ├── ventas/
│       │   ├── clientes/
│       │   ├── compras/
│       │   ├── entradas-salidas/
│       │   ├── rh/
│       │   └── reportes/
│       └── prisma/
│           └── schema.prisma
│
├── services/
│   └── print-bridge/               ← Servicio Windows para ticketera térmica
│       ├── index.js                ← Express mini-server, escucha localhost:7788
│       └── installer/              ← NSIS o Inno Setup para instalar como servicio Windows
│
├── docs/
│   ├── fases/
│   │   ├── 00-PROYECTO-MAESTRO.md  ← este archivo
│   │   ├── 01-FASE-FUNDACION.md
│   │   ├── 02-FASE-INVENTARIO.md
│   │   ├── 03-FASE-VENTAS.md
│   │   ├── 04-FASE-CLIENTES-CREDITO.md
│   │   ├── 05-FASE-ENTRADAS-SALIDAS.md
│   │   ├── 06-FASE-COMPRAS.md
│   │   ├── 07-FASE-RH.md
│   │   └── 08-FASE-REPORTES.md
│   ├── DESIGN-SYSTEM.md
│   └── reference/
│       ├── mockups.html
│       └── BRAND-GUIDELINES.md
│
└── README.md
```

---

## 4. Stack técnico

### Frontend — Next.js 14 (App Router)
- **Framework:** Next.js 14 con App Router y Server Components
- **UI:** Tailwind CSS + shadcn/ui como base, extendido con el design system propio
- **Estado:** Zustand para estado global (contexto empresa/ubicación activa)
- **Offline:** IndexedDB via Dexie.js + cola de sincronización (sync queue)
- **PWA:** next-pwa (workbox bajo el capó), manifest.json, service worker
- **Formularios:** React Hook Form + Zod
- **Tablas:** TanStack Table v8 (columnas dinámicas por configuración de empresa)
- **PDF:** react-pdf/renderer para cotizaciones
- **Impresión:** fetch a localhost:7788 (print-bridge) desde el navegador

### Backend — NestJS
- **Framework:** NestJS con decoradores y módulos
- **ORM:** Prisma 5
- **Base de datos:** PostgreSQL 15
- **Auth:** JWT + Refresh Token (httpOnly cookie) + RBAC por roles
- **Validación:** class-validator + class-transformer
- **Docs:** Swagger (OpenAPI 3)
- **Jobs:** Bull (Redis) para sync offline y notificaciones
- **Storage:** Cloudflare R2 para evidencias de pago (imágenes de depósitos)

### Servicio de impresión (Windows)
- **Runtime:** Node.js 20 LTS
- **Servidor:** Express en localhost:7788
- **Protocolo:** ESC/POS via `node-escpos` o `escpos` npm
- **Instalación:** Se instala como servicio Windows con `node-windows` o NSIS installer
- **Seguridad:** Solo acepta conexiones de localhost, sin auth (es local)

### Infraestructura
- **Hosting app:** Vercel (frontend) + Railway o Render (NestJS + PostgreSQL)
- **Alternativa control total:** DigitalOcean Droplet con Docker Compose
- **Storage:** Cloudflare R2 (evidencias de pago, exports)
- **Cache/Jobs:** Redis (Upstash en cloud o container propio)

---

## 5. Roles del sistema

Los roles son jerárquicos. Un rol superior puede hacer todo lo de los roles inferiores dentro de su scope.

| Rol | Scope | Puede |
|-----|-------|-------|
| **Super Usuario** | Todas las empresas y ubicaciones | Solo consulta. Ve todo pero no modifica nada. Es el ojo del corporativo. |
| **Admin** | Su empresa (todas sus ubicaciones) | Configurar empresa, ubicaciones, usuarios, parámetros de columnas, cancelar/modificar ventas. Solo 1 por empresa. |
| **Encargado** | Su ubicación asignada | Crear ventas, clientes, cuentas, pagos, cotizaciones. No puede cancelar ni modificar ventas cerradas. |
| **Vendedor** | Su ubicación (modo tablet/caja) | Solo vende. Crea ventas contra cliente genérico "Mostrador". Pasa a caja a cobrar. |
| **Almacenista** | Su ubicación | Control de inventario. Recibe tickets físicos y registra carga (entregado/faltante). Registra entradas y salidas. |
| **Jefe de Manufactura** | Su ubicación (fábrica) | Monitorea producción. Ve qué se está fabricando. No modifica ventas ni inventario. |
| **Jefe de RH** | Su empresa | Gestiona empleados, registra piezas producidas, asistencia, sanciones. No tiene acceso a ventas ni inventario. |

**Nota importante:** No todos los empleados tienen usuario del sistema. Un operario de planta no necesita login. El Jefe de RH es quien registra su producción y asistencia desde el sistema.

---

## 6. Inventario — diseño del núcleo

El inventario es una sola tabla lógica con campos parametrizables. Este es el diseño más crítico de todo el sistema porque afecta UI, reportes y ventas.

### Por qué un inventario parametrizable

Cada empresa y ubicación puede necesitar:
- Diferente número de listas de precios (Empresa A Matriz: 4 precios; Empresa A PV: 2 precios)
- Diferente nombre para cada lista ("Mayoreo", "Crédito", "Público", "No Crédito")
- Diferente número de existencias a mostrar (algunas ubicaciones manejan unidad + kg + piezas)
- Diferente label para cada existencia ("Existencia Planta", "Existencia Almacén", "En tránsito")

La solución: la tabla `inventario` tiene columnas fijas `precio_1..precio_10` y `existencia_1..existencia_5`. La tabla `config_columnas_ubicacion` define cuáles están activas y cómo se llaman en esa empresa/ubicación.

### Máximos por diseño
- Hasta **10 listas de precios** por producto
- Hasta **5 existencias** por producto
- Hasta **5 descripciones** del producto (nombre corto, nombre largo, código interno, código proveedor, descripción técnica)

---

## 7. Flujo de ventas — resumen ejecutivo

El flujo de ventas es el corazón operativo del sistema. Se detalla en `03-FASE-VENTAS.md`, pero el resumen es:

```
Captura → Nota Provisional (número generado) → Pago (parcial/total/diferido)
    ↓
[Pagada] → Ticket al almacenista → Carga completa → Finalizada
                                  → Carga incompleta → Ticket parcial → Finalizada
[A crédito] → Cargo en cuenta cliente → Abono futuro → Cierre
[Nota por pagar] → Pago al cierre del día
```

Métodos de pago soportados (combinables en una misma venta):
- Efectivo · Tarjeta débito · Tarjeta crédito · Transferencia · Depósito

---

## 8. Roadmap de fases

**Regla de oro: no paralelizar fases.** Las dependencias son fuertes.

| # | Fase | Módulo principal | Dependencias |
|---|------|-----------------|--------------|
| 1 | **Fundación** | Auth, empresas, ubicaciones, usuarios, configuración de columnas | — |
| 2 | **Inventario** | Productos, precios parametrizables, existencias, proveedores | Fase 1 |
| 3 | **Ventas** | Carrito, notas, pagos, tickets, versiones de ticket | Fases 1-2 |
| 4 | **Clientes y Crédito** | Clientes, cuentas, cargos, abonos, estado de cuenta | Fases 1-3 |
| 5 | **Entradas y Salidas** | Movimientos internos, inter-empresa, de proveedor | Fases 1-2 |
| 6 | **Compras** | Órdenes de compra, proveedores, cuentas por pagar | Fases 1-2-5 |
| 7 | **RH** | Empleados, asistencia, producción por pieza/hora, sanciones | Fase 1 |
| 8 | **Reportes** | Dashboards, exports, KPIs por empresa/ubicación | Todas |

---

## 9. Modo offline — estrategia

Las ubicaciones pueden tener internet inestable. El sistema debe seguir funcionando.

### Qué opera offline
- Crear ventas (se encolan en IndexedDB)
- Registrar pagos en efectivo
- Consultar inventario (última versión cacheada)
- Imprimir tickets (el print-bridge es local, no necesita internet)

### Qué requiere conexión
- Sincronizar cola de ventas al servidor
- Consultar estado de cuenta del cliente (crédito real)
- Acceder a evidencias de pago en R2
- Reportes consolidados

### Mecanismo
1. Service Worker cachea el shell de la app y el último snapshot de inventario.
2. Zustand + Dexie.js mantienen cola de operaciones pendientes.
3. Al recuperar conexión, la sync queue procesa en orden FIFO.
4. Conflictos (ej. misma pieza vendida offline en dos PV): el servidor resuelve con timestamp y notifica al encargado.

---

## 10. Impresión térmica — estrategia

La impresión desde web a ticketera térmica es el problema más complejo técnicamente. La solución es un micro-servicio local en Windows.

### Print Bridge (servicio local Windows)
- Se instala una sola vez en cada computadora de caja.
- Corre como servicio Windows en background (auto-start).
- Expone `http://localhost:7788/print` (POST).
- Recibe el payload JSON con los datos del ticket.
- Genera y envía comandos ESC/POS a la impresora.
- La impresora puede estar conectada por USB, paralelo o red local.

### Flujo de impresión
```
Next.js (browser) → POST localhost:7788/print → print-bridge (Node) → ESC/POS → Ticketera
```

### Por qué no WebUSB/WebBluetooth
- WebUSB requiere Chrome y permisos manuales por impresora. Frágil en producción.
- Las ticketeras térmicas viejas no soportan Bluetooth.
- El servicio local es más robusto, funciona con cualquier marca de ticketera.

### Detección de disponibilidad
El frontend hace un GET a `localhost:7788/ping` al cargar. Si responde, activa el botón de imprimir. Si no, muestra aviso "Servicio de impresión no disponible" y ofrece descarga del PDF.

---

## 11. Decisiones técnicas pendientes (antes de arrancar)

Estas deben resolverse antes de empezar a codear:

1. **Hosting:** ¿Vercel + Railway o DigitalOcean con Docker Compose? Railway es más rápido de arrancar; DO da más control. Recomendación: Railway para MVP, migrar a DO cuando haya 2+ clientes pagando.

2. **CFDI / Facturación:** ¿Se integra facturación electrónica? Si sí, definir PAC (Facturama o SW Sapien) antes de Fase 6. Si no para MVP, dejar hooks preparados.

3. **Dominio del sistema:** ¿`app.grupometálicoemf.com` o dominio propio del cliente?

4. **Multi-tenant aislamiento:** Los datos de las 3 empresas viven en la misma DB con `empresa_id` como discriminador. Si en el futuro se vende el sistema a otro grupo, se puede levantar otra instancia. No hay row-level security por tenant en esta versión.

5. **Logo por empresa:** Cada empresa tiene su logo. El Admin de esa empresa lo sube desde configuración. Los logos se almacenan en R2.

---

## 12. Reglas de oro del proyecto

1. **Offline primero.** Si una feature no puede operar sin internet, debe tener un modo degradado.
2. **Mobile primero.** Cada pantalla se diseña primero para 390px (iPhone), luego se expande.
3. **Una fuente de verdad.** El inventario vive en la BD. No hay Excel paralelos ni hojas de cálculo de respaldo dentro del sistema.
4. **Roles estrictos.** Ningún usuario puede salirse de su scope. El middleware valida empresa + ubicación en cada request.
5. **Tickets versionados.** Toda modificación a una venta genera una nueva versión del ticket. Nunca se pisa el historial.
6. **Nombres consistentes.** Leer `DESIGN-SYSTEM.md` antes de crear cualquier componente, endpoint o tabla.
7. **No paralelizar fases.** Las dependencias son reales. Una tabla mal diseñada en fase 1 rompe todo lo que viene después.

---

*micsys-erp-grupometalicoemf ERP · v1.0.0 · junio 2026*
