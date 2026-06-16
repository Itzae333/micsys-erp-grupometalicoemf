'use client';
import { formatPrecio } from '@/lib/utils';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  UserCog, Users, ClipboardList, Factory, Plus, Edit2,
  ToggleLeft, ToggleRight, ChevronDown, Search, CalendarDays,
  TrendingUp, CheckCircle, XCircle, Loader2, Layers, Download, DollarSign,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type {
  Area, Empleado, EmpleadosPage, TipoPago,
  RegistroAsistencia, AsistenciaPage, EstatusAsistencia,
  OrdenProduccion, OrdenesProduccionPage, EstatusProduccion,
  Articulo, ArticulosPage,
} from '@/lib/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

// ── Config badges ────────────────────────────────────────────

type BadgeVariant = 'paid' | 'nota_por_pagar' | 'credit' | 'cargada' | 'pending' | 'cancelled' | 'default' | 'incomplete';

const TIPO_PAGO_CONFIG: Record<TipoPago, { label: string; variant: BadgeVariant }> = {
  POR_HORA:  { label: 'Por hora',  variant: 'credit' },
  POR_PIEZA: { label: 'Por pieza', variant: 'cargada' },
};

const ASISTENCIA_CONFIG: Record<EstatusAsistencia, { label: string; variant: BadgeVariant }> = {
  PRESENTE:   { label: 'Presente',   variant: 'paid' },
  AUSENTE:    { label: 'Ausente',    variant: 'cancelled' },
  TARDANZA:   { label: 'Tardanza',   variant: 'credit' },
  PERMISO:    { label: 'Permiso',    variant: 'pending' },
  VACACIONES: { label: 'Vacaciones', variant: 'incomplete' },
};

const PRODUCCION_CONFIG: Record<EstatusProduccion, { label: string; variant: BadgeVariant }> = {
  ABIERTA:    { label: 'Abierta',    variant: 'pending' },
  EN_PROCESO: { label: 'En proceso', variant: 'credit' },
  COMPLETADA: { label: 'Completada', variant: 'paid' },
  CANCELADA:  { label: 'Cancelada',  variant: 'cancelled' },
};

const ESTATUSES_ASISTENCIA: EstatusAsistencia[] = ['PRESENTE', 'AUSENTE', 'TARDANZA', 'PERMISO', 'VACACIONES'];
const ESTATUSES_PRODUCCION: EstatusProduccion[] = ['ABIERTA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'];

// ── Helpers ───────────────────────────────────────────────────

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function fmtMoneda(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ── Búsqueda de artículo con typeahead ────────────────────────

function ArticuloSearch({
  value, onChange,
}: { value: Articulo | null; onChange: (a: Articulo | null) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Articulo[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) setQ(`${value.clave} — ${value.descripcion_1 ?? ''}`);
    else setQ('');
  }, [value]);

  function handleChange(val: string) {
    setQ(val);
    onChange(null);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setItems([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await api.get<ArticulosPage>(`/articulos?q=${encodeURIComponent(val)}&limit=8`);
        setItems(res.data);
        setOpen(true);
      } catch { setItems([]); }
    }, 250);
  }

  function select(a: Articulo) {
    onChange(a);
    setQ(`${a.clave} — ${a.descripcion_1 ?? ''}`);
    setItems([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Buscar artículo (clave o nombre)…"
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-steel-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {items.map((a) => (
            <li
              key={a.id}
              onMouseDown={() => select(a)}
              className="px-3 py-2 hover:bg-steel-50 cursor-pointer text-body-sm"
            >
              <span className="font-mono text-brand-700 mr-2">{a.clave}</span>
              {a.descripcion_1 ?? ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Búsqueda de empleado con typeahead ─────────────────────────

function EmpleadoSearch({
  value, onChange,
}: { value: Empleado | null; onChange: (e: Empleado | null) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Empleado[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value) setQ(`${value.apellidos} ${value.nombre}`);
    else setQ('');
  }, [value]);

  function handleChange(val: string) {
    setQ(val);
    onChange(null);
    if (timer.current) clearTimeout(timer.current);
    if (val.length < 2) { setItems([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await api.get<EmpleadosPage>(`/rh/empleados?q=${encodeURIComponent(val)}&limit=8`);
        setItems(res.data);
        setOpen(true);
      } catch { setItems([]); }
    }, 250);
  }

  function select(e: Empleado) {
    onChange(e);
    setQ(`${e.apellidos} ${e.nombre}`);
    setItems([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(ev) => handleChange(ev.target.value)}
        placeholder="Buscar empleado…"
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && items.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-steel-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {items.map((e) => (
            <li
              key={e.id}
              onMouseDown={() => select(e)}
              className="px-3 py-2 hover:bg-steel-50 cursor-pointer text-body-sm"
            >
              <span className="font-medium">{e.apellidos} {e.nombre}</span>
              <span className="ml-2 text-steel-400 text-meta">{e.puesto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Barra de progreso de producción ──────────────────────────

function ProgressBar({ producida, objetivo }: { producida: number; objetivo: number }) {
  const pct = objetivo > 0 ? Math.min(100, (producida / objetivo) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-steel-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-meta text-steel-500 whitespace-nowrap">
        {producida}/{objetivo}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════

type Tab = 'empleados' | 'areas' | 'asistencia' | 'produccion' | 'nomina';

interface NominaEmpleado {
  empleado: { id: string; nombre: string; apellidos: string; puesto: string; salario_diario: number };
  dias_trabajados: number;
  total_registros: number;
  salario_base: number;
  total_sanciones: number;
  total_a_pagar: number;
}
interface NominaData {
  desde: string;
  hasta: string;
  empleados: NominaEmpleado[];
  total_nomina: number;
}

export default function RhPage() {
  const { usuario } = useAuthStore();
  const { empresa } = useContextoStore();

  const canWrite     = ['SUPER_USUARIO', 'ADMIN', 'JEFE_RH'].includes(usuario?.rol ?? '');
  const canManufact  = ['SUPER_USUARIO', 'ADMIN', 'JEFE_MANUFACTURA'].includes(usuario?.rol ?? '');
  const canAvance    = ['SUPER_USUARIO', 'ADMIN', 'JEFE_MANUFACTURA', 'ALMACENISTA'].includes(usuario?.rol ?? '');
  const isAdminPlus  = ['SUPER_USUARIO', 'ADMIN'].includes(usuario?.rol ?? '');

  const [tab, setTab] = useState<Tab>('empleados');

  // ── Estado — Empleados ─────────────────────────────────────

  const [areas, setAreas]           = useState<Area[]>([]);
  const [empleados, setEmpleados]   = useState<Empleado[]>([]);
  const [empTotal, setEmpTotal]     = useState(0);
  const [empQ, setEmpQ]             = useState('');
  const [empAreaId, setEmpAreaId]   = useState('');
  const [empActivo, setEmpActivo]   = useState('');
  const [loadingEmp, setLoadingEmp] = useState(false);

  const [dlgEmpOpen, setDlgEmpOpen] = useState(false);
  const [editEmp, setEditEmp]       = useState<Empleado | null>(null);
  const [empForm, setEmpForm] = useState({
    nombre: '', apellidos: '', puesto: '',
    area_id: '', usuario_id: '',
    salario_diario: '', telefono: '', fecha_ingreso: todayISO(),
    descuento_por_30min: '', minimo_piezas_semana: '', sancion_por_pieza: '',
  });
  const [savingEmp, setSavingEmp] = useState(false);

  // ── Estado — Áreas (dialog) ────────────────────────────────

  const [dlgAreaOpen, setDlgAreaOpen] = useState(false);
  const [editArea, setEditArea]       = useState<Area | null>(null);
  const [areaForm, setAreaForm] = useState({
    nombre: '',
    tipo_pago: 'POR_HORA' as TipoPago,
  });
  const [savingArea, setSavingArea] = useState(false);

  // ── Estado — Asistencia ────────────────────────────────────

  const [asistencias, setAsistencias]   = useState<RegistroAsistencia[]>([]);
  const [asistTotal, setAsistTotal]     = useState(0);
  const [asistFecha, setAsistFecha]     = useState(todayISO());
  const [asistEmp, setAsistEmp]         = useState('');
  const [loadingAsist, setLoadingAsist] = useState(false);

  const [dlgAsistOpen, setDlgAsistOpen]   = useState(false);
  const [editAsist, setEditAsist]         = useState<RegistroAsistencia | null>(null);
  const [asistEmpleado, setAsistEmpleado] = useState<Empleado | null>(null);
  const [asistForm, setAsistForm] = useState({
    fecha: todayISO(), estatus: 'PRESENTE' as EstatusAsistencia,
    area_id: '', hora_entrada: '', hora_salida: '',
    minutos_tarde: '', piezas_realizadas: '', observaciones: '',
  });
  const [savingAsist, setSavingAsist] = useState(false);

  // ── Estado — Producción ────────────────────────────────────

  const [ordenes, setOrdenes]       = useState<OrdenProduccion[]>([]);
  const [opTotal, setOpTotal]       = useState(0);
  const [opEstatus, setOpEstatus]   = useState('');
  const [loadingOp, setLoadingOp]   = useState(false);

  const [dlgOpOpen, setDlgOpOpen]       = useState(false);
  const [opArticulo, setOpArticulo]     = useState<Articulo | null>(null);
  const [opForm, setOpForm] = useState({
    existencia_num: 1, cantidad_objetivo: '', fecha_inicio: todayISO(), observaciones: '',
  });
  const [savingOp, setSavingOp] = useState(false);

  const [dlgAvanceOpen, setDlgAvanceOpen] = useState(false);
  const [opSeleccionada, setOpSeleccionada] = useState<OrdenProduccion | null>(null);
  const [avanceCantidad, setAvanceCantidad] = useState('');
  const [savingAvance, setSavingAvance] = useState(false);

  const [dlgOpDetalle, setDlgOpDetalle] = useState(false);
  const [opDetalle, setOpDetalle]       = useState<OrdenProduccion | null>(null);

  // ── Loaders ────────────────────────────────────────────────

  const loadAreas = useCallback(async () => {
    if (!empresa) return;
    try {
      const res = await api.get<Area[]>('/rh/areas');
      setAreas(res);
    } catch { /* noop */ }
  }, [empresa]);

  const loadEmpleados = useCallback(async () => {
    if (!empresa) return;
    setLoadingEmp(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (empQ)      params.set('q', empQ);
      if (empAreaId) params.set('areaId', empAreaId);
      if (empActivo) params.set('activo', empActivo);
      const res = await api.get<EmpleadosPage>(`/rh/empleados?${params}`);
      setEmpleados(res.data);
      setEmpTotal(res.total);
    } catch { /* noop */ } finally { setLoadingEmp(false); }
  }, [empresa, empQ, empAreaId, empActivo]);

  const loadAsistencia = useCallback(async () => {
    if (!empresa) return;
    setLoadingAsist(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (asistFecha) params.set('fecha', asistFecha);
      if (asistEmp)   params.set('empleadoId', asistEmp);
      const res = await api.get<AsistenciaPage>(`/rh/asistencia?${params}`);
      setAsistencias(res.data);
      setAsistTotal(res.total);
    } catch { /* noop */ } finally { setLoadingAsist(false); }
  }, [empresa, asistFecha, asistEmp]);

  const loadOrdenes = useCallback(async () => {
    if (!empresa) return;
    setLoadingOp(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (opEstatus) params.set('estatus', opEstatus);
      const res = await api.get<OrdenesProduccionPage>(`/rh/produccion?${params}`);
      setOrdenes(res.data);
      setOpTotal(res.total);
    } catch { /* noop */ } finally { setLoadingOp(false); }
  }, [empresa, opEstatus]);

  // Nómina
  const [nominaData, setNominaData] = useState<NominaData | null>(null);
  const [nominaLoading, setNominaLoading] = useState(false);
  const [nominaDesde, setNominaDesde] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [nominaHasta, setNominaHasta] = useState(() => new Date().toISOString().slice(0, 10));

  const loadNomina = useCallback(async () => {
    if (!empresa) return;
    setNominaLoading(true);
    try {
      const d = await api.get<NominaData>(`/rh/nomina?desde=${nominaDesde}&hasta=${nominaHasta}`);
      setNominaData(d);
    } catch { /* noop */ } finally { setNominaLoading(false); }
  }, [empresa, nominaDesde, nominaHasta]);

  function exportNomina() {
    if (!nominaData) return;
    const BOM = '﻿';
    const headers = ['Empleado', 'Puesto', 'Salario diario', 'Días trabajados', 'Salario base', 'Sanciones', 'Total a pagar'];
    const rows = nominaData.empleados.map((e) => [
      `${e.empleado.apellidos}, ${e.empleado.nombre}`,
      e.empleado.puesto,
      e.empleado.salario_diario,
      e.dias_trabajados,
      e.salario_base,
      e.total_sanciones,
      e.total_a_pagar,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => {
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nomina_${nominaDesde}_${nominaHasta}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => { loadAreas(); }, [loadAreas]);
  useEffect(() => { loadEmpleados(); }, [loadEmpleados]);
  useEffect(() => { if (tab === 'asistencia') loadAsistencia(); }, [tab, loadAsistencia]);
  useEffect(() => { if (tab === 'produccion') loadOrdenes(); }, [tab, loadOrdenes]);
  useEffect(() => { if (tab === 'nomina') void loadNomina(); }, [tab, loadNomina]);

  // ── Handlers — Empleados ──────────────────────────────────

  function abrirNuevoEmp() {
    setEditEmp(null);
    setEmpForm({
      nombre: '', apellidos: '', puesto: '',
      area_id: '', usuario_id: '',
      salario_diario: '', telefono: '', fecha_ingreso: todayISO(),
      descuento_por_30min: '', minimo_piezas_semana: '', sancion_por_pieza: '',
    });
    setDlgEmpOpen(true);
  }

  function abrirEditEmp(e: Empleado) {
    setEditEmp(e);
    setEmpForm({
      nombre:        e.nombre,
      apellidos:     e.apellidos,
      puesto:        e.puesto,
      area_id:       e.area_id    ?? '',
      usuario_id:    e.usuario_id ?? '',
      salario_diario: String(e.salario_diario),
      telefono:      e.telefono   ?? '',
      fecha_ingreso: e.fecha_ingreso.slice(0, 10),
      descuento_por_30min:  e.descuento_por_30min  != null ? String(e.descuento_por_30min)  : '',
      minimo_piezas_semana: e.minimo_piezas_semana != null ? String(e.minimo_piezas_semana) : '',
      sancion_por_pieza:    e.sancion_por_pieza    != null ? String(e.sancion_por_pieza)    : '',
    });
    setDlgEmpOpen(true);
  }

  async function guardarEmpleado() {
    if (!empForm.nombre || !empForm.apellidos || !empForm.puesto || !empForm.salario_diario) return;
    setSavingEmp(true);
    try {
      const body = {
        nombre:               empForm.nombre,
        apellidos:            empForm.apellidos,
        puesto:               empForm.puesto,
        area_id:              empForm.area_id    || undefined,
        usuario_id:           empForm.usuario_id || undefined,
        salario_diario:       Number(empForm.salario_diario),
        telefono:             empForm.telefono   || undefined,
        fecha_ingreso:        empForm.fecha_ingreso,
        descuento_por_30min:  empForm.descuento_por_30min  ? Number(empForm.descuento_por_30min)  : undefined,
        minimo_piezas_semana: empForm.minimo_piezas_semana ? Number(empForm.minimo_piezas_semana) : undefined,
        sancion_por_pieza:    empForm.sancion_por_pieza    ? Number(empForm.sancion_por_pieza)    : undefined,
      };
      if (editEmp) {
        await api.patch(`/rh/empleados/${editEmp.id}`, body);
      } else {
        await api.post('/rh/empleados', body);
      }
      setDlgEmpOpen(false);
      loadEmpleados();
    } catch { /* noop */ } finally { setSavingEmp(false); }
  }

  async function toggleEmp(e: Empleado) {
    try {
      await api.patch(`/rh/empleados/${e.id}/toggle`, {});
      loadEmpleados();
    } catch { /* noop */ }
  }

  // ── Handlers — Áreas ─────────────────────────────────────

  function abrirNuevaArea() {
    setEditArea(null);
    setAreaForm({ nombre: '', tipo_pago: 'POR_HORA' });
    setDlgAreaOpen(true);
  }

  function abrirEditArea(a: Area) {
    setEditArea(a);
    setAreaForm({ nombre: a.nombre, tipo_pago: a.tipo_pago });
    setDlgAreaOpen(true);
  }

  async function guardarArea() {
    if (!areaForm.nombre) return;
    setSavingArea(true);
    try {
      const body = { nombre: areaForm.nombre, tipo_pago: areaForm.tipo_pago };
      if (editArea) {
        await api.patch(`/rh/areas/${editArea.id}`, body);
      } else {
        await api.post('/rh/areas', body);
      }
      setDlgAreaOpen(false);
      loadAreas();
    } catch { /* noop */ } finally { setSavingArea(false); }
  }

  async function toggleArea(a: Area) {
    try {
      await api.patch(`/rh/areas/${a.id}`, { activa: !a.activa });
      loadAreas();
    } catch { /* noop */ }
  }

  // ── Handlers — Asistencia ─────────────────────────────────

  function abrirNuevaAsist() {
    setEditAsist(null);
    setAsistEmpleado(null);
    setAsistForm({
      fecha: asistFecha || todayISO(), estatus: 'PRESENTE',
      area_id: '', hora_entrada: '', hora_salida: '',
      minutos_tarde: '', piezas_realizadas: '', observaciones: '',
    });
    setDlgAsistOpen(true);
  }

  function abrirEditAsist(r: RegistroAsistencia) {
    setEditAsist(r);
    setAsistEmpleado(null);
    setAsistForm({
      fecha: r.fecha.slice(0, 10),
      estatus: r.estatus,
      area_id: r.area_id ?? '',
      hora_entrada: r.hora_entrada ? new Date(r.hora_entrada).toISOString().slice(0, 16) : '',
      hora_salida:  r.hora_salida  ? new Date(r.hora_salida).toISOString().slice(0, 16)  : '',
      minutos_tarde:     r.minutos_tarde     != null ? String(r.minutos_tarde)     : '',
      piezas_realizadas: r.piezas_realizadas != null ? String(r.piezas_realizadas) : '',
      observaciones: r.observaciones ?? '',
    });
    setDlgAsistOpen(true);
  }

  async function guardarAsistencia() {
    if (!editAsist && !asistEmpleado) return;
    setSavingAsist(true);
    try {
      const common = {
        area_id:           asistForm.area_id || undefined,
        hora_entrada:      asistForm.hora_entrada || undefined,
        hora_salida:       asistForm.hora_salida  || undefined,
        estatus:           asistForm.estatus,
        minutos_tarde:     asistForm.minutos_tarde     ? Number(asistForm.minutos_tarde)     : undefined,
        piezas_realizadas: asistForm.piezas_realizadas ? Number(asistForm.piezas_realizadas) : undefined,
        observaciones:     asistForm.observaciones || undefined,
      };
      if (editAsist) {
        await api.patch(`/rh/asistencia/${editAsist.id}`, common);
      } else {
        await api.post('/rh/asistencia', { empleado_id: asistEmpleado!.id, fecha: asistForm.fecha, ...common });
      }
      setDlgAsistOpen(false);
      loadAsistencia();
    } catch { /* noop */ } finally { setSavingAsist(false); }
  }

  // ── Handlers — Producción ─────────────────────────────────

  function abrirNuevaOp() {
    setOpArticulo(null);
    setOpForm({ existencia_num: 1, cantidad_objetivo: '', fecha_inicio: todayISO(), observaciones: '' });
    setDlgOpOpen(true);
  }

  async function crearOrdenProduccion() {
    if (!opArticulo || !opForm.cantidad_objetivo) return;
    setSavingOp(true);
    try {
      await api.post('/rh/produccion', {
        articulo_id:      opArticulo.id,
        existencia_num:   opForm.existencia_num,
        cantidad_objetivo: Number(opForm.cantidad_objetivo),
        fecha_inicio:     opForm.fecha_inicio,
        observaciones:    opForm.observaciones || undefined,
      });
      setDlgOpOpen(false);
      loadOrdenes();
    } catch { /* noop */ } finally { setSavingOp(false); }
  }

  function abrirAvance(op: OrdenProduccion) {
    setOpSeleccionada(op);
    setAvanceCantidad('');
    setDlgAvanceOpen(true);
  }

  async function registrarAvance() {
    if (!opSeleccionada || !avanceCantidad) return;
    setSavingAvance(true);
    try {
      await api.patch(`/rh/produccion/${opSeleccionada.id}/avance`, {
        cantidad: Number(avanceCantidad),
      });
      setDlgAvanceOpen(false);
      loadOrdenes();
    } catch { /* noop */ } finally { setSavingAvance(false); }
  }

  async function cerrarOp(op: OrdenProduccion) {
    try {
      await api.patch(`/rh/produccion/${op.id}/cerrar`, {});
      loadOrdenes();
    } catch { /* noop */ }
  }

  async function cancelarOp(op: OrdenProduccion) {
    if (!confirm(`¿Cancelar OP-${op.folio}?`)) return;
    try {
      await api.patch(`/rh/produccion/${op.id}/cancelar`, {});
      loadOrdenes();
    } catch { /* noop */ }
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <UserCog className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-heading font-semibold text-steel-900">Recursos Humanos</h1>
            <p className="text-body-sm text-steel-500">
              Empleados · Áreas · Asistencia · Producción
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-steel-100 p-1 rounded-lg w-fit">
        {([
          { key: 'empleados',  label: 'Empleados',  icon: <Users className="h-3.5 w-3.5" /> },
          { key: 'areas',      label: 'Áreas',      icon: <Layers className="h-3.5 w-3.5" /> },
          { key: 'asistencia', label: 'Asistencia', icon: <CalendarDays className="h-3.5 w-3.5" /> },
          { key: 'produccion', label: 'Producción', icon: <Factory className="h-3.5 w-3.5" /> },
          { key: 'nomina',     label: 'Nómina',     icon: <DollarSign className="h-3.5 w-3.5" /> },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-steel-900 shadow-sm'
                : 'text-steel-500 hover:text-steel-700'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ══════════════════════ TAB EMPLEADOS ══════════════════ */}
      {tab === 'empleados' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre o puesto…"
                value={empQ}
                onChange={(e) => setEmpQ(e.target.value)}
              />
            </div>
            <select
              value={empAreaId}
              onChange={(e) => setEmpAreaId(e.target.value)}
              className="h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white text-steel-700"
            >
              <option value="">Todas las áreas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
            <select
              value={empActivo}
              onChange={(e) => setEmpActivo(e.target.value)}
              className="h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white text-steel-700"
            >
              <option value="">Activos e inactivos</option>
              <option value="true">Solo activos</option>
              <option value="false">Solo inactivos</option>
            </select>
            {canWrite && (
              <Button size="sm" onClick={abrirNuevoEmp} className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Nuevo empleado
              </Button>
            )}
          </div>

          {loadingEmp ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-steel-400" />
            </div>
          ) : empleados.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="Sin empleados"
              description="Registra el primer empleado de la empresa."
            />
          ) : (
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2 border-b border-steel-100 text-meta font-medium text-steel-500 uppercase tracking-wide">
                <span>Empleado</span>
                <span>Área</span>
                <span>Salario diario</span>
                <span>Ingreso</span>
                <span />
              </div>
              {empleados.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 border-b border-steel-50 last:border-0 hover:bg-steel-50 transition-colors"
                >
                  <div>
                    <p className={`font-medium text-body-sm ${e.activo ? 'text-steel-900' : 'text-steel-400 line-through'}`}>
                      {e.apellidos} {e.nombre}
                    </p>
                    <p className="text-meta text-steel-500">{e.puesto}</p>
                    {e.usuario && (
                      <p className="text-meta text-steel-400">
                        Usuario: {e.usuario.nombre} ({e.usuario.rol})
                      </p>
                    )}
                  </div>
                  {e.area ? (
                    <div className="space-y-0.5">
                      <Badge variant={TIPO_PAGO_CONFIG[e.area.tipo_pago].variant}>
                        {e.area.nombre}
                      </Badge>
                      <p className="text-meta text-steel-400">
                        {e.area.tipo_pago === 'POR_HORA'
                          ? e.descuento_por_30min != null
                            ? `${fmtMoneda(e.descuento_por_30min)}/30 min`
                            : 'Sin sanción hora'
                          : e.sancion_por_pieza != null
                            ? `${fmtMoneda(e.sancion_por_pieza)}/pza · mín ${e.minimo_piezas_semana ?? '—'}/sem`
                            : 'Sin sanción pieza'
                        }
                      </p>
                    </div>
                  ) : (
                    <span className="text-meta text-steel-400">—</span>
                  )}
                  <span className="text-body-sm text-steel-700 font-mono">
                    {fmtMoneda(e.salario_diario)}
                  </span>
                  <span className="text-body-sm text-steel-500">
                    {fmtFecha(e.fecha_ingreso)}
                  </span>
                  <div className="flex items-center gap-1">
                    {canWrite && (
                      <button
                        onClick={() => abrirEditEmp(e)}
                        className="p-1.5 text-steel-400 hover:text-brand-600 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isAdminPlus && (
                      <button
                        onClick={() => toggleEmp(e)}
                        className={`p-1.5 transition-colors ${e.activo ? 'text-green-500 hover:text-red-500' : 'text-steel-300 hover:text-green-500'}`}
                        title={e.activo ? 'Desactivar' : 'Activar'}
                      >
                        {e.activo
                          ? <ToggleRight className="h-4 w-4" />
                          : <ToggleLeft className="h-4 w-4" />
                        }
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {empTotal > empleados.length && (
                <p className="text-center text-meta text-steel-400 py-3">
                  Mostrando {empleados.length} de {empTotal} empleados
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB ÁREAS ═══════════════════════ */}
      {tab === 'areas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-body-sm text-steel-500">
              {areas.length} área{areas.length !== 1 ? 's' : ''} registrada{areas.length !== 1 ? 's' : ''}
            </p>
            {isAdminPlus && (
              <Button size="sm" onClick={abrirNuevaArea} className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Nueva área
              </Button>
            )}
          </div>

          {areas.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-8 w-8" />}
              title="Sin áreas"
              description="Configura las áreas de trabajo y sus sanciones."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {areas.map((a) => (
                <div
                  key={a.id}
                  className={`bg-white rounded-xl border p-4 space-y-3 transition-opacity ${
                    !a.activa ? 'opacity-50 border-steel-100' : 'border-steel-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-steel-900">{a.nombre}</p>
                      <div className="mt-1">
                        <Badge variant={TIPO_PAGO_CONFIG[a.tipo_pago].variant}>
                          {TIPO_PAGO_CONFIG[a.tipo_pago].label}
                        </Badge>
                      </div>
                    </div>
                    {isAdminPlus && (
                      <div className="flex gap-0.5 shrink-0">
                        <button
                          onClick={() => abrirEditArea(a)}
                          className="p-1.5 text-steel-400 hover:text-brand-600 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleArea(a)}
                          className={`p-1.5 transition-colors ${
                            a.activa ? 'text-green-500 hover:text-red-500' : 'text-steel-300 hover:text-green-500'
                          }`}
                          title={a.activa ? 'Desactivar' : 'Activar'}
                        >
                          {a.activa ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-steel-100 pt-3 text-body-sm">
                    <p className="text-steel-400 text-meta">
                      Las sanciones se configuran por empleado.
                    </p>
                  </div>

                  {a._count != null && (
                    <p className="text-meta text-steel-400">
                      {a._count.empleados} empleado{a._count.empleados !== 1 ? 's' : ''} asignado{a._count.empleados !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB ASISTENCIA ════════════════ */}
      {tab === 'asistencia' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              type="date"
              value={asistFecha}
              onChange={(e) => setAsistFecha(e.target.value)}
              className="w-44"
            />
            <Input
              placeholder="ID empleado (filtro)…"
              value={asistEmp}
              onChange={(e) => setAsistEmp(e.target.value)}
              className="w-64"
            />
            {canWrite && (
              <Button size="sm" onClick={abrirNuevaAsist} className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" />
                Registrar asistencia
              </Button>
            )}
          </div>

          {loadingAsist ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-steel-400" />
            </div>
          ) : asistencias.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title="Sin registros"
              description="No hay asistencias para la fecha seleccionada."
            />
          ) : (
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 border-b border-steel-100 text-meta font-medium text-steel-500 uppercase tracking-wide">
                <span>Empleado</span>
                <span>Área</span>
                <span>Estatus</span>
                <span>Entrada / Salida</span>
                <span>Sanción</span>
                <span />
              </div>
              {asistencias.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 border-b border-steel-50 last:border-0 hover:bg-steel-50"
                >
                  <div>
                    <p className="font-medium text-body-sm text-steel-900">
                      {r.empleado ? `${r.empleado.apellidos} ${r.empleado.nombre}` : r.empleado_id}
                    </p>
                    <p className="text-meta text-steel-500">{r.empleado?.puesto}</p>
                  </div>
                  <span className="text-meta text-steel-600">
                    {r.area ? r.area.nombre : <span className="text-steel-400">—</span>}
                  </span>
                  <Badge variant={ASISTENCIA_CONFIG[r.estatus].variant}>
                    {ASISTENCIA_CONFIG[r.estatus].label}
                  </Badge>
                  <div className="text-body-sm text-steel-700 font-mono space-y-0.5">
                    <div>{fmtHora(r.hora_entrada)} → {fmtHora(r.hora_salida)}</div>
                    {r.minutos_tarde ? <div className="text-amber-600 text-meta">{r.minutos_tarde} min tarde</div> : null}
                    {r.piezas_realizadas != null ? <div className="text-blue-600 text-meta">{r.piezas_realizadas} pzs</div> : null}
                  </div>
                  <div>
                    {r.sancion_monto ? (
                      <div title={r.sancion_concepto ?? ''}>
                        <span className="text-red-600 font-semibold text-body-sm">-{formatPrecio(r.sancion_monto)}</span>
                      </div>
                    ) : <span className="text-steel-400 text-meta">—</span>}
                  </div>
                  <div className="flex items-center">
                    {canWrite && (
                      <button
                        onClick={() => abrirEditAsist(r)}
                        className="p-1.5 text-steel-400 hover:text-brand-600 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB NÓMINA ═══════════════════ */}
      {tab === 'nomina' && (
        <div className="space-y-4">
          {/* Filtros de período */}
          <div className="flex flex-wrap items-end gap-3 bg-white border border-steel-200 rounded-xl p-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-steel-400 uppercase tracking-[1px]">Desde</label>
              <input
                type="date"
                value={nominaDesde}
                onChange={(e) => setNominaDesde(e.target.value)}
                className="border border-steel-200 rounded-lg px-3 py-2 text-body-sm text-steel-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-steel-400 uppercase tracking-[1px]">Hasta</label>
              <input
                type="date"
                value={nominaHasta}
                onChange={(e) => setNominaHasta(e.target.value)}
                className="border border-steel-200 rounded-lg px-3 py-2 text-body-sm text-steel-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <Button size="sm" onClick={() => void loadNomina()} disabled={nominaLoading}>
              {nominaLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 mr-1.5" />}
              Calcular
            </Button>
            {nominaData && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={exportNomina}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                CSV
              </Button>
            )}
          </div>

          {nominaLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 text-brand-600 animate-spin" />
            </div>
          )}

          {nominaData && !nominaLoading && (
            <>
              {/* Total */}
              <div className="bg-brand-600 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-body-sm text-brand-200">Total nómina</p>
                  <p className="text-display-md font-bold text-white tabular-nums">
                    {formatPrecio(nominaData.total_nomina)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-body-sm text-brand-200">Período</p>
                  <p className="text-body font-medium text-white">{nominaData.desde} → {nominaData.hasta}</p>
                </div>
              </div>

              {/* Tabla */}
              <div className="bg-white border border-steel-200 rounded-xl overflow-hidden">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-steel-100 bg-steel-50">
                      <th className="px-4 py-2.5 text-left font-medium text-steel-500">Empleado</th>
                      <th className="px-4 py-2.5 text-right font-medium text-steel-500">Salario/día</th>
                      <th className="px-4 py-2.5 text-right font-medium text-steel-500">Días trab.</th>
                      <th className="px-4 py-2.5 text-right font-medium text-steel-500">Base</th>
                      <th className="px-4 py-2.5 text-right font-medium text-steel-500">Sanciones</th>
                      <th className="px-4 py-2.5 text-right font-medium text-steel-500">A pagar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-50">
                    {nominaData.empleados.map((e) => (
                      <tr key={e.empleado.id} className="hover:bg-steel-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-steel-900">{e.empleado.apellidos}, {e.empleado.nombre}</p>
                          <p className="text-meta text-steel-400">{e.empleado.puesto}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-steel-600">
                          {formatPrecio(e.empleado.salario_diario)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-steel-600">
                          {e.dias_trabajados} / {e.total_registros}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-steel-700">
                          {formatPrecio(e.salario_base)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                          {e.total_sanciones > 0 ? `-${formatPrecio(e.total_sanciones)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-steel-900">
                          {formatPrecio(e.total_a_pagar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-steel-200 bg-steel-50">
                      <td className="px-4 py-2.5 font-semibold text-steel-700" colSpan={5}>Total nómina</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-brand-700">
                        {formatPrecio(nominaData.total_nomina)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {!nominaData && !nominaLoading && (
            <div className="text-center py-12 text-body-sm text-steel-400">
              Selecciona el período y presiona Calcular
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB PRODUCCIÓN ════════════════ */}
      {tab === 'produccion' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Filtros de estatus */}
            <div className="flex gap-1">
              {[{ value: '', label: 'Todas' }, ...ESTATUSES_PRODUCCION.map((s) => ({
                value: s, label: PRODUCCION_CONFIG[s].label,
              }))].map((f) => (
                <button
                  key={f.value}
                  onClick={() => setOpEstatus(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-body-sm font-medium transition-colors ${
                    opEstatus === f.value
                      ? 'bg-brand-600 text-white'
                      : 'bg-steel-100 text-steel-600 hover:bg-steel-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {canManufact && (
              <Button size="sm" onClick={abrirNuevaOp} className="flex items-center gap-1.5 ml-auto">
                <Plus className="h-4 w-4" />
                Nueva orden
              </Button>
            )}
          </div>

          {loadingOp ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-steel-400" />
            </div>
          ) : ordenes.length === 0 ? (
            <EmptyState
              icon={<Factory className="h-8 w-8" />}
              title="Sin órdenes de producción"
              description="Crea una nueva orden para iniciar producción."
            />
          ) : (
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
              <div className="grid grid-cols-[80px_2fr_2fr_1fr_1fr_auto] gap-4 px-4 py-2 border-b border-steel-100 text-meta font-medium text-steel-500 uppercase tracking-wide">
                <span>Folio</span>
                <span>Artículo</span>
                <span>Progreso</span>
                <span>Estatus</span>
                <span>Inicio</span>
                <span />
              </div>
              {ordenes.map((op) => (
                <div
                  key={op.id}
                  className="grid grid-cols-[80px_2fr_2fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 border-b border-steel-50 last:border-0 hover:bg-steel-50 transition-colors"
                >
                  <span
                    className="font-mono text-brand-700 font-semibold text-body-sm cursor-pointer hover:underline"
                    onClick={() => { setOpDetalle(op); setDlgOpDetalle(true); }}
                  >
                    OP-{String(op.folio).padStart(4, '0')}
                  </span>
                  <div>
                    <p className="font-medium text-body-sm text-steel-900">
                      {op.articulo?.descripcion_1 ?? op.articulo_id}
                    </p>
                    <p className="text-meta text-steel-500 font-mono">
                      {op.articulo?.clave} · Exist.{op.existencia_num}
                    </p>
                  </div>
                  <ProgressBar producida={op.cantidad_producida} objetivo={op.cantidad_objetivo} />
                  <Badge variant={PRODUCCION_CONFIG[op.estatus].variant}>
                    {PRODUCCION_CONFIG[op.estatus].label}
                  </Badge>
                  <span className="text-body-sm text-steel-500">
                    {fmtFecha(op.fecha_inicio)}
                  </span>
                  <div className="flex items-center gap-1">
                    {canAvance && (op.estatus === 'ABIERTA' || op.estatus === 'EN_PROCESO') && (
                      <button
                        onClick={() => abrirAvance(op)}
                        className="p-1.5 text-steel-400 hover:text-brand-600 transition-colors"
                        title="Registrar avance"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canManufact && (op.estatus === 'ABIERTA' || op.estatus === 'EN_PROCESO') && (
                      <button
                        onClick={() => cerrarOp(op)}
                        className="p-1.5 text-steel-400 hover:text-green-600 transition-colors"
                        title="Completar OP"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isAdminPlus && op.estatus !== 'COMPLETADA' && op.estatus !== 'CANCELADA' && (
                      <button
                        onClick={() => cancelarOp(op)}
                        className="p-1.5 text-steel-400 hover:text-red-500 transition-colors"
                        title="Cancelar OP"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════ DIALOGS ════════════ */}

      {/* Dialog — Área crear/editar */}
      <Dialog
        open={dlgAreaOpen}
        onClose={() => setDlgAreaOpen(false)}
        title={editArea ? 'Editar área' : 'Nueva área'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Nombre *</label>
            <Input
              value={areaForm.nombre}
              onChange={(e) => setAreaForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej. Corte, Troquel, Ensamble…"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Tipo de pago *</label>
            <select
              value={areaForm.tipo_pago}
              onChange={(e) => setAreaForm((f) => ({ ...f, tipo_pago: e.target.value as TipoPago }))}
              className="w-full h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white"
            >
              <option value="POR_HORA">Por hora</option>
              <option value="POR_PIEZA">Por pieza</option>
            </select>
          </div>

          <p className="text-meta text-steel-400">
            Las sanciones se configuran individualmente en cada empleado asignado a esta área.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDlgAreaOpen(false)}>Cancelar</Button>
          <Button
            onClick={guardarArea}
            disabled={savingArea || !areaForm.nombre}
          >
            {savingArea && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editArea ? 'Guardar cambios' : 'Crear área'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog — Empleado crear/editar */}
      <Dialog
        open={dlgEmpOpen}
        onClose={() => setDlgEmpOpen(false)}
        title={editEmp ? 'Editar empleado' : 'Nuevo empleado'}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Nombre *</label>
            <Input
              value={empForm.nombre}
              onChange={(e) => setEmpForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre(s)"
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Apellidos *</label>
            <Input
              value={empForm.apellidos}
              onChange={(e) => setEmpForm((f) => ({ ...f, apellidos: e.target.value }))}
              placeholder="Apellido Paterno Materno"
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Puesto *</label>
            <Input
              value={empForm.puesto}
              onChange={(e) => setEmpForm((f) => ({ ...f, puesto: e.target.value }))}
              placeholder="Ej. Operador de torno"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Área</label>
            <select
              value={empForm.area_id}
              onChange={(e) => setEmpForm((f) => ({ ...f, area_id: e.target.value }))}
              className="w-full h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white"
            >
              <option value="">Sin área asignada</option>
              {areas.filter((a) => a.activa).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre} — {TIPO_PAGO_CONFIG[a.tipo_pago].label}
                </option>
              ))}
            </select>
          </div>

          {/* Sanciones: se muestran según el tipo del área seleccionada */}
          {(() => {
            const areaInfo = areas.find((a) => a.id === empForm.area_id);
            const tipoPago = areaInfo?.tipo_pago;
            if (!tipoPago) return null;
            return (
              <div className="col-span-2 border border-steel-100 rounded-lg p-3 space-y-3 bg-steel-50">
                <p className="text-body-sm font-medium text-steel-700">
                  Sanciones — <span className="text-steel-500 font-normal">{areaInfo!.nombre} ({TIPO_PAGO_CONFIG[tipoPago].label})</span>
                </p>
                {tipoPago === 'POR_HORA' ? (
                  <div>
                    <label className="block text-body-sm font-medium text-steel-700 mb-1">
                      Descuento por cada 30 min de tardanza
                      <span className="text-steel-400 font-normal ml-1">(MXN)</span>
                    </label>
                    <Input
                      type="number" min="0" step="0.50"
                      value={empForm.descuento_por_30min}
                      onChange={(e) => setEmpForm((f) => ({ ...f, descuento_por_30min: e.target.value }))}
                      placeholder="Ej. 25.00"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-body-sm font-medium text-steel-700 mb-1">Mínimo piezas / semana</label>
                      <Input
                        type="number" min="1" step="1"
                        value={empForm.minimo_piezas_semana}
                        onChange={(e) => setEmpForm((f) => ({ ...f, minimo_piezas_semana: e.target.value }))}
                        placeholder="Ej. 200"
                      />
                    </div>
                    <div>
                      <label className="block text-body-sm font-medium text-steel-700 mb-1">
                        Sanción / pieza faltante
                        <span className="text-steel-400 font-normal ml-1">(MXN)</span>
                      </label>
                      <Input
                        type="number" min="0" step="0.50"
                        value={empForm.sancion_por_pieza}
                        onChange={(e) => setEmpForm((f) => ({ ...f, sancion_por_pieza: e.target.value }))}
                        placeholder="Ej. 5.00"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Salario diario *</label>
            <Input
              type="number" min="0" step="0.01"
              value={empForm.salario_diario}
              onChange={(e) => setEmpForm((f) => ({ ...f, salario_diario: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Fecha de ingreso *</label>
            <Input
              type="date"
              value={empForm.fecha_ingreso}
              onChange={(e) => setEmpForm((f) => ({ ...f, fecha_ingreso: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Teléfono</label>
            <Input
              value={empForm.telefono}
              onChange={(e) => setEmpForm((f) => ({ ...f, telefono: e.target.value }))}
              placeholder="10 dígitos"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-body-sm font-medium text-steel-700 mb-1">
              Usuario del sistema <span className="text-steel-400 font-normal">(opcional)</span>
            </label>
            <Input
              value={empForm.usuario_id}
              onChange={(e) => setEmpForm((f) => ({ ...f, usuario_id: e.target.value }))}
              placeholder="ID del usuario (déjalo vacío si no tiene cuenta)"
            />
            <p className="text-meta text-steel-400 mt-1">
              No todos los empleados tienen cuenta en el sistema. El admin/encargado no es necesariamente empleado.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDlgEmpOpen(false)}>Cancelar</Button>
          <Button
            onClick={guardarEmpleado}
            disabled={savingEmp || !empForm.nombre || !empForm.apellidos || !empForm.puesto || !empForm.salario_diario}
          >
            {savingEmp && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editEmp ? 'Guardar cambios' : 'Crear empleado'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog — Asistencia crear/editar */}
      <Dialog
        open={dlgAsistOpen}
        onClose={() => setDlgAsistOpen(false)}
        title={editAsist ? 'Editar asistencia' : 'Registrar asistencia'}
        size="md"
      >
        <div className="space-y-4">
          {!editAsist && (
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">Empleado *</label>
              <EmpleadoSearch value={asistEmpleado} onChange={setAsistEmpleado} />
            </div>
          )}
          {editAsist && (
            <div className="px-3 py-2 bg-steel-50 rounded-lg text-body-sm text-steel-700">
              <span className="font-medium">
                {editAsist.empleado
                  ? `${editAsist.empleado.apellidos} ${editAsist.empleado.nombre}`
                  : editAsist.empleado_id}
              </span>
              <span className="ml-2 text-steel-500">
                — {fmtFecha(editAsist.fecha)}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {!editAsist && (
              <div>
                <label className="block text-body-sm font-medium text-steel-700 mb-1">Fecha *</label>
                <Input
                  type="date"
                  value={asistForm.fecha}
                  onChange={(e) => setAsistForm((f) => ({ ...f, fecha: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">Estatus *</label>
              <select
                value={asistForm.estatus}
                onChange={(e) => setAsistForm((f) => ({ ...f, estatus: e.target.value as EstatusAsistencia }))}
                className="w-full h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white"
              >
                {ESTATUSES_ASISTENCIA.map((s) => (
                  <option key={s} value={s}>{ASISTENCIA_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-body-sm font-medium text-steel-700 mb-1">
                Área <span className="text-steel-400 font-normal">(sobreescribe el área del empleado)</span>
              </label>
              <select
                value={asistForm.area_id}
                onChange={(e) => setAsistForm((f) => ({ ...f, area_id: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white"
              >
                <option value="">Área del empleado (por defecto)</option>
                {areas.filter((a) => a.activa).map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre} — {TIPO_PAGO_CONFIG[a.tipo_pago].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">Hora entrada</label>
              <Input
                type="datetime-local"
                value={asistForm.hora_entrada}
                onChange={(e) => setAsistForm((f) => ({ ...f, hora_entrada: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">Hora salida</label>
              <Input
                type="datetime-local"
                value={asistForm.hora_salida}
                onChange={(e) => setAsistForm((f) => ({ ...f, hora_salida: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">
                Minutos tarde <span className="text-steel-400 text-meta">(calcula sanción POR_HORA)</span>
              </label>
              <Input
                type="number" min="0" step="1"
                value={asistForm.minutos_tarde}
                onChange={(e) => setAsistForm((f) => ({ ...f, minutos_tarde: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">
                Piezas realizadas <span className="text-steel-400 text-meta">(áreas POR_PIEZA)</span>
              </label>
              <Input
                type="number" min="0" step="1"
                value={asistForm.piezas_realizadas}
                onChange={(e) => setAsistForm((f) => ({ ...f, piezas_realizadas: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Observaciones</label>
            <Input
              value={asistForm.observaciones}
              onChange={(e) => setAsistForm((f) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDlgAsistOpen(false)}>Cancelar</Button>
          <Button
            onClick={guardarAsistencia}
            disabled={savingAsist || (!editAsist && !asistEmpleado)}
          >
            {savingAsist && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editAsist ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog — Nueva OP */}
      <Dialog
        open={dlgOpOpen}
        onClose={() => setDlgOpOpen(false)}
        title="Nueva orden de producción"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Artículo a producir *</label>
            <ArticuloSearch value={opArticulo} onChange={setOpArticulo} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">Slot de existencia *</label>
              <select
                value={opForm.existencia_num}
                onChange={(e) => setOpForm((f) => ({ ...f, existencia_num: Number(e.target.value) }))}
                className="w-full h-9 px-3 rounded-lg border border-steel-200 text-body-sm bg-white"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>Existencia {n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">Cantidad objetivo *</label>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={opForm.cantidad_objetivo}
                onChange={(e) => setOpForm((f) => ({ ...f, cantidad_objetivo: e.target.value }))}
                placeholder="0.000"
              />
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">Fecha de inicio *</label>
              <Input
                type="date"
                value={opForm.fecha_inicio}
                onChange={(e) => setOpForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-body-sm font-medium text-steel-700 mb-1">Observaciones</label>
            <Input
              value={opForm.observaciones}
              onChange={(e) => setOpForm((f) => ({ ...f, observaciones: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDlgOpOpen(false)}>Cancelar</Button>
          <Button
            onClick={crearOrdenProduccion}
            disabled={savingOp || !opArticulo || !opForm.cantidad_objetivo}
          >
            {savingOp && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Crear orden
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog — Registrar avance */}
      <Dialog
        open={dlgAvanceOpen}
        onClose={() => setDlgAvanceOpen(false)}
        title="Registrar avance de producción"
        size="sm"
      >
        {opSeleccionada && (
          <div className="space-y-4">
            <div className="px-3 py-3 bg-steel-50 rounded-lg space-y-2">
              <p className="text-body-sm font-medium text-steel-900">
                OP-{String(opSeleccionada.folio).padStart(4, '0')} — {opSeleccionada.articulo?.descripcion_1 ?? ''}
              </p>
              <ProgressBar
                producida={opSeleccionada.cantidad_producida}
                objetivo={opSeleccionada.cantidad_objetivo}
              />
              <p className="text-meta text-steel-500">
                Pendiente: {(opSeleccionada.cantidad_objetivo - opSeleccionada.cantidad_producida).toFixed(3)}
              </p>
            </div>
            <div>
              <label className="block text-body-sm font-medium text-steel-700 mb-1">
                Cantidad producida en este lote *
              </label>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={avanceCantidad}
                onChange={(e) => setAvanceCantidad(e.target.value)}
                placeholder="0.000"
                autoFocus
              />
              <p className="text-meta text-steel-400 mt-1">
                Se creará una Entrada de inventario en Existencia {opSeleccionada.existencia_num}.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDlgAvanceOpen(false)}>Cancelar</Button>
          <Button
            onClick={registrarAvance}
            disabled={savingAvance || !avanceCantidad || Number(avanceCantidad) <= 0}
          >
            {savingAvance && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Registrar avance
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Dialog — Detalle OP */}
      <Dialog
        open={dlgOpDetalle}
        onClose={() => setDlgOpDetalle(false)}
        title={opDetalle ? `OP-${String(opDetalle.folio).padStart(4, '0')}` : 'Detalle'}
        size="md"
      >
        {opDetalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-meta text-steel-500 mb-0.5">Artículo</p>
                <p className="text-body-sm font-medium text-steel-900">{opDetalle.articulo?.descripcion_1 ?? ''}</p>
                <p className="text-meta text-steel-500 font-mono">{opDetalle.articulo?.clave}</p>
              </div>
              <div>
                <p className="text-meta text-steel-500 mb-0.5">Estatus</p>
                <Badge variant={PRODUCCION_CONFIG[opDetalle.estatus].variant}>
                  {PRODUCCION_CONFIG[opDetalle.estatus].label}
                </Badge>
              </div>
              <div>
                <p className="text-meta text-steel-500 mb-0.5">Objetivo</p>
                <p className="text-body-sm font-medium">{opDetalle.cantidad_objetivo}</p>
              </div>
              <div>
                <p className="text-meta text-steel-500 mb-0.5">Producido</p>
                <p className="text-body-sm font-medium">{opDetalle.cantidad_producida}</p>
              </div>
              <div>
                <p className="text-meta text-steel-500 mb-0.5">Slot existencia</p>
                <p className="text-body-sm">Existencia {opDetalle.existencia_num}</p>
              </div>
              <div>
                <p className="text-meta text-steel-500 mb-0.5">Fecha inicio</p>
                <p className="text-body-sm">{fmtFecha(opDetalle.fecha_inicio)}</p>
              </div>
              {opDetalle.fecha_cierre && (
                <div>
                  <p className="text-meta text-steel-500 mb-0.5">Fecha cierre</p>
                  <p className="text-body-sm">{fmtFecha(opDetalle.fecha_cierre)}</p>
                </div>
              )}
              {opDetalle.observaciones && (
                <div className="col-span-2">
                  <p className="text-meta text-steel-500 mb-0.5">Observaciones</p>
                  <p className="text-body-sm">{opDetalle.observaciones}</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-meta text-steel-500 mb-1">Progreso</p>
              <ProgressBar producida={opDetalle.cantidad_producida} objetivo={opDetalle.cantidad_objetivo} />
            </div>
            {opDetalle.usuario && (
              <p className="text-meta text-steel-400">
                Creada por {opDetalle.usuario.nombre} {opDetalle.usuario.apellidos}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDlgOpDetalle(false)}>Cerrar</Button>
          {opDetalle && canAvance && (opDetalle.estatus === 'ABIERTA' || opDetalle.estatus === 'EN_PROCESO') && (
            <Button onClick={() => { setDlgOpDetalle(false); abrirAvance(opDetalle); }}>
              <TrendingUp className="h-4 w-4 mr-1" />
              Registrar avance
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </div>
  );
}
