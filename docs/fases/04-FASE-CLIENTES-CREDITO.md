# Fase 4 — Clientes y Crédito

> Clientes · Cuentas · Cargos · Abonos · Estado de cuenta  
> **Dependencias:** Fases 1, 2 y 3  
> **Duración estimada:** 6–8 días (1 desarrollador)

---

## Objetivo de la fase

Implementar el módulo de clientes con cuentas múltiples, manejo de crédito (cargos por ventas no pagadas y abonos), y el estado de cuenta por cliente. Una cuenta define qué lista de precios del inventario ve ese cliente.

---

## 1. Schema Prisma — Clientes y Crédito

```prisma
// ─────────────────────────────────────────
// CLIENTES
// ─────────────────────────────────────────

model Cliente {
  id           String   @id @default(cuid())
  empresa_id   String
  ubicacion_id String   // ubicación donde está registrado
  nombre       String
  razon_social String?
  rfc          String?
  telefono     String?
  email        String?
  direccion    String?
  activo       Boolean  @default(true)
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  empresa   Empresa   @relation(fields: [empresa_id], references: [id])
  ubicacion Ubicacion @relation(fields: [ubicacion_id], references: [id])
  cuentas   CuentaCliente[]
  ventas    Venta[]
}

// ─────────────────────────────────────────
// CUENTAS DEL CLIENTE
// ─────────────────────────────────────────
// Un cliente puede tener 1..N cuentas.
// Cada cuenta define:
//   - Qué columna de precio del inventario aplica
//   - Si tiene crédito y cuál es su límite
//   - El saldo actual (suma de cargos - suma de abonos)

model CuentaCliente {
  id              String   @id @default(cuid())
  cliente_id      String
  empresa_id      String
  nombre          String   // ej. "Cuenta Mayoreo", "Crédito 30 días", "Cuenta Mostrador"
  numero_precio   Int      // qué columna de precio ve (1..10 según ConfigColumnasUbicacion)
  tiene_credito   Boolean  @default(false)
  limite_credito  Decimal  @db.Decimal(12, 2) @default(0)
  saldo           Decimal  @db.Decimal(12, 2) @default(0)  // negativo = debe
  activa          Boolean  @default(true)
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  cliente  Cliente        @relation(fields: [cliente_id], references: [id])
  ventas   Venta[]
  cargos   CargoCredito[]
  abonos   AbonoCredito[]
}

// ─────────────────────────────────────────
// CARGOS DE CRÉDITO
// ─────────────────────────────────────────
// Se genera automáticamente cuando una venta queda A_CREDITO.

model CargoCredito {
  id           String   @id @default(cuid())
  cuenta_id    String
  venta_id     String
  monto        Decimal  @db.Decimal(12, 2)  // siempre positivo (representa deuda)
  saldo_cargo  Decimal  @db.Decimal(12, 2)  // cuánto queda por abonar de este cargo
  concepto     String?
  created_at   DateTime @default(now())

  cuenta CuentaCliente @relation(fields: [cuenta_id], references: [id])
  venta  Venta         @relation(fields: [venta_id], references: [id])
  abonos AbonoDetalle[]
}

// ─────────────────────────────────────────
// ABONOS
// ─────────────────────────────────────────
// Un abono puede cubrir uno o más cargos (FIFO: se aplica al más antiguo primero).

model AbonoCredito {
  id         String     @id @default(cuid())
  cuenta_id  String
  monto      Decimal    @db.Decimal(12, 2)
  metodo     MetodoPago
  referencia String?
  notas      String?
  usuario_id String
  created_at DateTime   @default(now())

  cuenta   CuentaCliente  @relation(fields: [cuenta_id], references: [id])
  detalles AbonoDetalle[]
}

// Detalle de qué cargo pagó cada abono
model AbonoDetalle {
  id        String  @id @default(cuid())
  abono_id  String
  cargo_id  String
  monto     Decimal @db.Decimal(12, 2)

  abono AbonoCredito @relation(fields: [abono_id], references: [id])
  cargo CargoCredito @relation(fields: [cargo_id], references: [id])
}
```

---

## 2. Módulos NestJS

### 2.1 `ClientesModule`

```
GET    /clientes                        → lista con filtros (nombre, RFC, tiene crédito)
POST   /clientes                        → crear cliente
GET    /clientes/:id                    → detalle con cuentas
PATCH  /clientes/:id                    → editar
DELETE /clientes/:id                    → desactivar
```

### 2.2 `CuentasClienteModule`

```
GET    /clientes/:clienteId/cuentas           → lista de cuentas
POST   /clientes/:clienteId/cuentas           → crear cuenta
PATCH  /clientes/:clienteId/cuentas/:id       → editar (límite, precio, nombre)
GET    /clientes/:clienteId/cuentas/:id/estado-cuenta  → estado de cuenta con cargos y abonos
POST   /clientes/:clienteId/cuentas/:id/abonos         → registrar abono
GET    /clientes/:clienteId/cuentas/:id/abonos         → historial de abonos
```

### 2.3 Lógica del abono (FIFO)

Al registrar un abono:

```typescript
async registrarAbono(cuentaId: string, monto: Decimal, metodo: MetodoPago) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Crear el abono
    const abono = await tx.abonoCredito.create({ data: { cuenta_id: cuentaId, monto, metodo } });

    // 2. Obtener cargos con saldo pendiente, ordenados por fecha (más antiguo primero)
    const cargos = await tx.cargoCredito.findMany({
      where: { cuenta_id: cuentaId, saldo_cargo: { gt: 0 } },
      orderBy: { created_at: 'asc' },
    });

    // 3. Aplicar el abono FIFO
    let restante = monto;
    for (const cargo of cargos) {
      if (restante.lte(0)) break;
      const aplicar = Decimal.min(restante, cargo.saldo_cargo);
      await tx.cargoCredito.update({
        where: { id: cargo.id },
        data: { saldo_cargo: { decrement: aplicar } },
      });
      await tx.abonoDetalle.create({ data: { abono_id: abono.id, cargo_id: cargo.id, monto: aplicar } });
      restante = restante.minus(aplicar);
    }

    // 4. Actualizar saldo de la cuenta
    await tx.cuentaCliente.update({
      where: { id: cuentaId },
      data: { saldo: { increment: monto } },  // saldo sube (se reduce la deuda)
    });

    return abono;
  });
}
```

---

## 3. Cliente genérico "Mostrador"

Cada ubicación tiene un cliente llamado "Mostrador" (creado automáticamente al crear la ubicación en el seed). Este cliente no tiene crédito. Cuando el Vendedor hace una venta rápida sin asociar a un cliente específico, usa este cliente.

El Vendedor desde tablet solo puede vender a "Mostrador". El Encargado puede buscar y seleccionar cualquier cliente registrado.

---

## 4. UI — Pantallas

### 4.1 Ficha del cliente
- Datos generales (nombre, RFC, teléfono, email, dirección).
- Lista de cuentas activas con su saldo actual y límite de crédito.
- Botón "Nueva venta" que prellenaa el cliente en el módulo de ventas.
- Historial de ventas del cliente.

### 4.2 Estado de cuenta
- Tabla de cargos pendientes (folio de venta, fecha, monto original, saldo pendiente).
- Totales: total adeudado, crédito disponible.
- Botón "Registrar abono".
- Historial de abonos con método de pago y cargos que cubrió.

### 4.3 Modal de abono
- Monto a abonar.
- Método de pago.
- Referencia (opcional).
- Preview de a qué cargos se aplicará (FIFO, antes de confirmar).

---

## 5. Plan de implementación

### Días 1-2 — Schema + módulo de clientes
- Migración con nuevos modelos.
- CRUD de clientes y cuentas.
- Seed de cliente "Mostrador" en cada ubicación.

### Días 3-4 — Lógica de crédito
- Lógica de cargo automático al cerrar venta A_CREDITO.
- Lógica de abono FIFO con detalles.
- Tests exhaustivos del FIFO (casos: abono exacto, abono parcial, abono que cubre varios cargos).

### Días 5-6 — Frontend
- Ficha del cliente con cuentas.
- Pantalla de estado de cuenta.
- Modal de abono con preview FIFO.

### Días 7-8 — Integración con ventas + testing
- En el carrito de ventas, mostrar el precio según `numero_precio` de la cuenta seleccionada.
- Al crear la venta, preseleccionar la cuenta activa del cliente.
- E2E: ciclo completo crédito → cargo → abono parcial → abono restante → saldo cero.

---

## 6. Criterios de aceptación

```
[ ] Se puede crear un cliente con N cuentas
[ ] Cada cuenta define qué lista de precios ve (numero_precio)
[ ] Al seleccionar un cliente en ventas, los precios del carrito respetan su cuenta
[ ] Al cerrar una venta A_CREDITO, se genera un CargoCredito automáticamente
[ ] El abono se aplica FIFO (cargo más antiguo primero)
[ ] Un abono puede cubrir parcialmente varios cargos en una sola operación
[ ] El estado de cuenta muestra saldo correcto después de cada operación
[ ] El cliente "Mostrador" existe en cada ubicación y no tiene crédito
[ ] El Vendedor solo puede vender a "Mostrador"
[ ] Tests del FIFO con cobertura de casos límite
```

---

*Fase 4 de 8 · GrupoMetalicoEMF ERP · v1.0.0*
