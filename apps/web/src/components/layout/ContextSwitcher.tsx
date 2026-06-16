'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, Check, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { Empresa, Ubicacion } from '@/lib/types/api';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TIPO_LABEL: Record<string, string> = {
  MATRIZ: 'Matriz',
  FABRICA: 'Fábrica',
  PUNTO_VENTA: 'P. Venta',
};

export function ContextSwitcher({ open, onClose }: Props) {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { empresa: ctxEmpresa, ubicacion: ctxUbicacion, setContexto } = useContextoStore();

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [ubicacionesPorEmpresa, setUbicacionesPorEmpresa] = useState<Record<string, Ubicacion[]>>({});
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(false);

  const isSuperUsuario = usuario?.rol === 'SUPER_USUARIO';

  useEffect(() => {
    if (!open) return;
    loadEmpresas();
  }, [open]);

  async function loadEmpresas() {
    setLoading(true);
    try {
      if (isSuperUsuario) {
        const all = await api.get<Empresa[]>('/empresas');
        setEmpresas(all.filter((e) => e.activa));
        // Pre-carga ubicaciones de la empresa actual
        if (ctxEmpresa) {
          await loadUbicaciones(ctxEmpresa.id);
          setSelectedEmpresa(all.find((e) => e.id === ctxEmpresa.id) ?? null);
        }
      } else {
        // No-super: solo su empresa
        if (!usuario?.empresa_id) return;
        const emp = await api.get<Empresa>(`/empresas/${usuario.empresa_id}`);
        setEmpresas([emp]);
        setSelectedEmpresa(emp);
        await loadUbicaciones(emp.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadUbicaciones(empresaId: string) {
    if (ubicacionesPorEmpresa[empresaId]) return;
    const ubs = await api.get<Ubicacion[]>(`/empresas/${empresaId}/ubicaciones`);
    setUbicacionesPorEmpresa((prev) => ({ ...prev, [empresaId]: ubs.filter((u) => u.activa) }));
  }

  async function handleSelectEmpresa(emp: Empresa) {
    setSelectedEmpresa(emp);
    await loadUbicaciones(emp.id);
  }

  function handleSelectUbicacion(ub: Ubicacion) {
    if (!selectedEmpresa) return;
    setContexto(
      { id: selectedEmpresa.id, nombre: selectedEmpresa.nombre, logo_url: selectedEmpresa.logo_url },
      {
        id: ub.id,
        nombre: ub.nombre,
        tipo: ub.tipo,
        logo_url: ub.logo_url,
        razon_social: ub.razon_social,
        rfc: ub.rfc,
        telefono: ub.telefono,
        calle: ub.calle,
        num_ext: ub.num_ext,
        num_int: ub.num_int,
        colonia: ub.colonia,
        municipio: ub.municipio,
        estado: ub.estado,
        cp: ub.cp,
      },
    );
    onClose();
    router.refresh();
  }

  if (!open) return null;

  const ubicaciones = selectedEmpresa ? (ubicacionesPorEmpresa[selectedEmpresa.id] ?? []) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-steel-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-xl border border-steel-200 w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-steel-100">
          <h2 className="text-display-sm font-bold text-steel-900">Cambiar contexto</h2>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-steel-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Selector de empresa (visible para SUPER_USUARIO o si hay más de 1) */}
              {empresas.length > 1 && (
                <div>
                  <p className="text-table-header text-steel-400 uppercase tracking-widest mb-2">
                    Empresa
                  </p>
                  <div className="space-y-1">
                    {empresas.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => handleSelectEmpresa(emp)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                          selectedEmpresa?.id === emp.id
                            ? 'bg-brand-600/10 text-brand-600'
                            : 'hover:bg-steel-50 text-steel-900',
                        )}
                      >
                        <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-body font-medium flex-1">{emp.nombre}</span>
                        {selectedEmpresa?.id === emp.id && (
                          <Check className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ubicaciones de la empresa seleccionada */}
              {selectedEmpresa && (
                <div>
                  <p className="text-table-header text-steel-400 uppercase tracking-widest mb-2">
                    Ubicación
                  </p>
                  {ubicaciones.length === 0 ? (
                    <p className="text-body-sm text-steel-400 px-3">Sin ubicaciones activas</p>
                  ) : (
                    <div className="space-y-1">
                      {ubicaciones.map((ub) => {
                        const isActive =
                          ctxUbicacion?.id === ub.id && ctxEmpresa?.id === selectedEmpresa.id;
                        return (
                          <button
                            key={ub.id}
                            onClick={() => handleSelectUbicacion(ub)}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                              isActive
                                ? 'bg-brand-600 text-white'
                                : 'hover:bg-steel-50 text-steel-900',
                            )}
                          >
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-body font-medium truncate">{ub.nombre}</p>
                              <p
                                className={cn(
                                  'text-meta',
                                  isActive ? 'text-white/70' : 'text-steel-500',
                                )}
                              >
                                {TIPO_LABEL[ub.tipo]}
                              </p>
                            </div>
                            {isActive && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
