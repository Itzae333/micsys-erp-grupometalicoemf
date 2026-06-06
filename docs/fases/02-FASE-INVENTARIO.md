# Fase 2 — Inventario

> Productos · Precios parametrizables · Existencias · Proveedores  
> **Dependencias:** Fase 1 (empresas, ubicaciones, config de columnas)  
> **Duración estimada:** 7–9 días (1 desarrollador)

---

## Objetivo de la fase

Construir el núcleo del inventario: la tabla de productos con precios y existencias parametrizables por empresa/ubicación, el catálogo de proveedores, y la UI que consume el schema de columnas definido en la Fase 1 para renderizar una tabla completamente dinámica.

---

## 1. Schema Prisma — Inventario

```prisma
// ─────────────────────────────────────────
// PRODUCTOS (catálogo maestro)
// ─────────────────────────────────────────

model Producto {
  id          String   @id @default(cuid())
  empresa_id  String
  codigo      String   // código único dentro de la empresa
  activo      Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  // Hasta 5 campos de descripción parametrizables
  // desc_1 = nombre principal (siempre requerido)
  // desc_2..5 = opcionales (código proveedor, descripción técnica, etc.)
  desc_1      String
  desc_2      String?
  desc_3      String?
  desc_4      String?
  desc_5      String?

  empresa       Empresa              @relation(fields: [empresa_id], references: [id])
  inventario    Inventario[]
  proveedores   ProductoProveedor[]
  detalle_ventas DetalleVenta[]
  detalle_entradas DetalleEntrada[]
  detalle_salidas  DetalleSalida[]

  @@unique([empresa_id, codigo])
}

// ─────────────────────────────────────────
// INVENTARIO (existencias + precios por ubicación)
// ─────────────────────────────────────────
// Una fila por producto + ubicación.
// Los campos precio_1..10 y existencia_1..5 son genéricos.
// Su significado lo define ConfigColumnasUbicacion de la Fase 1.

model Inventario {
  id           String    @id @default(cuid())
  producto_id  String
  ubicacion_id String
  empresa_id   String

  // Precios (hasta 10 listas)
  precio_1     Decimal?  @db.Decimal(12, 2)
  precio_2     Decimal?  @db.Decimal(12, 2)
  precio_3     Decimal?  @db.Decimal(12, 2)
  precio_4     Decimal?  @db.Decimal(12, 2)
  precio_5     Decimal?  @db.Decimal(12, 2)
  precio_6     Decimal?  @db.Decimal(12, 2)
  precio_7     Decimal?  @db.Decimal(12, 2)
  precio_8     Decimal?  @db.Decimal(12, 2)
  precio_9     Decimal?  @db.Decimal(12, 2)
  precio_10    Decimal?  @db.Decimal(12, 2)

  // Existencias (hasta 5 tipos)
  existencia_1 Decimal?  @db.Decimal(12, 3)
  existencia_2 Decimal?  @db.Decimal(12, 3)
  existencia_3 Decimal?  @db.Decimal(12, 3)
  existencia_4 Decimal?  @db.Decimal(12, 3)
  existencia_5 Decimal?  @db.Decimal(12, 3)

  // Costo promedio ponderado (para valuación interna)
  costo_promedio Decimal? @db.Decimal(12, 4)

  updated_at   DateTime  @updatedAt

  producto   Producto  @relation(fields: [producto_id], references: [id])
  ubicacion  Ubicacion @relation(fields: [ubicacion_id], references: [id])

  @@unique([producto_id, ubicacion_id])
  @@index([empresa_id, ubicacion_id])
}

// ─────────────────────────────────────────
// PROVEEDORES
// ─────────────────────────────────────────

model Proveedor {
  id          String   @id @default(cuid())
  empresa_id  String
  nombre      String
  razon_social String?
  rfc         String?
  contacto    String?
  telefono    String?
  email       String?
  direccion   String?
  activo      Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  empresa    Empresa             @relation(fields: [empresa_id], references: [id])
  productos  ProductoProveedor[]
  entradas   Entrada[]
  ordenes_compra OrdenCompra[]
}

// Relación N:M entre producto y proveedor
// Un producto puede tener varios proveedores, cada uno con su código y costo
model ProductoProveedor {
  id           String   @id @default(cuid())
  producto_id  String
  proveedor_id String
  codigo_proveedor String?  // cómo llama el proveedor a este producto
  costo        Decimal?  @db.Decimal(12, 4)
  es_principal Boolean   @default(false)
  created_at   DateTime  @default(now())

  producto  Producto  @relation(fields: [producto_id], references: [id])
  proveedor Proveedor @relation(fields: [proveedor_id], references: [id])

  @@unique([producto_id, proveedor_id])
}

// ─────────────────────────────────────────
// MOVIMIENTOS DE INVENTARIO (bitácora)
// ─────────────────────────────────────────
// Registro de cada cambio en existencia_1..5 para auditoría y reportes.

model MovimientoInventario {
  id             String   @id @default(cuid())
  producto_id    String
  ubicacion_id   String
  tipo           TipoMovimiento
  numero_existencia Int  // 1..5 — qué columna de existencia se modificó
  cantidad       Decimal  @db.Decimal(12, 3)  // positivo = entrada, negativo = salida
  cantidad_antes Decimal  @db.Decimal(12, 3)
  cantidad_despues Decimal @db.Decimal(12, 3)
  referencia_tipo String?  // "VENTA" | "ENTRADA" | "SALIDA" | "AJUSTE"
  referencia_id  String?   // id de la venta, entrada o salida que lo generó
  usuario_id     String?
  notas          String?
  created_at     DateTime @default(now())
}

enum TipoMovimiento {
  ENTRADA_PROVEEDOR
  ENTRADA_FABRICA
  ENTRADA_EMPRESA   // transferencia inter-empresa
  SALIDA_VENTA
  SALIDA_FABRICA
  SALIDA_EMPRESA
  AJUSTE_POSITIVO
  AJUSTE_NEGATIVO
}
```

---

## 2. Módulos NestJS

### 2.1 `ProductosModule`

**Endpoints:**
```
GET    /productos                          → lista paginada con filtros (empresa, búsqueda por desc_1..5, código)
POST   /productos                          → crear producto
GET    /productos/:id                      → detalle con inventario por ubicación activa
PATCH  /productos/:id                      → editar descripciones, código
DELETE /productos/:id                      → desactivar
POST   /productos/importar                 → importar desde CSV/Excel (bulk)
```

**Búsqueda:** el endpoint de lista debe buscar en todos los campos desc_1..5 y en el código con un solo parámetro `q`. Los campos que se buscan dependen de cuáles están activos en la config de columnas de la ubicación activa.

### 2.2 `InventarioModule`

**Endpoints:**
```
GET    /inventario                         → tabla de inventario para la ubicación activa
                                             Devuelve solo columnas activas según ConfigColumnasUbicacion
PATCH  /inventario/:productoId/precios     → actualizar precios (Admin/Encargado con permiso)
PATCH  /inventario/:productoId/existencias → ajuste manual de existencias (Almacenista)
GET    /inventario/:productoId/movimientos → historial de movimientos del producto
```

**Respuesta del GET /inventario** (ejemplo con 4 precios y 2 existencias activos):
```json
{
  "schema": { ... },  // columnas activas (de ConfigColumnasUbicacion)
  "productos": [
    {
      "id": "...",
      "codigo": "ANA-001",
      "descripciones": {
        "1": "Anaquel 5 niveles",
        "2": "ANA5N-GRI-180"
      },
      "precios": {
        "1": 1850.00,
        "2": 1650.00,
        "3": 1950.00,
        "4": 1750.00
      },
      "existencias": {
        "1": 24,
        "2": 3
      }
    }
  ]
}
```

El frontend traduce `precios.1` → "Mayoreo" usando el schema. Nunca se envían los números de columna al usuario final — la UI siempre muestra el label.

### 2.3 `ProveedoresModule`

**Endpoints:**
```
GET    /proveedores                        → lista
POST   /proveedores                        → crear
GET    /proveedores/:id                    → detalle con productos asociados
PATCH  /proveedores/:id                    → editar
DELETE /proveedores/:id                    → desactivar
POST   /proveedores/:id/productos          → asociar producto con código y costo del proveedor
DELETE /proveedores/:id/productos/:prodId  → desasociar
```

---

## 3. UI — Pantalla de inventario

Esta es la pantalla más usada del sistema. Debe ser rápida, clara y funcionar bien en tablet.

### 3.1 Tabla dinámica de inventario

La tabla se construye en runtime a partir del schema de columnas. El componente `<TablaInventario>` recibe el schema y los datos y renderiza solo las columnas activas.

Columnas siempre visibles:
- Código del producto
- Descripción principal (desc_1)

Columnas condicionales (según schema):
- desc_2..5 (si están activas)
- precio_1..10 (con su label)
- existencia_1..5 (con su label)
- Acciones (editar precios, ver movimientos)

**Comportamiento importante:** en móvil/tablet, la tabla colapsa a una tarjeta por producto con las columnas más importantes. El usuario puede expandir para ver el resto.

### 3.2 Edición de precios inline

Al hacer tap en un precio, se vuelve un input editable en la misma celda. Al presionar Enter o hacer tap fuera, guarda con PATCH. Muestra un spinner pequeño mientras guarda y un check verde al confirmar.

### 3.3 Búsqueda y filtros

- Búsqueda por texto (busca en todas las descripciones activas y código).
- Filtro por existencia baja (existencia_1 < umbral configurable, default 5).
- Filtro por sin existencia (existencia_1 = 0).

### 3.4 Importación masiva

Botón "Importar CSV/Excel" que abre un modal con:
1. Descarga de plantilla (generada dinámicamente con las columnas activas de esa ubicación).
2. Upload del archivo.
3. Preview de las primeras 10 filas con validaciones marcadas en rojo.
4. Botón "Confirmar importación".

---

## 4. Transferencia de precios entre ubicaciones

Una necesidad real: la Matriz tiene los precios maestros, y quiere copiarlos a un PV (posiblemente con un ajuste porcentual).

**Endpoint:**
```
POST /inventario/transferir-precios
Body: {
  origen_ubicacion_id: string,
  destino_ubicacion_id: string,
  columnas_precio: [1, 2, 3],      // qué columnas copiar
  factor_ajuste: 1.05              // opcional: sube 5% al copiar
}
```

Solo el Admin puede ejecutar esta operación.

---

## 5. Plan de implementación

### Día 1 — Schema y migraciones
- Agregar modelos `Producto`, `Inventario`, `Proveedor`, `ProductoProveedor`, `MovimientoInventario` al schema.
- `prisma migrate dev --name inventario`.
- Crear seeds de productos de prueba con distintas configs de columnas.

### Día 2 — ProductosModule
- CRUD completo con búsqueda multi-campo.
- Tests unitarios del servicio.

### Día 3 — InventarioModule
- GET /inventario con columnas dinámicas según schema.
- PATCH precios y existencias con registro automático en `MovimientoInventario`.
- Tests.

### Día 4 — ProveedoresModule + ProductoProveedor
- CRUD de proveedores.
- Asociación producto-proveedor con código y costo.

### Día 5 — Importación masiva
- Endpoint de importación con validación.
- Generación de plantilla dinámica.
- Manejo de errores por fila.

### Día 6 — Frontend: tabla de inventario
- Componente `<TablaInventario>` con columnas dinámicas.
- Edición inline de precios.
- Búsqueda y filtros.

### Día 7 — Frontend: productos y proveedores
- Pantalla crear/editar producto.
- Pantalla lista y detalle de proveedores.
- Modal de importación masiva.

### Día 8 — Cache offline del inventario
- Al cargar el inventario, guardarlo en IndexedDB (Dexie).
- Service Worker sirve el inventario cacheado si no hay conexión.
- Banner "Modo offline — datos al [fecha/hora]" cuando se sirve desde cache.

### Día 9 — Testing y cierre
- E2E: crear producto → asignar proveedor → ajustar existencia → ver movimiento.
- Revisión de criterios de aceptación.
- Deploy a staging.

---

## 6. Criterios de aceptación

```
[ ] La tabla de inventario muestra solo las columnas activas en la ubicación
[ ] Los labels de columna coinciden con la configuración del Admin
[ ] Se puede crear un producto con hasta 5 descripciones
[ ] Se puede editar un precio haciendo tap/click en la celda (inline)
[ ] El cambio de precio genera un registro en MovimientoInventario
[ ] Se puede importar productos desde CSV con la plantilla dinámica
[ ] El importador valida y marca errores por fila sin cancelar las filas válidas
[ ] La búsqueda funciona sobre todos los campos de descripción activos
[ ] El inventario se cachea offline y muestra banner con fecha del cache
[ ] Se puede crear un proveedor y asociarlo a uno o más productos
[ ] La transferencia de precios entre ubicaciones funciona (solo Admin)
[ ] Tests con cobertura >70%
[ ] Swagger documentado
```

---

## 7. Riesgos de la fase

**Rendimiento de la tabla con muchos productos.** Si una empresa tiene 5,000 productos, la tabla puede ser lenta. Implementar paginación server-side desde el principio (no cargar todos en una sola query). TanStack Table con virtualización para el lado cliente.

**El cache offline puede quedar desactualizado.** Si el Encargado del turno de noche edita precios, el Vendedor de mañana podría ver precios viejos si abrió la app sin conexión. El banner de "Modo offline — datos al [fecha]" es crítico para que el usuario sepa que puede haber discrepancias.

**La importación masiva puede romper existencias.** Definir claramente si importar sobreescribe existencias o las acumula. Recomendación: la plantilla tiene una columna "modo" con opciones REEMPLAZAR o SUMAR. Default: REEMPLAZAR.

---

*Fase 2 de 8 · GrupoMetalicoEMF ERP · v1.0.0*
