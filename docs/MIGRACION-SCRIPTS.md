# Scripts de exportación — MetalAlpha → ERP GrupoMetalicoEMF

Ejecuta estas queries en el sistema legado MetalAlpha (MySQL/MariaDB) para generar los archivos CSV que se suben al panel de **Configuración → Migración** del nuevo ERP.

> **Cómo funciona la migración por ubicación:**
> - **Inventario y Clientes:** cada CSV se sube mientras el admin está posicionado en la ubicación destino. No se mezclan datos de distintas ubicaciones en un mismo archivo — exporta un CSV por fuente y súbelo en la ubicación correspondiente.
> - **Ventas históricas:** se consolidan a nivel empresa. El campo `sucursal` identifica el origen histórico y solo lo ve el admin.

> **Diferencias técnicas entre fuentes:**
> - `inventario_virgen`: color y material como FKs a catálogos separados, solo tiene `existencias1`.
> - `inventario_punto_venta`: `descripcion4` y `descripcion5` como texto directo, tiene `existencias1..3`.
> - `cliente_punto_venta`: usa FK `cuentaClientePuntoVenta_id` (no `cuenta_id`).

---

## 1. `inventario.csv`

Genera **un archivo por fuente** y súbelo en la ubicación correspondiente. No se necesita columna `sucursal`.

### Fuente: `inventario_virgen`

Color y material se resuelven vía JOIN. Solo tiene `existencias1`; las demás se exportan como `0`.

```sql
SELECT
  i.id,
  COALESCE(i.descripcion1, '')  AS descripcion1,
  COALESCE(i.descripcion2, '')  AS descripcion2,
  COALESCE(i.descripcion3, '')  AS descripcion3,
  COALESCE(c.descripcion, '')   AS descripcion4,
  COALESCE(m.descripcion, '')   AS descripcion5,
  COALESCE(i.existencias1, 0)   AS existencias1,
  0                             AS existencias2,
  0                             AS existencias3,
  COALESCE(i.precio1, 0.00)     AS precio1,
  COALESCE(i.precio2, 0.00)     AS precio2,
  COALESCE(i.precio3, 0.00)     AS precio3,
  COALESCE(i.precio4, 0.00)     AS precio4,
  COALESCE(i.precio5, 0.00)     AS precio5
FROM inventario_virgen i
LEFT JOIN color_virgen    c ON c.id = i.color_id
LEFT JOIN material_virgen m ON m.id = i.material_id
ORDER BY i.id;
```

### Fuente: `inventario_punto_venta`

`descripcion4` y `descripcion5` son columnas directas. Sin JOINs de color/material.

```sql
SELECT
  i.id,
  COALESCE(i.descripcion1, '')  AS descripcion1,
  COALESCE(i.descripcion2, '')  AS descripcion2,
  COALESCE(i.descripcion3, '')  AS descripcion3,
  COALESCE(i.descripcion4, '')  AS descripcion4,
  COALESCE(i.descripcion5, '')  AS descripcion5,
  0   AS existencias1,
  0   AS existencias2,
  0   AS existencias3,
  COALESCE(i.precio2, 0.00)     AS precio1,
  COALESCE(i.precio1, 0.00)     AS precio2,
  COALESCE(i.precio3, 0.00)     AS precio3,
  COALESCE(i.precio4, 0.00)     AS precio4
FROM inventario_punto_venta i
ORDER BY i.id;
```

**Formato del CSV:**
```
id,descripcion1,descripcion2,descripcion3,descripcion4,descripcion5,existencias1,existencias2,existencias3,precio1,precio2,precio3,precio4,precio5
1,Tubo Cuadrado,1x1,3mm,Negro,Acero,100,0,0,25.00,22.00,20.00,18.00,15.00
2,Lámina Lisa,2x4,1mm,,,50,20,5,120.00,110.00,100.00,90.00,80.00
```

---

## 2. `clientes.csv`

Genera **un archivo por fuente** y súbelo en la ubicación correspondiente. No se necesita columna `sucursal`.

El campo `tipoCliente` del legado se convierte a `precio_num` del ERP:

| tipoCliente legacy | precio_num ERP | Lista de precio |
|---|---|---|
| `MENUDEO` | 1 | Público |
| `MAYOREO` | 2 | Mayoreo |
| `CREDITO` | 3 | Crédito |
| `NO_CREDITO` | 4 | No crédito |
| `PUNTO_VENTA` | 5 | Punto de venta |
| `PUEBLA`, `LOCAL`, `FABRICA` | *(vacío)* | Sin tipo asignado |

### Fuente: `cliente_virgen`

```sql
SELECT
  cl.id,
  COALESCE(cl.nombre, '')          AS nombre,
  COALESCE(cl.apellidoPaterno, '') AS apellidoPaterno,
  COALESCE(cl.apellidoMaterno, '') AS apellidoMaterno,
  COALESCE(cl.telefono, '')        AS telefono,
  COALESCE(cl.correo, '')          AS correo,
  0         AS saldo,
  CASE cl.tipoCliente
    WHEN 'MENUDEO'     THEN 1
    WHEN 'MAYOREO'     THEN 2
    WHEN 'CREDITO'     THEN 3
    WHEN 'NO_CREDITO'  THEN 4
    WHEN 'PUNTO_VENTA' THEN 5
    ELSE NULL
  END                              AS precio_num
FROM cliente_virgen cl
LEFT JOIN cuenta_cliente_virgen cu ON cu.id = cl.cuenta_id
ORDER BY cl.id;
```

### Fuente: `cliente_punto_venta`

> La FK es `cuentaClientePuntoVenta_id` (no `cuenta_id`).

```sql
SELECT
  cl.id,
  COALESCE(cl.nombre, '')          AS nombre,
  COALESCE(cl.apellidoPaterno, '') AS apellidoPaterno,
  COALESCE(cl.apellidoMaterno, '') AS apellidoMaterno,
  COALESCE(cl.telefono, '')        AS telefono,
  COALESCE(cl.correo, '')          AS correo,
  COALESCE(cu.saldo, 0.00)         AS saldo,
  CASE cl.tipoCliente
    WHEN 'MENUDEO'     THEN 1
    WHEN 'MAYOREO'     THEN 2
    WHEN 'CREDITO'     THEN 3
    WHEN 'NO_CREDITO'  THEN 4
    WHEN 'PUNTO_VENTA' THEN 5
    ELSE NULL
  END                              AS precio_num
FROM cliente_punto_venta cl
LEFT JOIN cuenta_cliente_punto_venta cu ON cu.id = cl.cuentaClientePuntoVenta_id
ORDER BY cl.id;
```

**Formato esperado del CSV:**
```
id,nombre,apellidoPaterno,apellidoMaterno,telefono,correo,saldo,precio_num
1,Juan,Pérez,García,555-1234,juan@mail.com,1500.00,2
2,María,López,,555-5678,,0.00,1
3,Carlos,Ruiz,,555-9999,,0.00,
```

---

## 3. `ventas_detalle.csv`

Exporta ventas históricas con sus líneas de carrito en un solo CSV denormalizado (una fila por artículo vendido).

> Cada venta aparece repetida tantas veces como artículos tenga. El ERP agrupa por `venta_id + sucursal` al importar.

### Sucursales a migrar

| Sucursal | Valor `sucursal` en CSV | Base de datos MetalAlpha | Tablas |
|---|---|---|---|
| La Virgen | `virgen` | `metalpha_virgen` (o similar) | `*_virgen` — color/material vía JOIN |
| Santa | `santa` | `metalpha_santa` (o similar) | `*_punto_venta` — `descripcion4`/`5` directo |
| Tecamachalco | `tecamachalco` | `metalpha_tecamachalco` (o similar) | `*_punto_venta` — `descripcion4`/`5` directo |
| Tepeaca | `tepeaca` | `metalpha_tepeaca` (o similar) | `*_punto_venta` — `descripcion4`/`5` directo |

> Cada sucursal vive en su propia base de datos MetalAlpha con el mismo esquema.  
> **No es posible hacer un UNION ALL** entre ellas en una sola query — se exporta un CSV por sucursal conectándose a cada DB por separado, y se suben los 4 CSVs al ERP uno por uno.  
> El ERP detecta duplicados por `sucursal + venta_id`, así que puedes re-importar sin miedo.

---

### Script para La Virgen (color/material vía JOIN)

Conéctate a la base de datos de **La Virgen** y ejecuta:

```sql
SELECT
  v.id                                                         AS venta_id,
  v.fechaHoraVenta,
  v.total,
  COALESCE(v.recibido,   0.00)                                AS recibido,
  COALESCE(v.cambio,     0.00)                                AS cambio,
  COALESCE(v.restan,     0.00)                                AS restan,
  COALESCE(v.estatusVenta, 'PAGADA')                          AS estatusVenta,
  COALESCE(v.tipoPago,   'EFECTIVO')                          AS tipoPago,
  COALESCE(v.nota,       '')                                  AS nota,
  COALESCE(v.incidencia, '')                                  AS incidencia,
  TRIM(CONCAT(
    COALESCE(cl.nombre, ''),           ' ',
    COALESCE(cl.apellidoPaterno, ''),  ' ',
    COALESCE(cl.apellidoMaterno, '')
  ))                                                           AS cliente_nombre,
  COALESCE(cv.cantidad,   0)                                  AS cantidad,
  COALESCE(cv.precioNeto, 0.00)                               AS precioNeto,
  COALESCE(cv.total,      0.00)                               AS linea_total,
  COALESCE(i.descripcion1, '')                                AS descripcion1,
  COALESCE(i.descripcion2, '')                                AS descripcion2,
  COALESCE(i.descripcion3, '')                                AS descripcion3,
  COALESCE(c.descripcion,  '')                                AS descripcion4,
  COALESCE(m.descripcion,  '')                                AS descripcion5,
  'virgen'                                                     AS sucursal
FROM venta_virgen v
LEFT JOIN cliente_virgen cl       ON cl.id = v.cliente_id
JOIN  carrito_venta_virgen cv     ON cv.venta_id = v.id
JOIN  inventario_virgen i         ON i.id = cv.inventario_id
LEFT JOIN color_virgen    c       ON c.id = i.color_id
LEFT JOIN material_virgen m       ON m.id = i.material_id
ORDER BY v.id;
```

---

### Script para Santa / Tecamachalco / Tepeaca (`descripcion4`/`5` directo)

El esquema de tablas es el mismo en las 3 DBs. Conéctate a cada una y ejecuta este script **cambiando solo el literal de `sucursal`**:

```sql
-- Cambia 'santa' por 'tecamachalco' o 'tepeaca' según la DB a la que estés conectado
SELECT
  v.id                                                         AS venta_id,
  v.fechaHoraVenta,
  v.total,
  COALESCE(v.recibido,   0.00)                                AS recibido,
  COALESCE(v.cambio,     0.00)                                AS cambio,
  COALESCE(v.restan,     0.00)                                AS restan,
  COALESCE(v.estatusVenta, 'PAGADA')                          AS estatusVenta,
  COALESCE(v.tipoPago,   'EFECTIVO')                          AS tipoPago,
  COALESCE(v.nota,       '')                                  AS nota,
  COALESCE(v.incidencia, '')                                  AS incidencia,
  TRIM(CONCAT(
    COALESCE(cl.nombre, ''),           ' ',
    COALESCE(cl.apellidoPaterno, ''),  ' ',
    COALESCE(cl.apellidoMaterno, '')
  ))                                                           AS cliente_nombre,
  COALESCE(cv.cantidad,   0)                                  AS cantidad,
  COALESCE(cv.precioNeto, 0.00)                               AS precioNeto,
  COALESCE(cv.total,      0.00)                               AS linea_total,
  COALESCE(i.descripcion1, '')                                AS descripcion1,
  COALESCE(i.descripcion2, '')                                AS descripcion2,
  COALESCE(i.descripcion3, '')                                AS descripcion3,
  COALESCE(i.descripcion4, '')                                AS descripcion4,
  COALESCE(i.descripcion5, '')                                AS descripcion5,
  'santa'                                                      AS sucursal  -- ← cambiar aquí
FROM venta_punto_venta v
LEFT JOIN cliente_punto_venta cl         ON cl.id = v.cliente_id
JOIN  carrito_venta_punto_venta cv       ON cv.venta_id = v.id
JOIN  inventario_punto_venta i           ON i.id = cv.inventario_id
ORDER BY v.id;
```

| DB conectada | Cambiar literal a |
|---|---|
| metalpha_santa | `'santa'` |
| metalpha_tecamachalco | `'tecamachalco'` |
| metalpha_tepeaca | `'tepeaca'` |

**Formato esperado del CSV:**
```
venta_id,fechaHoraVenta,total,recibido,cambio,restan,estatusVenta,tipoPago,nota,incidencia,cliente_nombre,cantidad,precioNeto,linea_total,descripcion1,descripcion2,descripcion3,descripcion4,descripcion5,sucursal
1,2024-03-15 10:30:00,500.00,500.00,0.00,0.00,PAGADA,EFECTIVO,,,Juan Pérez,2,25.00,50.00,Tubo Cuadrado,1x1,3mm,Negro,Acero,virgen
2,2024-04-01 09:00:00,300.00,300.00,0.00,0.00,PAGADA,TARJETA,,,María López,3,100.00,300.00,Lámina,2x4,1mm,Galvanizada,,santa
```

---

## Cómo exportar a CSV desde MySQL Workbench

1. Abre MySQL Workbench → conecta a la base de datos
2. Ejecuta la query
3. En el panel de resultados: clic en el ícono de exportar (disquete) → **Export to CSV**
4. Asegúrate de que el separador sea `,` (coma) y que incluya encabezados

## Cómo exportar desde línea de comandos

```bash
mysql -u usuario -p nombre_base -e "QUERY_AQUI" | sed 's/\t/,/g' > archivo.csv
```
