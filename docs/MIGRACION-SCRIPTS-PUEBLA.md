# Scripts de exportación — Puebla (legado) → ERP GrupoMetalicoEMF

Empresa destino: **Metálicos Lyeva**. Origen: sistema legado independiente "Puebla" (esquema distinto y más antiguo que MetalAlpha, ver `docs/MIGRACION-SCRIPTS.md`).

Ejecuta estas queries en la base de datos legada de Puebla (MySQL/MariaDB) para generar los CSV que se suben en **Configuración → Migración**.

> **Alcance de esta migración:** clientes, inventario (productos) y ventas históricas.

> **Puebla es una sola sucursal.** El inventario/clientes no requieren columna `sucursal` (se suben posicionado en "Matriz Metálicos Lyeva"). Para `ventas_detalle.csv` sí se incluye la columna `sucursal` con el literal fijo `'puebla'` — a diferencia de MetalAlpha (`virgen`/`santa`/`tecamachalco`/`tepeaca`), aquí solo hay un valor posible.

> **Antes de subir `inventario.csv`**, da de alta en **Configuración → Columnas** (para Metálicos Lyeva → Matriz) los precios "Crédito" (slot 3) y "Proveedor" (slot 4), además de los ya existentes "Público" (1) y "Mayoreo" (2). El precio "Proveedor" no existe en el legado — se importa en `0.00` y se captura manualmente después.

---

## 1. `inventario.csv`

Mapeo de precios del legado (`producto`) a los slots del ERP:

| Slot ERP | Columna legado `producto` |
|---|---|
| precio1 — Público | `precio_puebla` |
| precio2 — Mayoreo | `precio_mayoreo` |
| precio3 — Crédito | `precio_credito` |
| precio4 — Proveedor | *(sin equivalente, se exporta `0.00`)* |

```sql
SELECT
  inv.id_inventario                                            AS id,
  COALESCE(p.nombre, '')                                       AS descripcion1,
  COALESCE(p.tipo, '')                                         AS descripcion2,
  COALESCE(p.medidas, '')                                      AS descripcion3,
  COALESCE(pi.descripcion, '')                                 AS descripcion4,
  COALESCE(c.descripcion, '')                                  AS descripcion5,
  COALESCE(inv.existencias, 0)                                 AS existencias1,
  0                                                             AS existencias2,
  0                                                             AS existencias3,
  COALESCE(p.precio_puebla, 0.00)                              AS precio1,
  COALESCE(p.precio_mayoreo, 0.00)                             AS precio2,
  COALESCE(p.precio_credito, 0.00)                             AS precio3,
  0.00                                                          AS precio4,
  0.00                                                          AS precio5
FROM inventario inv
JOIN producto p       ON p.id_producto = inv.id_producto
LEFT JOIN pintura pi  ON pi.id_pintura = p.id_pintura
LEFT JOIN color c     ON c.id_color = inv.id_color
ORDER BY inv.id_inventario;
```

> Si `inventario.id_fabrica` en esta base llegara a tener más de una fábrica registrada, agrega `WHERE inv.id_fabrica = <id>` para aislar solo la sucursal Puebla.

**Formato del CSV:**
```
id,descripcion1,descripcion2,descripcion3,descripcion4,descripcion5,existencias1,existencias2,existencias3,precio1,precio2,precio3,precio4,precio5
1,Perfil PTR,2x2,3mm,Horneada,Azul,40,0,0,25.00,22.00,20.00,0.00,0.00
```

---

## 2. `clientes.csv`

Solo dos de los 12 `tipo_cuenta` del legado tienen clientes reales: `PUEMA` (Puebla Mayoreo) y `PUEPU` (Puebla Publico). El resto (Publico, Mayoreo, Credito, No Credito, Puebla virgen, Santa Maria, Perico, Tecamachalco, Tepeaca) no se usa y se deja sin `precio_num`.

| tipo_cuenta.identificador | precio_num ERP | Lista de precio |
|---|---|---|
| `PUEPU` | 1 | Público |
| `PUEMA` | 2 | Mayoreo |
| Cualquier otro | *(vacío)* | Sin tipo asignado |

```sql
SELECT
  cl.id_cliente                                                AS id,
  COALESCE(cl.nombre, '')                                      AS nombre,
  COALESCE(cl.apellido, '')                                    AS apellidoPaterno,
  ''                                                            AS apellidoMaterno,
  COALESCE(cl.telefono, '')                                    AS telefono,
  COALESCE(cl.correo, '')                                      AS correo,
  0.00                                                          AS saldo,
  CASE tc.identificador
    WHEN 'PUEPU' THEN 1
    WHEN 'PUEMA' THEN 2
    ELSE NULL
  END                                                           AS precio_num
FROM cliente cl
LEFT JOIN tipo_cuenta tc ON tc.id_tipo_cuenta = cl.id_tipo_cuenta
ORDER BY cl.id_cliente;
```

> `cliente` (Puebla) no tiene tabla de cuenta/saldo — siempre se exporta `saldo = 0.00`.
> Solo existe una columna `apellido` (no paterno/materno por separado) — se coloca completa en `apellidoPaterno`, `apellidoMaterno` queda vacío.

**Formato del CSV:**
```
id,nombre,apellidoPaterno,apellidoMaterno,telefono,correo,saldo,precio_num
1,Juan,Pérez López,,555-1234,juan@mail.com,0.00,2
2,María,González,,555-5678,,0.00,1
3,Carlos,Ruiz,,555-9999,,0.00,
```

---

## 3. `ventas_detalle.csv`

Exporta ventas históricas con sus líneas de carrito, denormalizado (una fila por artículo vendido) — igual que las fuentes ya migradas. El ERP agrupa por `venta_id + sucursal` al importar, y `sucursal` es siempre el literal `'puebla'`.

```sql
SELECT
  v.id_venta                                                          AS venta_id,
  CONCAT(v.fecha_venta, ' ', COALESCE(v.hora_venta, '00:00:00'))      AS fechaHoraVenta,
  v.total,
  COALESCE(v.recibido, 0.00)                                          AS recibido,
  COALESCE(v.cambio, 0.00)                                            AS cambio,
  COALESCE(v.restan, 0.00)                                            AS restan,
  COALESCE(ev.descripcion, 'Pagada')                                  AS estatusVenta,
  COALESCE(tp.descripcion, 'Efectivo')                                AS tipoPago,
  COALESCE(v.nota, '')                                                AS nota,
  COALESCE(v.incidencia, '')                                          AS incidencia,
  TRIM(CONCAT(COALESCE(cl.nombre,''), ' ', COALESCE(cl.apellido,''))) AS cliente_nombre,
  COALESCE(ca.cantidad, 0)                                            AS cantidad,
  COALESCE(ca.precio_neto, 0.00)                                      AS precioNeto,
  COALESCE(ca.total, 0.00)                                            AS linea_total,
  COALESCE(p.nombre, '')                                              AS descripcion1,
  COALESCE(p.tipo, '')                                                AS descripcion2,
  COALESCE(p.medidas, '')                                             AS descripcion3,
  COALESCE(pi.descripcion, '')                                        AS descripcion4,
  COALESCE(co.descripcion, '')                                        AS descripcion5,
  'puebla'                                                            AS sucursal
FROM venta v
LEFT JOIN cliente cl        ON cl.id_cliente = v.id_cliente
JOIN  carrito ca             ON ca.id_venta = v.id_venta
JOIN  inventario inv         ON inv.id_inventario = ca.id_inventario
JOIN  producto p              ON p.id_producto = inv.id_producto
LEFT JOIN pintura pi          ON pi.id_pintura = p.id_pintura
LEFT JOIN color co            ON co.id_color = inv.id_color
LEFT JOIN estatus_venta ev    ON ev.id_estatus_venta = v.id_estatus_venta
LEFT JOIN ticket tk           ON tk.id_venta = v.id_venta AND tk.id_estatus_ticket = 1  -- 'Exito'
LEFT JOIN tipo_pago tp        ON tp.id_tipo_pago = tk.id_tipo_pago
ORDER BY v.id_venta;
```

Notas:
- `fecha_venta`/`hora_venta` están separados en Puebla (a diferencia de MetalAlpha, que ya trae `fechaHoraVenta` combinado) — se concatenan con `CONCAT`.
- El tipo de pago sale del `ticket` con `id_estatus_ticket = 1` ('Exito'); si una venta llegara a tener más de un ticket exitoso (no debería en la práctica), la query duplicaría filas — vale la pena correr un `COUNT` de verificación antes de exportar en producción.
- La tabla `multi_pago` (pagos divididos) no se migra — `ventas_detalle.csv` solo admite un `tipoPago` por venta, igual que las fuentes ya migradas.
- Igual que en clientes, `cliente.apellido` es una sola columna — se concatena completa en `cliente_nombre`.

**Formato del CSV:**
```
venta_id,fechaHoraVenta,total,recibido,cambio,restan,estatusVenta,tipoPago,nota,incidencia,cliente_nombre,cantidad,precioNeto,linea_total,descripcion1,descripcion2,descripcion3,descripcion4,descripcion5,sucursal
1,2024-03-15 10:30:00,500.00,500.00,0.00,0.00,Pagada,Efectivo,,,Juan Pérez,2,25.00,50.00,Perfil PTR,2x2,3mm,Horneada,Azul,puebla
```

---

## Cómo exportar a CSV

Igual que en `docs/MIGRACION-SCRIPTS.md`: desde MySQL Workbench (exportar resultados a CSV con encabezados) o por línea de comandos:

```bash
mysql -u usuario -p nombre_base -e "QUERY_AQUI" | sed 's/\t/,/g' > archivo.csv
```
