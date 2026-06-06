# Fase 3 — Ventas

> Carrito · Notas provisionales · Pagos multi-método · Tickets · Carga de almacén · Versionado  
> **Dependencias:** Fases 1 y 2  
> **Duración estimada:** 10–12 días (1 desarrollador)

---

## Objetivo de la fase

Implementar el flujo de ventas completo: desde que el cliente llega y el usuario captura el pedido, hasta que el almacenista entrega la mercancía y la venta queda finalizada. Incluye pagos con múltiples métodos, manejo de crédito, tickets térmicos y versionado de tickets.

---

## 1. Estados de una venta

```
EN_PROCESO → NOTA_PROVISIONAL → PAGADA
                              → A_CREDITO
                              → NOTA_POR_PAGAR

PAGADA / A_CREDITO / NOTA_POR_PAGAR → CARGADA (almacenista confirma entrega)
                                     → CARGA_INCOMPLETA (faltaron piezas)

CARGADA → FINALIZADA
CARGA_INCOMPLETA → FINALIZADA (cuando el cliente recoge el restante)
```

**Transiciones válidas:**

| Desde | Hacia | Quién |
|-------|-------|-------|
| EN_PROCESO | NOTA_PROVISIONAL | Sistema (al guardar) |
| NOTA_PROVISIONAL | PAGADA | Encargado / Vendedor |
| NOTA_PROVISIONAL | A_CREDITO | Encargado (solo si el cliente tiene cuenta con crédito activo) |
| NOTA_PROVISIONAL | NOTA_POR_PAGAR | Encargado |
| PAGADA / A_CREDITO / NOTA_POR_PAGAR | CARGADA | Almacenista |
| PAGADA / A_CREDITO / NOTA_POR_PAGAR | CARGA_INCOMPLETA | Almacenista |
| CARGADA / CARGA_INCOMPLETA | FINALIZADA | Sistema (automático) / Almacenista |
| Cualquiera | CANCELADA | Solo Admin |

---

## 2. Schema Prisma — Ventas

```prisma
// ─────────────────────────────────────────
// VENTAS
// ─────────────────────────────────────────

model Venta {
  id              String      @id @default(cuid())
  empresa_id      String
  ubicacion_id    String
  usuario_id      String      // quien capturó
  cliente_id      String?     // null = venta a "Mostrador" (cliente genérico)
  cuenta_id       String?     // cuenta del cliente (define qué precios ve)
  folio           String      // número de nota (ej. "MX-000423") — único por ubicación
  estatus         EstatusVenta
  
  // Totales
  subtotal        Decimal     @db.Decimal(12, 2)
  descuento       Decimal     @db.Decimal(12, 2) @default(0)
  total           Decimal     @db.Decimal(12, 2)
  total_pagado    Decimal     @db.Decimal(12, 2) @default(0)
  total_cambio    Decimal     @db.Decimal(12, 2) @default(0)
  saldo_credito   Decimal     @db.Decimal(12, 2) @default(0)  // lo que quedó a deber

  notas           String?
  es_cotizacion   Boolean     @default(false)  // si true, no genera cargo ni ticket de caja

  fecha_venta     DateTime    @default(now())
  fecha_pago      DateTime?
  fecha_carga     DateTime?
  fecha_cierre    DateTime?
  created_at      DateTime    @default(now())
  updated_at      DateTime    @updatedAt

  empresa        Empresa          @relation(fields: [empresa_id], references: [id])
  ubicacion      Ubicacion        @relation(fields: [ubicacion_id], references: [id])
  usuario        Usuario          @relation(fields: [usuario_id], references: [id])
  cliente        Cliente?         @relation(fields: [cliente_id], references: [id])
  cuenta         CuentaCliente?   @relation(fields: [cuenta_id], references: [id])
  detalle        DetalleVenta[]
  pagos          PagoVenta[]
  evidencias     EvidenciaPago[]
  tickets        TicketVenta[]
  cargos_credito CargoCredito[]
}

enum EstatusVenta {
  EN_PROCESO
  NOTA_PROVISIONAL
  PAGADA
  A_CREDITO
  NOTA_POR_PAGAR
  CARGADA
  CARGA_INCOMPLETA
  FINALIZADA
  CANCELADA
}

// ─────────────────────────────────────────
// DETALLE DE VENTA (carrito)
// ─────────────────────────────────────────

model DetalleVenta {
  id                  String   @id @default(cuid())
  venta_id            String
  producto_id         String
  numero_precio       Int      // qué columna de precio se usó (1..10)
  cantidad_solicitada Decimal  @db.Decimal(12, 3)
  precio_unitario     Decimal  @db.Decimal(12, 2)
  descuento           Decimal  @db.Decimal(12, 2) @default(0)
  total               Decimal  @db.Decimal(12, 2)
  cantidad_entregada  Decimal  @db.Decimal(12, 3) @default(0)
  cantidad_faltante   Decimal  @db.Decimal(12, 3) @default(0)  // calculado al cargar

  venta    Venta    @relation(fields: [venta_id], references: [id])
  producto Producto @relation(fields: [producto_id], references: [id])
}

// ─────────────────────────────────────────
// PAGOS DE VENTA
// ─────────────────────────────────────────

model PagoVenta {
  id           String      @id @default(cuid())
  venta_id     String
  metodo       MetodoPago
  monto        Decimal     @db.Decimal(12, 2)
  referencia   String?     // número de autorización, folio de transferencia, etc.
  created_at   DateTime    @default(now())

  venta Venta @relation(fields: [venta_id], references: [id])
}

enum MetodoPago {
  EFECTIVO
  TARJETA_DEBITO
  TARJETA_CREDITO
  TRANSFERENCIA
  DEPOSITO
}

// ─────────────────────────────────────────
// EVIDENCIAS DE PAGO (imágenes)
// ─────────────────────────────────────────

model EvidenciaPago {
  id         String   @id @default(cuid())
  venta_id   String
  pago_id    String?  // puede asociarse a un pago específico
  url        String   // URL en R2
  nombre     String?
  created_at DateTime @default(now())

  venta Venta     @relation(fields: [venta_id], references: [id])
}

// ─────────────────────────────────────────
// TICKETS (versiones)
// ─────────────────────────────────────────
// Cada vez que se emite o re-emite un ticket, se crea un registro.
// Nunca se pisa el historial.

model TicketVenta {
  id           String      @id @default(cuid())
  venta_id     String
  version      Int         // 1, 2, 3... (autoincremental por venta)
  tipo         TipoTicket
  contenido    Json        // snapshot del ticket en ese momento (productos, precios, pagos)
  impreso      Boolean     @default(false)
  created_at   DateTime    @default(now())

  venta Venta @relation(fields: [venta_id], references: [id])

  @@unique([venta_id, version])
}

enum TipoTicket {
  NOTA_PROVISIONAL   // al crear la venta
  COBRO              // al pagar
  CARGA_PARCIAL      // ticket de almacén con lo que sí se entregó
  COTIZACION         // PDF para el cliente, sin precio de costo
  REIMPRESION        // copia posterior
}

// ─────────────────────────────────────────
// FOLIO COUNTER (por ubicación)
// ─────────────────────────────────────────
// Control del siguiente número de folio por ubicación

model FolioCounter {
  id           String   @id @default(cuid())
  ubicacion_id String   @unique
  prefijo      String   // ej. "MX", "MTY", "GDL"
  ultimo_folio Int      @default(0)
  updated_at   DateTime @updatedAt

  ubicacion Ubicacion @relation(fields: [ubicacion_id], references: [id])
}
```

---

## 3. Módulos NestJS

### 3.1 `VentasModule`

**Endpoints de ciclo de vida:**
```
POST   /ventas                          → crear venta (EN_PROCESO → NOTA_PROVISIONAL)
GET    /ventas                          → lista con filtros (estatus, fecha, cliente, folio)
GET    /ventas/:id                      → detalle completo
PATCH  /ventas/:id/detalle              → agregar/quitar/modificar productos del carrito
                                          (solo si estatus = EN_PROCESO o NOTA_PROVISIONAL)
POST   /ventas/:id/pagar                → registrar pago(s) → cambia estatus
POST   /ventas/:id/cargar               → almacenista confirma entrega
POST   /ventas/:id/cancelar             → solo Admin
GET    /ventas/:id/tickets              → lista de versiones de ticket
POST   /ventas/:id/reimprimir           → genera nueva versión de ticket tipo REIMPRESION
```

**Endpoint de pago — body:**
```json
{
  "pagos": [
    { "metodo": "EFECTIVO",     "monto": 200.00 },
    { "metodo": "DEPOSITO",     "monto": 200.00 }
  ],
  "es_nota_por_pagar": false
}
```

La lógica del servidor calcula:
- `total_pagado` = suma de pagos
- `saldo_credito` = total - total_pagado (si > 0 y cliente tiene cuenta con crédito → A_CREDITO)
- `total_cambio` = total_pagado - total (si pagó de más en efectivo)
- Si `es_nota_por_pagar = true` → estatus NOTA_POR_PAGAR independientemente del monto

**Endpoint de carga — body:**
```json
{
  "items": [
    { "detalle_venta_id": "...", "cantidad_entregada": 3 },
    { "detalle_venta_id": "...", "cantidad_entregada": 0 }
  ]
}
```

El servidor:
1. Actualiza `cantidad_entregada` y `cantidad_faltante` en cada `DetalleVenta`.
2. Descuenta `cantidad_entregada` de `existencia_1` en `Inventario` y registra en `MovimientoInventario`.
3. Si hay faltantes → `CARGA_INCOMPLETA` + genera ticket tipo `CARGA_PARCIAL`.
4. Si todo entregado → `CARGADA` → `FINALIZADA` automáticamente.

### 3.2 `CotizacionesModule`

Las cotizaciones son ventas con `es_cotizacion = true`. Tienen su propio flujo simplificado.

```
POST /cotizaciones                     → crear cotización
GET  /cotizaciones                     → lista
GET  /cotizaciones/:id                 → detalle
GET  /cotizaciones/:id/pdf             → genera y descarga PDF
POST /cotizaciones/:id/convertir       → convierte a venta (crea nueva Venta copiando detalle)
```

El PDF de cotización no muestra costos internos. Muestra nombre de empresa, datos del cliente, productos, precios y total.

### 3.3 `TicketsModule` (interno, no expuesto directamente)

Servicio que genera el contenido del ticket y lo envía al print-bridge.

```typescript
// Flujo de impresión
async imprimirTicket(ventaId: string, tipo: TipoTicket): Promise<void> {
  // 1. Obtener datos de la venta
  // 2. Obtener datos fiscales de la ubicación
  // 3. Generar snapshot JSON del ticket
  // 4. Guardar en TicketVenta (nueva versión)
  // 5. Enviar POST a localhost:7788/print con el payload ESC/POS
}
```

---

## 4. Lógica de folios

El folio es único por ubicación y se genera así: `{PREFIJO}-{NUMERO_CON_CEROS}`.

Ejemplos: `MX-000423`, `MTY-001089`, `PV1-000012`.

El prefijo lo define el Admin al crear la ubicación. El número es autoincremental en `FolioCounter`. Se usa una transacción de base de datos para que no haya duplicados aunque haya dos cajeros creando ventas al mismo tiempo.

**Generación en NestJS:**
```typescript
async generarFolio(ubicacionId: string): Promise<string> {
  return this.prisma.$transaction(async (tx) => {
    const counter = await tx.folioCounter.update({
      where: { ubicacion_id: ubicacionId },
      data: { ultimo_folio: { increment: 1 } },
    });
    const numero = String(counter.ultimo_folio).padStart(6, '0');
    return `${counter.prefijo}-${numero}`;
  });
}
```

---

## 5. Flujos de venta en detalle

### Flujo A — Pago completo de contado

1. Cajero crea venta → folio generado → `NOTA_PROVISIONAL`.
2. Cajero agrega productos al carrito.
3. Cliente paga. Cajero registra pago(s). `total_pagado >= total` → `PAGADA`.
4. Sistema genera ticket tipo `COBRO` (versión 1) y lo imprime.
5. Cajero entrega ticket físico al cliente.
6. Cliente va al almacén con el ticket.
7. Almacenista busca el folio, ve el detalle, confirma cantidades entregadas.
8. `CARGADA` → `FINALIZADA`.

### Flujo B — Venta a crédito

1. Igual que A hasta el paso 3.
2. Cliente paga $200 en efectivo y $200 en depósito de $1,000 total → `saldo_credito = 600`.
3. El cliente tiene cuenta con crédito activo → estatus `A_CREDITO`.
4. Sistema genera ticket e imprime.
5. Se crea un `CargoCredito` en la cuenta del cliente por -$600.
6. Almacenista carga normalmente.
7. La semana siguiente el cliente abona $400 en tarjeta → se aplica a la venta más antigua → saldo queda -$200.

### Flujo C — Carga incompleta

1. Almacenista recibe ticket. Solo hay 2 de 5 piezas en almacén.
2. Registra `cantidad_entregada = 2`. Sistema calcula `cantidad_faltante = 3`.
3. Estatus → `CARGA_INCOMPLETA`.
4. Sistema genera ticket tipo `CARGA_PARCIAL` solo con los 2 entregados.
5. Días después el cliente regresa. Almacenista lo busca por folio.
6. Registra la entrega del restante.
7. `FINALIZADA`.

### Flujo D — En proceso (guardar y salir)

1. Cajero está capturando. El cliente dice "espera" y se va a ver algo.
2. Cajero guarda como `EN_PROCESO` → folio ya generado → `NOTA_PROVISIONAL`.
3. Cajero puede cerrar la pantalla.
4. Al regresar el cliente, cajero busca el folio y continúa.

**Nota:** `EN_PROCESO` y `NOTA_PROVISIONAL` son el mismo estado desde el punto de vista del folio (ya existe). La diferencia es semántica para el cajero.

---

## 6. UI — Pantallas de ventas

### 6.1 Pantalla principal de ventas (nueva venta)

Layout en dos columnas:
- **Izquierda (60%):** buscador de productos → tabla de carrito con cantidad, precio, total.
- **Derecha (40%):** resumen del cliente, total, métodos de pago, botón cobrar.

En tablet, las columnas se apilan verticalmente con el carrito arriba y el cobro abajo.

El buscador de productos busca en tiempo real (debounce 300ms). Al seleccionar un producto, se agrega al carrito con cantidad 1 y el precio correspondiente a la cuenta del cliente.

### 6.2 Modal de cobro

Al presionar "Cobrar":
1. Muestra el total a pagar.
2. Filas para cada método de pago (con botón + para agregar más métodos).
3. Calculadora de cambio (si paga con efectivo de más).
4. Selector "¿Queda a crédito?" (solo si el cliente tiene cuenta con crédito).
5. Botón "Confirmar pago" → imprime ticket.

### 6.3 Lista de ventas del día

Vista tipo tabla con:
- Folio · Cliente · Total · Pagado · Estatus · Hora · Acciones.
- Filtros rápidos por estatus (chips/tabs arriba).
- Botón "Nueva venta" prominente.
- Búsqueda por folio o nombre de cliente.

### 6.4 Pantalla del almacenista

Vista diferente a la del cajero. Muestra ventas en estatus `PAGADA`, `A_CREDITO`, `NOTA_POR_PAGAR`.

Para cada venta:
- Folio y nombre del cliente.
- Lista de productos con cantidad a entregar.
- Input de "Entregado" por producto (editable).
- Botón "Confirmar carga".

---

## 7. Print Bridge — implementación

### Servicio Windows (`services/print-bridge/`)

```javascript
// index.js
const express = require('express');
const escpos = require('escpos');

const app = express();
app.use(express.json());

// Verificar que el servicio está vivo
app.get('/ping', (req, res) => res.json({ ok: true, version: '1.0.0' }));

// Imprimir ticket
app.post('/print', async (req, res) => {
  const { tipo, datos } = req.body;
  try {
    await imprimirTicket(tipo, datos);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function imprimirTicket(tipo, datos) {
  // Generar comandos ESC/POS según el tipo de ticket
  // COBRO: logo, empresa, datos fiscales, productos, total, pagos, cambio
  // CARGA_PARCIAL: sin precios, solo producto y cantidad entregada
  // COTIZACION: no se imprime térmico, se genera PDF
}

app.listen(7788, 'localhost', () => {
  console.log('Print Bridge corriendo en localhost:7788');
});
```

### Estructura del ticket térmico (COBRO)

```
================================
      [NOMBRE EMPRESA]
    [RAZÓN SOCIAL UBICACIÓN]
    RFC: [RFC]   Tel: [TEL]
================================
Folio: MX-000423
Fecha: 01/06/2026  14:32:18
Cajero: Juan García
--------------------------------
Cliente: Distribuidora Norte SA
--------------------------------
CANT  DESCRIPCIÓN        PRECIO
  5   Anaquel 5 niv.    9,250.00
  2   Góndola doble     3,400.00
--------------------------------
Subtotal:            12,650.00
Descuento:                0.00
TOTAL:               12,650.00
--------------------------------
Efectivo:             5,000.00
Depósito:             7,650.00
Cambio:                   0.00
================================
    ¡Gracias por su compra!
================================
[CORTE]
```

### Instalación como servicio Windows

Usar `node-windows` npm para registrar el script como servicio Windows:

```javascript
// install-service.js
const Service = require('node-windows').Service;
const svc = new Service({
  name: 'GrupoMetalicoEMF Print Bridge',
  description: 'Servicio de impresión térmica para GrupoMetalicoEMF ERP',
  script: require('path').join(__dirname, 'index.js'),
  nodeOptions: [],
});
svc.on('install', () => svc.start());
svc.install();
```

El instalador (NSIS o simple .bat) ejecuta `node install-service.js` una sola vez.

---

## 8. Plan de implementación

### Días 1-2 — Schema y módulos base
- Agregar todos los modelos de ventas al schema.
- `prisma migrate dev --name ventas`.
- `FolioCounter` seeds por ubicación.

### Días 3-4 — VentasModule (backend)
- Crear venta, agregar detalle, flujo de estados.
- Lógica de pagos multi-método.
- Lógica de carga del almacenista con descuento de existencias.

### Día 5 — TicketsModule + Print Bridge
- Servicio de generación de tickets (snapshot JSON).
- Print Bridge básico con ESC/POS.
- Prueba de impresión en ticketera física.

### Día 6 — CotizacionesModule + PDF
- CRUD de cotizaciones.
- Generación de PDF con react-pdf/renderer.
- Conversión cotización → venta.

### Días 7-8 — Frontend: pantalla de nueva venta
- Layout dos columnas (buscador + carrito).
- Modal de cobro con múltiples métodos de pago.
- Integración con print-bridge (ping + impresión).

### Días 9-10 — Frontend: lista de ventas y almacenista
- Lista de ventas del día con filtros por estatus.
- Pantalla del almacenista para carga de mercancía.
- Vista de historial y reimpresión de tickets.

### Días 11-12 — Offline + testing
- Encolar ventas en Dexie.js cuando no hay conexión.
- Sincronizar al recuperar conexión.
- E2E: flujo completo A, B y C.
- Deploy a staging.

---

## 9. Criterios de aceptación

```
[ ] Se puede crear una venta y agregar productos al carrito
[ ] El folio se genera automáticamente al guardar (sin duplicados bajo carga concurrente)
[ ] Se puede registrar pago con múltiples métodos en una misma venta
[ ] La lógica de cambio y saldo a crédito calcula correctamente
[ ] Al pagar, el ticket se imprime automáticamente en la ticketera
[ ] El almacenista puede confirmar carga total o parcial
[ ] La carga descuenta existencias en inventario y registra MovimientoInventario
[ ] Una carga incompleta genera ticket de carga parcial sin precios
[ ] El Admin puede cancelar una venta (con razón de cancelación)
[ ] Los tickets se versionan; cada reimpresión crea una nueva versión
[ ] Las cotizaciones generan PDF descargable sin precios de costo
[ ] Una cotización puede convertirse en venta sin recapturar datos
[ ] Las ventas se encolan offline y se sincronizan al recuperar conexión
[ ] La pantalla funciona bien en tablet 10" (1280x800)
[ ] Tests con cobertura >70%
```

---

## 10. Riesgos

**Concurrencia en existencias.** Si dos cajeros venden el mismo producto al mismo tiempo y solo hay 1 en existencia, ambas ventas pueden quedar en `PAGADA` con existencia negativa. Solución: al cargar (almacenista), si no hay suficiente existencia, aparece una advertencia. La existencia no se descuenta al vender sino al cargar. Esto es correcto para el negocio: el almacenista es quien sabe físicamente qué hay.

**El Print Bridge puede no estar corriendo.** Si el cajero abre la app y el servicio no responde al `/ping`, el botón de imprimir se deshabilita y se ofrece descarga del PDF como alternativa. El cajero puede imprimir el PDF desde el navegador a cualquier impresora.

**Ventas offline con clientes de crédito.** Si se crea una venta offline para un cliente que en realidad ya superó su límite de crédito, habrá una inconsistencia. Solución para MVP: las ventas a crédito requieren conexión. Si no hay internet, solo se permiten ventas de contado.

---

*Fase 3 de 8 · GrupoMetalicoEMF ERP · v1.0.0*
