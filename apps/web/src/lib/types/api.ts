export type TipoUbicacion = 'MATRIZ' | 'FABRICA' | 'PUNTO_VENTA';
export type RolUsuario =
  | 'SUPER_USUARIO'
  | 'ADMIN'
  | 'ENCARGADO'
  | 'VENDEDOR'
  | 'ALMACENISTA'
  | 'JEFE_MANUFACTURA'
  | 'JEFE_RH';
export type TipoColumna = 'PRECIO' | 'EXISTENCIA' | 'DESCRIPCION';

export interface Empresa {
  id: string;
  nombre: string;
  razon_social: string;
  rfc: string;
  logo_url: string | null;
  activa: boolean;
  created_at: string;
}

export interface Ubicacion {
  id: string;
  empresa_id: string;
  nombre: string;
  tipo: TipoUbicacion;
  activa: boolean;
  razon_social: string | null;
  rfc: string | null;
  regimen_fiscal: string | null;
  calle: string | null;
  num_ext: string | null;
  num_int: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  cp: string | null;
  telefono: string | null;
}

export interface Usuario {
  id: string;
  empresa_id: string;
  nombre: string;
  apellidos: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  ultimo_acceso: string | null;
  allowed_ips: string[];
  ubicaciones: { id: string; nombre: string; tipo: TipoUbicacion }[];
}

export interface ConfigColumna {
  id: string;
  empresa_id: string;
  ubicacion_id: string;
  tipo: TipoColumna;
  numero: number;
  label: string;
  activa: boolean;
  orden: number;
}

export interface ConfigColumnasSchema {
  precios: { numero: number; label: string; activa: boolean; orden?: number }[];
  existencias: { numero: number; label: string; activa: boolean; orden?: number }[];
  descripciones: { numero: number; label: string; activa: boolean; orden?: number }[];
}

export interface Proveedor {
  id: string;
  empresa_id: string;
  nombre: string;
  razon_social: string | null;
  rfc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
  saldo_pendiente: number;
  created_at: string;
}

export interface Articulo {
  id: string;
  empresa_id: string;
  clave: string;
  activo: boolean;
  imagen_url: string | null;
  proveedor_id: string | null;
  proveedor: { id: string; nombre: string } | null;

  precio_1: number | null;
  precio_2: number | null;
  precio_3: number | null;
  precio_4: number | null;
  precio_5: number | null;
  precio_6: number | null;
  precio_7: number | null;
  precio_8: number | null;
  precio_9: number | null;
  precio_10: number | null;

  existencia_1: number | null;
  existencia_2: number | null;
  existencia_3: number | null;
  existencia_4: number | null;
  existencia_5: number | null;

  descripcion_1: string | null;
  descripcion_2: string | null;
  descripcion_3: string | null;
  descripcion_4: string | null;
  descripcion_5: string | null;

  created_at: string;
  updated_at: string;
}

export interface ArticulosPage {
  data: Articulo[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Cliente {
  id: string;
  empresa_id: string;
  nombre: string;
  apellidos: string | null;
  razon_social: string | null;
  rfc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
  precio_num: number | null;
  limite_credito: number;
  saldo_pendiente: number;
  created_at: string;
  updated_at: string;
}

export type EstatusNota = 'COTIZACION' | 'ABIERTA' | 'PENDIENTE' | 'PAGADA' | 'CREDITO' | 'CANCELADA';
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'DEPOSITO';

export interface NotaVentaLinea {
  id: string;
  nota_id: string;
  articulo_id: string;
  articulo: {
    id: string; clave: string;
    descripcion_1: string | null; descripcion_2: string | null;
    descripcion_3: string | null; descripcion_4: string | null; descripcion_5: string | null;
  } | null;
  clave: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  created_at: string;
}

export interface Pago {
  id: string;
  nota_id: string;
  metodo: MetodoPago;
  monto: number;
  referencia: string | null;
  created_at: string;
}

export type TipoEvidencia = 'TICKET_ORIGINAL' | 'COMPROBANTE_PAGO' | 'IMAGEN' | 'TICKET_REEDITADO';

export interface EvidenciaNota {
  id: string;
  nota_id: string;
  empresa_id: string;
  tipo: TipoEvidencia;
  descripcion: string | null;
  archivo_url: string | null;
  data_json: { base64?: string } | null;
  subido_por_id: string;
  subido_por: { id: string; nombre: string; apellidos: string } | null;
  created_at: string;
}

export interface NotaVenta {
  id: string;
  folio: number;
  empresa_id: string;
  ubicacion_id: string;
  usuario_id: string;
  cliente_id: string | null;
  cliente: { id: string; nombre: string; apellidos: string | null; razon_social: string | null; email: string | null; limite_credito: number; saldo_pendiente: number } | null;
  usuario: { id: string; nombre: string; apellidos: string } | null;
  estatus: EstatusNota;
  subtotal: number;
  descuento: number;
  total: number;
  es_credito: boolean;
  fecha_vencimiento: string | null;
  observaciones: string | null;
  lineas: NotaVentaLinea[];
  pagos: Pago[];
  evidencias: EvidenciaNota[];
  created_at: string;
  updated_at: string;
  cerrada_at: string | null;
}

export interface NotasVentaPage {
  data: NotaVenta[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Fase 4 — Crédito y Cuentas ──────────────────────────────

export type TipoMovimientoCuenta = 'CARGO' | 'ABONO' | 'AJUSTE';

export interface MovimientoCuenta {
  id: string;
  empresa_id: string;
  cliente_id: string;
  tipo: TipoMovimientoCuenta;
  monto: number;
  saldo_antes: number;
  saldo_despues: number;
  concepto: string;
  nota_id: string | null;
  nota: { id: string; folio: number } | null;
  usuario_id: string;
  usuario: { id: string; nombre: string; apellidos: string } | null;
  created_at: string;
}

export interface CuentaClienteResumen {
  id: string;
  nombre: string;
  apellidos: string | null;
  razon_social: string | null;
  rfc: string | null;
  telefono: string | null;
  precio_num: number | null;
  limite_credito: number;
  saldo_pendiente: number;
}

export interface CuentaClienteDetalle {
  cliente: CuentaClienteResumen;
  movimientos: MovimientoCuenta[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface AbonarCuentaNotaPagada {
  nota_id: string;
  folio: number;
  total: number;
  monto_pagado: number;
  nuevo_estatus: string;
}

export interface AbonarCuentaResult {
  cliente: CuentaClienteResumen;
  notas_pagadas: AbonarCuentaNotaPagada[];
  total_aplicado: number;
  sobrante: number;
}

// ── Fase 5 — Entradas y Salidas ──────────────────────────────

export type TipoMovimientoInventario =
  | 'ENTRADA'
  | 'SALIDA'
  | 'TRANSFERENCIA_OUT'
  | 'TRANSFERENCIA_IN'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO';

export interface MovimientoInventario {
  id: string;
  empresa_id: string;
  articulo_id: string;
  articulo: { id: string; clave: string; descripcion_1: string | null; descripcion_2: string | null } | null;
  tipo: TipoMovimientoInventario;
  existencia_num: number;
  cantidad: number;
  cantidad_antes: number;
  cantidad_despues: number;
  concepto: string;
  proveedor_id: string | null;
  proveedor: { id: string; nombre: string } | null;
  referencia_id: string | null;
  usuario_id: string;
  usuario: { id: string; nombre: string; apellidos: string } | null;
  created_at: string;
}

export interface MovimientosInventarioPage {
  data: MovimientoInventario[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Fase 6 — Compras y Cuentas por Pagar ─────────────────────

export type EstatusOrdenCompra =
  | 'BORRADOR'
  | 'APROBADA'
  | 'RECIBIDA_PARCIAL'
  | 'RECIBIDA'
  | 'CANCELADA';

export type TipoMovimientoProveedor = 'CARGO' | 'ABONO' | 'AJUSTE';

export interface OrdenCompraLinea {
  id: string;
  orden_id: string;
  articulo_id: string;
  articulo: { id: string; clave: string; descripcion_1: string | null; descripcion_2: string | null } | null;
  clave: string;
  cantidad_solicitada: number;
  cantidad_recibida: number;
  precio_unitario: number;
  subtotal: number;
  existencia_num: number;
  created_at: string;
}

export interface OrdenCompra {
  id: string;
  folio: number;
  empresa_id: string;
  proveedor_id: string;
  proveedor: { id: string; nombre: string; razon_social: string | null; rfc: string | null } | null;
  estatus: EstatusOrdenCompra;
  subtotal: number;
  total: number;
  observaciones: string | null;
  usuario_id: string;
  usuario: { id: string; nombre: string; apellidos: string } | null;
  aprobada_at: string | null;
  recibida_at: string | null;
  lineas: OrdenCompraLinea[];
  created_at: string;
  updated_at: string;
}

export interface OrdenesCompraPage {
  data: OrdenCompra[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface MovimientoCuentaProveedor {
  id: string;
  empresa_id: string;
  proveedor_id: string;
  tipo: TipoMovimientoProveedor;
  monto: number;
  saldo_antes: number;
  saldo_despues: number;
  concepto: string;
  orden_id: string | null;
  orden: { id: string; folio: number } | null;
  usuario_id: string;
  usuario: { id: string; nombre: string; apellidos: string } | null;
  created_at: string;
}

export interface CuentaProveedorResumen {
  id: string;
  nombre: string;
  razon_social: string | null;
  rfc: string | null;
  telefono: string | null;
  saldo_pendiente: number;
}

export interface CuentaProveedorDetalle {
  proveedor: CuentaProveedorResumen;
  movimientos: MovimientoCuentaProveedor[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Fase 7 — Recursos Humanos ─────────────────────────────────

export type TipoPago = 'POR_HORA' | 'POR_PIEZA';
export type EstatusAsistencia = 'PRESENTE' | 'AUSENTE' | 'TARDANZA' | 'PERMISO' | 'VACACIONES';
export type EstatusProduccion = 'ABIERTA' | 'EN_PROCESO' | 'COMPLETADA' | 'CANCELADA';

export interface Area {
  id: string;
  empresa_id: string;
  nombre: string;
  tipo_pago: TipoPago;
  activa: boolean;
  created_at: string;
  updated_at: string;
  _count?: { empleados: number };
}

export interface Empleado {
  id: string;
  empresa_id: string;
  usuario_id: string | null;
  nombre: string;
  apellidos: string;
  puesto: string;
  area_id: string | null;
  area: { id: string; nombre: string; tipo_pago: TipoPago } | null;
  usuario: { id: string; nombre: string; apellidos: string; email: string; rol: string } | null;
  salario_diario: number;
  telefono: string | null;
  fecha_ingreso: string;
  activo: boolean;
  descuento_por_30min: number | null;
  minimo_piezas_semana: number | null;
  sancion_por_pieza: number | null;
  created_at: string;
  updated_at: string;
}

export interface EmpleadosPage {
  data: Empleado[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface RegistroAsistencia {
  id: string;
  empresa_id: string;
  empleado_id: string;
  area_id: string | null;
  empleado: { id: string; nombre: string; apellidos: string; puesto: string } | null;
  area: { id: string; nombre: string; tipo_pago: TipoPago } | null;
  fecha: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  estatus: EstatusAsistencia;
  minutos_tarde: number | null;
  piezas_realizadas: number | null;
  sancion_monto: number | null;
  sancion_concepto: string | null;
  observaciones: string | null;
  usuario_id: string;
  usuario: { id: string; nombre: string; apellidos: string } | null;
  created_at: string;
  updated_at: string;
}

export interface AsistenciaPage {
  data: RegistroAsistencia[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface OrdenProduccion {
  id: string;
  folio: number;
  empresa_id: string;
  articulo_id: string;
  articulo: { id: string; clave: string; descripcion_1: string | null; descripcion_2: string | null } | null;
  existencia_num: number;
  cantidad_objetivo: number;
  cantidad_producida: number;
  estatus: EstatusProduccion;
  fecha_inicio: string;
  fecha_cierre: string | null;
  observaciones: string | null;
  usuario_id: string;
  usuario: { id: string; nombre: string; apellidos: string } | null;
  created_at: string;
  updated_at: string;
}

export interface OrdenesProduccionPage {
  data: OrdenProduccion[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Fase 8 — Reportes ─────────────────────────────────────────

export interface DiaVenta {
  dia: string;
  total: number;
  count: number;
}

export interface DashboardData {
  ventas_hoy: { total: number; count: number };
  ventas_mes: { total: number; count: number };
  notas_pendientes: number;
  clientes_con_saldo: number;
  ops_activas: number;
  proveedores_con_saldo: number;
  entradas_hoy: number;
  top_articulos_mes: { articulo_id: string; clave: string; cantidad: number; subtotal: number }[];
  ventas_diarias: DiaVenta[];
}

export interface ReporteVentasData {
  resumen: { total: number; subtotal: number; descuento: number; count: number };
  por_estatus: { estatus: string; count: number; total: number }[];
  por_metodo_pago: { metodo: string; count: number; total: number }[];
  top_clientes: {
    cliente_id: string | null;
    cliente: { id: string; nombre: string; apellidos: string | null; razon_social: string | null } | null;
    notas: number;
    total: number;
  }[];
  ventas_diarias: DiaVenta[];
}

export interface ReporteInventarioData {
  articulos_total: number;
  bajo_stock: {
    id: string; clave: string; descripcion_1: string | null;
    existencia_1: number | null; existencia_2: number | null; existencia_3: number | null;
  }[];
  movimientos_por_tipo: { tipo: string; count: number; cantidad: number }[];
  top_movidos: {
    articulo_id: string;
    articulo: { id: string; clave: string; descripcion_1: string | null } | null;
    movimientos: number;
    cantidad: number;
  }[];
}

export interface ReporteCreditoData {
  cartera_total: number;
  clientes_con_saldo: number;
  top_deudores: {
    id: string; nombre: string; apellidos: string | null; razon_social: string | null;
    saldo_pendiente: number; limite_credito: number; precio_num: number | null;
  }[];
  cuentas_vencidas: {
    id: string; folio: number; total: number; fecha_vencimiento: string | null;
    cliente: { id: string; nombre: string; apellidos: string | null; razon_social: string | null } | null;
  }[];
}

export interface ReporteComprasData {
  resumen: { total: number; ordenes: number };
  por_estatus: { estatus: string; count: number; total: number }[];
  top_proveedores: {
    proveedor_id: string;
    proveedor: { id: string; nombre: string; razon_social: string | null } | null;
    ordenes: number;
    total: number;
  }[];
  cuentas_por_pagar: {
    total: number;
    proveedores: { id: string; nombre: string; razon_social: string | null; saldo_pendiente: number }[];
  };
}

export interface ReporteProduccionData {
  total_ops: number;
  cantidad_objetivo: number;
  cantidad_producida: number;
  eficiencia: number;
  por_estatus: { estatus: string; ops: number; objetivo: number; producida: number }[];
  top_articulos: {
    articulo_id: string;
    articulo: { id: string; clave: string; descripcion_1: string | null } | null;
    ops: number;
    producida: number;
  }[];
}

export interface ReporteAsistenciaData {
  empleados_activos: number;
  total_registros: number;
  por_estatus: { estatus: string; count: number }[];
  top_ausencias: {
    empleado_id: string;
    empleado: { id: string; nombre: string; apellidos: string; puesto: string } | null;
    ausencias: number;
  }[];
}
