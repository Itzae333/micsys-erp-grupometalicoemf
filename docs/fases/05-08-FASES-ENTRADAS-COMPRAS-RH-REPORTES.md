# Fase 5 — Entradas y Salidas

> Movimientos internos · Inter-empresa · De proveedor  
> **Dependencias:** Fases 1 y 2  
> **Duración estimada:** 5–6 días

---

## Objetivo

Registrar todos los movimientos de mercancía que no son ventas: entradas desde proveedor, entradas desde fábrica, salidas hacia fábrica o PV, y transferencias inter-empresa. Estos movimientos afectan directamente el inventario.

---

## 1. Tipos de movimiento

| Tipo | Descripción | Tiene precio | Quién lo crea |
|------|-------------|-------------|---------------|
| `ENTRADA_PROVEEDOR` | Compra de materia prima o mercancía | Sí (costo) | Almacenista / Encargado |
| `ENTRADA_FABRICA` | La fábrica manda producto terminado a la Matriz | No | Almacenista |
| `ENTRADA_EMPRESA` | Otra empresa del grupo manda mercancía | Sí (precio inter-empresa) | Almacenista |
| `SALIDA_FABRICA` | La Matriz manda insumos a la Fábrica | No | Almacenista |
| `SALIDA_EMPRESA` | La Matriz vende a otra empresa del grupo | Sí (precio inter-empresa) | Encargado |
| `SALIDA_PV` | La Matriz manda mercancía a un PV propio | Sí (precio interno) | Encargado |
| `AJUSTE_POSITIVO` | Ajuste manual de inventario (conteo físico) | No | Almacenista + Admin |
| `AJUSTE_NEGATIVO` | Merma, daño, pérdida | No | Almacenista + Admin |

---

## 2. Schema Prisma

```prisma
model Entrada {
  id            String         @id @default(cuid())
  empresa_id    String
  ubicacion_id  String         // destino de la entrada
  tipo          TipoEntrada
  folio         String         // ej. "ENT-000123"
  proveedor_id  String?        // solo para ENTRADA_PROVEEDOR
  empresa_origen_id String?    // solo para ENTRADA_EMPRESA
  estatus       EstatusMovimiento
  notas         String?
  created_at    DateTime       @default(now())
  updated_at    DateTime       @updatedAt

  detalle DetalleEntrada[]
}

model DetalleEntrada {
  id          String   @id @default(cuid())
  entrada_id  String
  producto_id String
  cantidad    Decimal  @db.Decimal(12, 3)
  costo       Decimal? @db.Decimal(12, 4)  // null si no aplica precio
  total       Decimal? @db.Decimal(12, 2)

  entrada  Entrada  @relation(fields: [entrada_id], references: [id])
  producto Producto @relation(fields: [producto_id], references: [id])
}

model Salida {
  id              String        @id @default(cuid())
  empresa_id      String
  ubicacion_id    String        // origen de la salida
  tipo            TipoSalida
  folio           String        // ej. "SAL-000089"
  ubicacion_destino_id String?  // para SALIDA_PV
  empresa_destino_id   String?  // para SALIDA_EMPRESA
  estatus         EstatusMovimiento
  notas           String?
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt

  detalle DetalleSalida[]
}

model DetalleSalida {
  id          String   @id @default(cuid())
  salida_id   String
  producto_id String
  cantidad    Decimal  @db.Decimal(12, 3)
  precio      Decimal? @db.Decimal(12, 2)  // null si movimiento interno
  total       Decimal? @db.Decimal(12, 2)

  salida   Salida   @relation(fields: [salida_id], references: [id])
  producto Producto @relation(fields: [producto_id], references: [id])
}

enum TipoEntrada    { PROVEEDOR FABRICA EMPRESA AJUSTE_POSITIVO }
enum TipoSalida     { FABRICA EMPRESA PUNTO_VENTA AJUSTE_NEGATIVO }
enum EstatusMovimiento { PENDIENTE CONFIRMADO CANCELADO }
```

---

## 3. Lógica de inventario

Al confirmar una entrada o salida, se actualiza `existencia_1` en `Inventario` y se registra en `MovimientoInventario`. El número de existencia que se afecta es configurable por ubicación (normalmente `existencia_1` es la principal).

Para entradas de proveedor con costo, se recalcula el `costo_promedio` del producto en esa ubicación usando el método de costo promedio ponderado:

```
nuevo_costo_promedio = (existencia_actual × costo_anterior + cantidad_nueva × costo_nuevo)
                       / (existencia_actual + cantidad_nueva)
```

---

## 4. Tickets de entrada/salida

Los tickets de movimientos internos (fábrica → matriz, matriz → PV) se imprimen **sin precios**. Solo muestran: folio, fecha, origen, destino, productos y cantidades. El mismo print-bridge los procesa.

---

## 5. Criterios de aceptación

```
[ ] Se puede registrar una entrada de proveedor con costo por producto
[ ] La entrada actualiza existencia y recalcula costo promedio
[ ] Se puede registrar una salida hacia otra ubicación/empresa
[ ] La salida descuenta existencia y genera movimiento en la bitácora
[ ] Los tickets de movimiento interno no muestran precios
[ ] Los ajustes de inventario requieren confirmación del Admin (ajuste negativo)
[ ] Tests con cobertura >70%
```

---

*Fase 5 de 8 · GrupoMetalicoEMF ERP · v1.0.0*

---
---

# Fase 6 — Compras

> Órdenes de compra · Proveedores · Cuentas por pagar  
> **Dependencias:** Fases 1, 2 y 5  
> **Duración estimada:** 5–6 días

---

## Objetivo

Gestionar el ciclo de compras: desde que la Matriz detecta necesidad de compra, genera una OC al proveedor, recibe la mercancía (conectado con Fase 5 Entradas) y registra la cuenta por pagar.

---

## 1. Flujo de una compra

```
Necesidad detectada → OC creada (BORRADOR)
→ OC enviada al proveedor (ENVIADA)
→ Proveedor entrega mercancía
→ Almacenista crea Entrada vinculada a la OC (RECIBIDA_PARCIAL / RECIBIDA)
→ Administración registra pago → PAGADA
```

---

## 2. Schema Prisma

```prisma
model OrdenCompra {
  id           String         @id @default(cuid())
  empresa_id   String
  ubicacion_id String
  proveedor_id String
  folio        String         // ej. "OC-000045"
  estatus      EstatusOC
  fecha_oc     DateTime       @default(now())
  fecha_entrega_esperada DateTime?
  total        Decimal        @db.Decimal(12, 2) @default(0)
  total_pagado Decimal        @db.Decimal(12, 2) @default(0)
  notas        String?
  created_at   DateTime       @default(now())
  updated_at   DateTime       @updatedAt

  detalle  DetalleOC[]
  entradas Entrada[]    // entradas que cubren esta OC
  pagos    PagoOC[]
}

model DetalleOC {
  id             String   @id @default(cuid())
  orden_compra_id String
  producto_id    String
  cantidad       Decimal  @db.Decimal(12, 3)
  precio_unitario Decimal @db.Decimal(12, 4)
  total          Decimal  @db.Decimal(12, 2)
  cantidad_recibida Decimal @db.Decimal(12, 3) @default(0)
}

model PagoOC {
  id              String     @id @default(cuid())
  orden_compra_id String
  metodo          MetodoPago
  monto           Decimal    @db.Decimal(12, 2)
  referencia      String?
  created_at      DateTime   @default(now())
}

enum EstatusOC { BORRADOR ENVIADA RECIBIDA_PARCIAL RECIBIDA PAGADA CANCELADA }
```

---

## 3. Endpoints principales

```
POST   /compras/ordenes                    → crear OC
GET    /compras/ordenes                    → lista con filtros
GET    /compras/ordenes/:id                → detalle con detalle y pagos
PATCH  /compras/ordenes/:id/estatus        → cambiar estatus
POST   /compras/ordenes/:id/pagos          → registrar pago
GET    /compras/cuentas-por-pagar          → OCs recibidas y no pagadas totalmente
```

---

## 4. Criterios de aceptación

```
[ ] Se puede crear una OC con varios productos y enviarla
[ ] Al recibir mercancía, la OC se vincula con la Entrada (Fase 5)
[ ] La OC puede recibirse parcialmente (múltiples entregas)
[ ] Las cuentas por pagar muestran el saldo pendiente por proveedor
[ ] Tests con cobertura >70%
```

---

*Fase 6 de 8 · GrupoMetalicoEMF ERP · v1.0.0*

---
---

# Fase 7 — Recursos Humanos

> Empleados · Asistencia · Producción por pieza/hora · Sanciones  
> **Dependencias:** Fase 1  
> **Duración estimada:** 6–7 días

---

## Objetivo

Gestionar empleados por empresa y ubicación, registrar su producción (por pieza o por hora), controlar asistencia desde tablet, aplicar sanciones y calcular nómina simple.

**Importante:** No todos los empleados tienen usuario del sistema. Un operario de planta solo tiene registro de empleado — el Jefe de RH o el Almacenista capturan su producción desde su tablet.

---

## 1. Schema Prisma

```prisma
model Empleado {
  id              String        @id @default(cuid())
  empresa_id      String
  ubicacion_id    String
  nombre          String
  apellidos       String
  puesto          String
  tipo_pago       TipoPago      // POR_PIEZA | POR_HORA
  tarifa          Decimal       @db.Decimal(10, 4)  // $ por pieza o $ por hora
  meta_piezas_semana Int?       // mínimo de piezas esperado por semana
  costo_por_minuto_tardanza Decimal? @db.Decimal(8, 4)
  tiene_usuario   Boolean       @default(false)
  usuario_id      String?       // si tiene_usuario = true
  activo          Boolean       @default(true)
  created_at      DateTime      @default(now())
  updated_at      DateTime      @updatedAt

  asistencias  Asistencia[]
  produccion   RegistroProduccion[]
  sanciones    Sancion[]
}

model Asistencia {
  id           String   @id @default(cuid())
  empleado_id  String
  fecha        DateTime @db.Date
  hora_entrada DateTime?
  hora_salida  DateTime?
  minutos_tardanza Int  @default(0)
  costo_tardanza Decimal @db.Decimal(10, 2) @default(0)
  notas        String?
  created_at   DateTime @default(now())
}

model RegistroProduccion {
  id          String   @id @default(cuid())
  empleado_id String
  fecha       DateTime @db.Date
  cantidad    Decimal  @db.Decimal(10, 3)  // piezas o horas
  monto       Decimal  @db.Decimal(10, 2)  // calculado: cantidad × tarifa
  producto_id String?  // qué producto fabricó (si aplica)
  notas       String?
  created_at  DateTime @default(now())
}

model Sancion {
  id          String   @id @default(cuid())
  empleado_id String
  tipo        String   // "FALTA", "TARDANZA", "INCUMPLIMIENTO_META", "OTRO"
  monto       Decimal  @db.Decimal(10, 2) @default(0)
  descripcion String
  fecha       DateTime @default(now())
  usuario_id  String   // quien la aplicó
}

enum TipoPago { POR_PIEZA POR_HORA }
```

---

## 2. Módulos NestJS

### `EmpleadosModule`
```
GET    /empleados                         → lista por ubicación
POST   /empleados                         → crear empleado
GET    /empleados/:id                     → detalle con producción y asistencia
PATCH  /empleados/:id                     → editar
```

### `AsistenciaModule`
```
POST   /empleados/:id/asistencia/entrada  → registrar entrada (calcula tardanza)
POST   /empleados/:id/asistencia/salida   → registrar salida
GET    /empleados/:id/asistencia          → historial (filtro por semana/mes)
GET    /asistencia/hoy                    → vista del día para el Jefe de Área
```

### `ProduccionModule`
```
POST   /empleados/:id/produccion          → registrar piezas/horas del día
GET    /empleados/:id/produccion          → historial
GET    /produccion/resumen-semana         → resumen por empleado de la semana actual
```

### `SancionesModule`
```
POST   /empleados/:id/sanciones           → aplicar sanción
GET    /empleados/:id/sanciones           → historial
```

---

## 3. Cálculo de nómina

El endpoint `GET /nomina/periodo` calcula para un rango de fechas:

- Empleados por pieza: `sum(produccion.cantidad) × tarifa`
- Empleados por hora: `sum(asistencia.horas_trabajadas) × tarifa`
- Deducciones: `sum(sanciones.monto)` + `sum(asistencia.costo_tardanza)`
- **Neto = producción/horas - deducciones**

No es un sistema de nómina fiscal completo (IMSS, ISR). Es un control interno de pago. Si se necesita nómina fiscal, se exporta a Excel para procesarla en el sistema del contador.

---

## 4. UI — Pantallas

### Vista del Jefe de RH
- Lista de empleados de su empresa con producción del día actual.
- Registrar asistencia (entrada/salida) para cada empleado desde tablet.
- Ver quién llegó tarde y cuánto costó.
- Registrar producción del turno.

### Vista del Jefe de Manufactura
- Dashboard de producción: total de piezas fabricadas hoy, esta semana.
- Quién está produciendo qué producto.
- Comparativa meta vs real por empleado.

### Vista del Super Usuario (consulta)
- Resumen de producción por empresa y ubicación.
- Comparativa entre fábricas.

---

## 5. Criterios de aceptación

```
[ ] Se puede crear un empleado con tipo de pago por pieza o por hora
[ ] La asistencia calcula tardanza en minutos y su costo automáticamente
[ ] La producción registrada calcula el monto automáticamente (cantidad × tarifa)
[ ] El resumen semanal muestra meta vs producción real por empleado
[ ] Las sanciones se descuentan en el cálculo de nómina
[ ] El Jefe de RH puede registrar asistencia y producción desde tablet
[ ] Tests con cobertura >70%
```

---

*Fase 7 de 8 · GrupoMetalicoEMF ERP · v1.0.0*

---
---

# Fase 8 — Reportes y Dashboards

> KPIs · Reportes exportables · Dashboards por rol  
> **Dependencias:** Todas las fases anteriores  
> **Duración estimada:** 6–8 días

---

## Objetivo

Construir la capa de inteligencia del sistema: dashboards operativos por rol, reportes exportables a Excel/PDF, y KPIs consolidados por empresa y ubicación para el Super Usuario y los Admins.

---

## 1. Dashboards por rol

### Super Usuario — Vista corporativa

Métricas de todas las empresas en una sola pantalla:

- Ventas totales del día/semana/mes por empresa (gráfica de barras comparativa).
- Inventario total valorizado por empresa.
- Clientes con mayor saldo vencido.
- Producción total por fábrica (piezas del mes).
- Alertas: ubicaciones sin ventas en N días, productos sin existencia.

### Admin — Vista de su empresa

- Ventas de hoy por ubicación (tabla + sparkline por hora).
- Cobranza pendiente: total a crédito, monto vencido, top 10 deudores.
- Inventario bajo mínimo (productos con existencia_1 < 5 unidades).
- Compras pendientes de recibir (OCs en estatus ENVIADA).
- Producción de la semana vs meta.

### Encargado — Vista operativa del día

- Ventas del día en su ubicación: cantidad, monto, promedio por venta.
- Ventas por estatus (nota provisional, pagadas, a crédito, finalizadas).
- Caja: efectivo, tarjeta, transferencia, depósito recibido hoy.
- Alertas de inventario bajo en productos que se movieron en los últimos 7 días.

### Almacenista — Vista de carga pendiente

- Ventas pagadas pendientes de cargar (ordenadas por hora).
- Productos con existencia en cero.
- Entradas del día (qué llegó hoy).

---

## 2. Reportes exportables

Todos los reportes tienen dos formatos: descarga Excel (.xlsx) y descarga PDF.

| Reporte | Filtros | Rol mínimo |
|---------|---------|------------|
| Ventas por período | Empresa, ubicación, fechas, estatus, cliente | Encargado |
| Estado de cuenta general | Empresa, ubicación, cliente, solo con saldo | Encargado |
| Inventario valuado | Empresa, ubicación | Encargado |
| Movimientos de inventario | Producto, tipo, fechas | Almacenista |
| Cuentas por pagar (proveedores) | Empresa, proveedor, fechas | Admin |
| Producción por empleado | Empresa, ubicación, período | Jefe RH |
| Asistencia | Empresa, ubicación, período | Jefe RH |
| Ventas comparativas por empresa | Período, tipo de agrupación (día/semana/mes) | Super Usuario |
| Corte de caja | Ubicación, fecha | Encargado |

---

## 3. Corte de caja

El corte de caja es el reporte más importante del día a día. Se genera al cierre del turno y muestra:

```
CORTE DE CAJA
Ubicación: Matriz Monterrey
Fecha: 01/06/2026   Turno: Mañana
Encargado: Juan García
─────────────────────────────────
Ventas cerradas:          $48,350
Ventas a crédito:          $8,200
Notas por pagar:           $1,500
─────────────────────────────────
COBRADO:
  Efectivo:               $22,100
  Tarjeta débito:         $14,750
  Tarjeta crédito:         $5,200
  Transferencia:           $4,000
  Depósito:                $2,300
─────────────────────────────────
Total cobrado:            $48,350
─────────────────────────────────
Ventas en proceso:             3
Ventas sin cargar:             5
─────────────────────────────────
```

Se puede imprimir en la ticketera o exportar a PDF.

---

## 4. Arquitectura de reportes

Los reportes que involucran muchos datos se generan de forma asíncrona con Bull (Redis):

1. El usuario solicita el reporte → se crea un Job en la cola.
2. El sistema responde de inmediato: "Tu reporte está siendo generado."
3. Al terminar, se guarda el archivo en R2 y se notifica al usuario (badge en UI).
4. El usuario descarga el archivo.

Para reportes pequeños (filtros estrictos, pocos registros), se generan síncronamente.

---

## 5. Endpoints principales

```
GET    /reportes/dashboard/:rol              → datos del dashboard según rol activo
GET    /reportes/ventas/periodo              → reporte de ventas (síncrono si < 1000 registros)
POST   /reportes/generar                     → solicitar reporte grande (asíncrono)
GET    /reportes/mis-reportes                → lista de reportes generados por el usuario
GET    /reportes/descargar/:id               → descargar archivo del reporte
POST   /reportes/corte-caja                  → generar corte de caja e imprimir
```

---

## 6. Plan de implementación

### Días 1-2 — Queries de dashboard
- Queries agregadas para cada rol (con índices optimizados).
- Endpoint de dashboard con caché de 5 minutos (Redis).

### Días 3-4 — Reportes síncronos
- Ventas por período.
- Estado de cuenta.
- Inventario valuado.
- Generación Excel con `exceljs`.
- Generación PDF con `puppeteer` (renderiza HTML → PDF en el servidor).

### Días 5-6 — Frontend: dashboards
- Dashboard del Super Usuario con gráficas (recharts).
- Dashboard del Admin con KPIs y alertas.
- Dashboard del Encargado con vista de caja.

### Días 7-8 — Corte de caja + reportes grandes + cierre
- Pantalla de corte de caja con impresión térmica.
- Cola de reportes grandes con notificación.
- Pantalla "Mis reportes".
- Revisión final de todas las fases.
- Deploy a producción.

---

## 7. Criterios de aceptación

```
[ ] El dashboard carga en menos de 2 segundos (con caché Redis)
[ ] Cada rol ve solo los datos de su scope
[ ] El Super Usuario puede comparar empresas en una sola pantalla
[ ] Los reportes de ventas exportan a Excel y PDF correctamente
[ ] El corte de caja cuadra con los pagos registrados del día
[ ] El corte de caja se puede imprimir en la ticketera
[ ] Los reportes grandes se generan de forma asíncrona y notifican al terminar
[ ] Los gráficos funcionan en tablet y móvil
[ ] Tests de queries agregadas con datos de prueba representativos
```

---

## 8. Riesgos finales del proyecto

**Rendimiento de queries consolidadas.** Las queries del Super Usuario cruzan múltiples empresas y ubicaciones. Deben estar bien indexadas y cacheadas. Si se vuelven lentas, evaluar vistas materializadas en PostgreSQL.

**Consistencia del inventario.** Después de 8 fases de operación, el inventario puede tener inconsistencias por operaciones offline mal sincronizadas o errores de carga. Diseñar un proceso de "conciliación de inventario" que el Almacenista ejecute mensualmente: conteo físico → ajuste masivo → reporte de diferencias.

**Escalabilidad multi-cliente.** Si en el futuro se vende el sistema a otro grupo empresarial, la instancia actual mezcla los datos del Grupo Metálico EMF con los del nuevo cliente. Solución: levantar una instancia separada por cliente (la infraestructura en Railway/DO lo permite fácilmente con variables de entorno).

---

*Fase 8 de 8 · GrupoMetalicoEMF ERP · v1.0.0*
