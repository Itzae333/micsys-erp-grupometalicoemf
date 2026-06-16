# GrupoMetalicoEMF ERP — Roadmap Fase 9 → 15

> Continuación después de Fase 8 (RH refactor + evidencias + split-views).
> Cada fase es desplegable de forma independiente y no rompe funcionalidad anterior.

---

## FASE 9 — Impresión automática + UX de cobro
**Alcance:** Ticket térmico automático al cobrar, botón de reimprimir en nota pagada, mejoras menores de cobro.

### 9.1 Auto-imprimir al confirmar pago (PRIORIDAD ALTA)
**Situación actual:** Al pagar, aparece el dialog `postCobro` con botón "Imprimir ticket" — el usuario tiene que hacer clic.

**Comportamiento deseado:** Inmediatamente al confirmar el cobro:
1. Imprimir ticket automáticamente → cortar papel
2. Imprimir segunda copia → cortar papel
3. Mostrar `postCobro` dialog con opción de enviar por correo o reimprimir si falló

**Archivos a cambiar:**
- `apps/web/src/app/(app)/ventas/page.tsx`
  - En `onCobrar()`: después del `await api.post(...)`, llamar `await printTicket(...)` con `copias: 2` antes de `setPostCobro(...)`
  - Agregar estado `printStatus: 'idle' | 'printing' | 'ok' | 'error'` para mostrar feedback si la ticketera no responde
- `services/print-bridge/index.js`
  - Agregar campo `copias` al payload (default 1). Si `copias: 2`, enviar el buffer ESC/POS dos veces con corte entre cada uno.

**Flujo post-cobro:**
```
Confirmar cobro
  → API: cerrar nota
  → printTicket(nota, copias: 2)  ← nuevo, automático
    → éxito: dialog postCobro muestra "✓ Ticket impreso" + opción correo
    → fallo: dialog postCobro muestra "⚠ Ticketera no respondió" + botón reintentar
  → setPostCobro(...)
```

### 9.2 Botón "Reimprimir" en nota pagada `/ventas/[id]`
- Agregar botón en la vista de detalle cuando `nota.estatus === 'PAGADA' || 'CREDITO'`
- Reutiliza el mismo `printTicket()` que ya existe en `ventas/page.tsx` → extraer a hook compartido `useTicketPrint()`

### 9.3 Reimprimir abonar
- En el dialog de abono exitoso, mismo flujo: auto-imprimir recibo de abono + cortar papel

### 9.4 Configuración de impresora en UI
- Agregar sección en `/configuracion` → "Ticketera" con campos:
  - Transporte (`network` / `windows-port`)
  - IP y puerto (si network)
  - Puerto COM/USB (si windows-port)
  - Número de copias por defecto (1 o 2)
  - Botón "Probar conexión" → llama `GET http://localhost:7788/ping`
- Guardar en `localStorage` (no en BD — es config del equipo físico)

**Estimado:** 2-3 días de desarrollo

---

## FASE 10 — Dashboard real + KPIs
**Alcance:** Reemplazar tarjetas hardcoded del dashboard con datos reales.

### 10.1 Backend — endpoint de resumen
```
GET /api/v1/reportes/dashboard
→ {
    ventas_hoy: { total: number, count: number },
    ventas_semana: { total: number, count: number },
    por_cobrar: { total: number, count: number },  // notas PENDIENTE + CREDITO
    cotizaciones_abiertas: { count: number },
    articulos_bajo_minimo: { count: number },
    ultimas_ventas: NotaVenta[5],
    movimientos_recientes: MovimientoInventario[5],
  }
```
- Nuevo controller en `apps/api/src/reportes/reportes.controller.ts`
- Roles: todos los autenticados (cada rol ve lo relevante para él)

### 10.2 Frontend — Dashboard actualizado
- Tarjetas KPI con datos del endpoint (con skeleton loading)
- Mini gráfico de barras ventas últimos 7 días (usando CSS puro o recharts si ya está en deps)
- Lista "Últimas ventas" con link a cada nota
- Alerta visual si hay artículos bajo mínimo de stock
- Alerta si hay créditos vencidos > 30 días

### 10.3 Stock mínimo
- Agregar campo `existencia_minima` a `Articulo` en schema Prisma (nullable, por slot)
- En inventario/[id]: campo editable de mínimo por existencia
- Dashboard y lista de inventario muestran badge rojo si `existencia_actual < existencia_minima`

**Estimado:** 3-4 días

---

## FASE 11 — Módulo de Compras completo
**Alcance:** Órdenes de compra funcionales con flujo de recepción y entrada automática al inventario.

**Situación actual:** Existe `/compras` pero probablemente incompleto.

### 11.1 Flujo de orden de compra
```
Crear OC (proveedor + artículos + cantidades + precios)
  → Estatus: BORRADOR → ENVIADA → RECIBIDA_PARCIAL → RECIBIDA → CANCELADA
```

### 11.2 Backend
- `OrdenCompra` model ya existe en Prisma (verificar campos)
- Endpoints faltantes:
  - `PATCH /compras/:id/recibir` → marca items recibidos
  - Al recibir ítem: crear `MovimientoInventario` tipo `ENTRADA` automáticamente
  - Actualizar precio de costo del artículo si viene en la OC

### 11.3 Frontend
- Lista de OC con split-view (igual que ventas): izquierda tabla, derecha detalle
- Dialog "Recibir mercancía": checklist de artículos con cantidad recibida (puede ser parcial)
- Badge de estatus con colores
- Al recibir: mostrar resumen de movimientos creados

### 11.4 Integración inventario
- En la vista de artículo (`/inventario/[id]`): sección "Órdenes de compra relacionadas"
- Historial de compras por artículo: proveedor, fecha, cantidad, precio pagado

**Estimado:** 5-6 días

---

## FASE 12 — Reportes básicos
**Alcance:** Los reportes más pedidos en un ERP de distribución.

### 12.1 Reporte de ventas
```
GET /reportes/ventas?desde=&hasta=&usuario_id=&estatus=
→ tabla de ventas + totales por método de pago + promedio ticket
```
- Exportar a CSV (botón en UI)
- Filtros: período, vendedor, estatus, cliente

### 12.2 Inventario valorizado
```
GET /reportes/inventario-valorizado
→ artículo + existencia_actual por slot + precio_costo → valor_total
```
- Suma total del inventario en pesos
- Exportar CSV

### 12.3 Corte de caja por día
```
GET /reportes/corte-caja?fecha=
→ {
    efectivo: number,
    transferencia: number,
    credito_nuevo: number,
    abonos_cobrados: number,
    total_del_dia: number,
    detalle_notas: NotaVenta[],
  }
```
- Vista imprimible (botón `window.print()`)
- Auto-imprimir en ticketera si está configurada

### 12.4 Antigüedad de cartera
```
GET /reportes/cartera
→ clientes con saldo, agrupados por antigüedad: 0-30, 31-60, 61-90, >90 días
```
- Tabla con semáforo visual (verde/amarillo/rojo/negro)
- Exportar a CSV

### 12.5 Frontend — `/reportes`
- Menú de reportes con cards
- Cada reporte abre en su propia ruta o en un drawer
- Selector de fecha unificado

**Estimado:** 5-7 días

---

## FASE 13 — RH avanzado: nómina y exportaciones
**Alcance:** Cálculo de nómina básica y exportación de asistencia.

### 13.1 Cálculo de nómina
- Agregar campo `tarifa_dia` a `Empleado` (ya existe o agregar en Prisma)
- Endpoint:
  ```
  GET /rh/nomina?desde=&hasta=
  → por empleado: dias_trabajados, tardanzas, sanciones_monto, total_a_pagar
  ```
- Vista en `/rh` tab "Nómina": tabla resumen + total a pagar empresa
- Exportar a CSV

### 13.2 Exportar asistencia
- Botón "Exportar" en la vista de asistencia
- Genera CSV: empleado, fecha, hora_entrada, hora_salida, minutos_tardanza, sanción
- Filtros: período, empleado

### 13.3 Justificantes de falta
- Agregar campo `justificado: boolean` y `justificacion: string` a `RegistroAsistencia`
- En la vista de asistencia, ADMIN/ENCARGADO puede marcar falta como justificada

**Estimado:** 4-5 días

---

## FASE 14 — Calidad, auditoría y seguridad
**Alcance:** Trazabilidad completa de quién cambió qué.

### 14.1 Log de auditoría
- Nueva tabla `AuditLog` en Prisma:
  ```prisma
  model AuditLog {
    id         String   @id @default(cuid())
    usuario_id String
    accion     String   // CREATE, UPDATE, DELETE
    entidad    String   // "NotaVenta", "Articulo", etc.
    entidad_id String
    cambios    Json     // { campo: { antes, despues } }
    ip         String
    created_at DateTime @default(now())
  }
  ```
- Middleware NestJS que intercepta PATCH/POST/DELETE y escribe el log
- Vista en `/configuracion/auditoria` (solo SUPER_USUARIO): tabla filtrable

### 14.2 Validaciones faltantes
- Al crear venta: validar que al menos una columna de precio esté activa
- Al cobrar: validar que la suma de pagos >= total (prevenir cobros parciales accidentales)
- Al registrar entrada: validar que el artículo esté activo
- Descuento por línea: no puede exceder 100%

### 14.3 Sesiones activas
- Endpoint `GET /auth/sessions` → lista de refresh tokens activos por usuario
- Botón "Cerrar todas las sesiones" en perfil de usuario

**Estimado:** 4-6 días

---

## FASE 15 — Experiencia avanzada (long-term)
**Alcance:** Funcionalidades que elevan el ERP a producción enterprise.

### 15.1 Notificaciones in-app
- Badge en sidebar con contador de alertas
- Tipos de alerta:
  - Stock bajo (artículo < mínimo)
  - Crédito vencido > 30 días
  - Cotización sin convertir > 7 días
  - OC sin recibir > días configurables
- Marcar como leída, ver historial

### 15.2 Búsqueda global
- `Cmd/Ctrl + K` abre buscador global
- Busca en: notas, artículos, clientes, proveedores, empleados
- Resultados con ícono por tipo, navegar con flechas

### 15.3 Multi-empresa en una vista (SUPER_USUARIO)
- SUPER_USUARIO puede ver métricas de todas las empresas en el dashboard
- Comparativo de ventas entre sucursales

### 15.4 Backup y exportación de BD
- Botón en `/configuracion/sistema` (solo SUPER_USUARIO)
- Llama endpoint `POST /admin/backup` que genera dump de Postgres y lo sirve como descarga

### 15.5 PWA / Modo offline básico
- Service worker que cachea catálogo de artículos y clientes
- En modo offline: registrar ventas en IndexedDB, sincronizar al reconectarse
- Útil para vendedores en campo sin internet estable

**Estimado:** 10-15 días (hacerlo por partes)

---

## Resumen de prioridades

| Fase | Impacto | Esfuerzo | Recomendación |
|------|---------|----------|---------------|
| 9 — Impresión automática | 🔴 Crítico (operación diaria) | Bajo | **Implementar ya** |
| 10 — Dashboard real | 🟠 Alto (visibilidad) | Medio | Siguiente sprint |
| 11 — Compras completo | 🔴 Crítico (flujo operativo) | Alto | Siguiente sprint |
| 12 — Reportes básicos | 🟠 Alto (dirección) | Medio-alto | Sprint 3 |
| 13 — RH nómina | 🟡 Medio | Medio | Sprint 4 |
| 14 — Auditoría | 🟡 Medio (cumplimiento) | Medio | Sprint 4 |
| 15 — Features avanzados | 🟢 Nice-to-have | Alto | Largo plazo |

---

## Notas técnicas transversales

### Exportación CSV
Todas las exportaciones usan el mismo patrón:
```typescript
// En el backend — helper reutilizable
function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map(r => r.join(',')).join('\n');
}
// En el controller
res.setHeader('Content-Type', 'text/csv; charset=utf-8');
res.setHeader('Content-Disposition', 'attachment; filename="reporte.csv"');
res.send('﻿' + csv); // BOM para Excel en Windows
```

### Hook compartido de impresión
Extraer `printTicket()` de `ventas/page.tsx` a `apps/web/src/lib/hooks/usePrintTicket.ts` para reutilizarlo en `/ventas/[id]`, corte de caja, abonar, etc.

### Stock mínimo
Migración simple: `ALTER TABLE "articulos" ADD COLUMN "existencia_minima" DECIMAL(15,3);` — nullable, sin default. Solo se muestra el badge cuando el campo tiene valor.
