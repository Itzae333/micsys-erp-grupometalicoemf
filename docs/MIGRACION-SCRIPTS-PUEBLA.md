# Scripts de exportación — Puebla (legado) → ERP GrupoMetalicoEMF

Empresa destino: **Metálicos Lyeva**. Origen: sistema legado independiente "Puebla" (esquema distinto y más antiguo que MetalAlpha, ver `docs/MIGRACION-SCRIPTS.md`).

Ejecuta estas queries en la base de datos legada de Puebla (MySQL/MariaDB) para generar los CSV que se suben en **Configuración → Migración**.

> **Alcance de esta migración:** solo **clientes** e **inventario (productos)**. Las ventas históricas de Puebla no se migran.

> **Puebla es una sola sucursal.** No genera un archivo por sucursal ni requiere columna `sucursal` — a diferencia de MetalAlpha (`virgen`/`santa`/`tecamachalco`/`tepeaca`), aquí todo se sube en una sola ubicación: "Matriz Metálicos Lyeva".

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

## Cómo exportar a CSV

Igual que en `docs/MIGRACION-SCRIPTS.md`: desde MySQL Workbench (exportar resultados a CSV con encabezados) o por línea de comandos:

```bash
mysql -u usuario -p nombre_base -e "QUERY_AQUI" | sed 's/\t/,/g' > archivo.csv
```
