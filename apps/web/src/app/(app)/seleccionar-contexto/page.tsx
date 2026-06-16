'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import type { Empresa, Ubicacion } from '@/lib/types/api';
import { Wordmark } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';

export default function SeleccionarContextoPage() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const { setContexto } = useContextoStore();

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  const isSuperUsuario = usuario?.rol === 'SUPER_USUARIO';

  useEffect(() => {
    async function load() {
      try {
        if (isSuperUsuario) {
          const all = await api.get<Empresa[]>('/empresas');
          setEmpresas(all.filter((e) => e.activa));
        } else if (usuario?.empresa_id) {
          const emp = await api.get<Empresa>(`/empresas/${usuario.empresa_id}`);
          setEmpresas([emp]);
          setSelectedEmpresa(emp);
          const ubs = await api.get<Ubicacion[]>(`/empresas/${emp.id}/ubicaciones`);
          setUbicaciones(ubs.filter((u) => u.activa));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSelectEmpresa(emp: Empresa) {
    setSelectedEmpresa(emp);
    const ubs = await api.get<Ubicacion[]>(`/empresas/${emp.id}/ubicaciones`);
    setUbicaciones(ubs.filter((u) => u.activa));
  }

  function handleSelectUbicacion(ub: Ubicacion) {
    if (!selectedEmpresa) return;
    setContexto(
      { id: selectedEmpresa.id, nombre: selectedEmpresa.nombre, logo_url: selectedEmpresa.logo_url },
      { id: ub.id, nombre: ub.nombre, tipo: ub.tipo, logo_url: ub.logo_url },
    );
    router.replace('/dashboard');
  }

  return (
    <div className="min-h-screen bg-steel-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center mb-3">
            <span className="text-white font-bold text-sm">EMF</span>
          </div>
          <Wordmark />
          <p className="text-body-sm text-steel-500 mt-1">Selecciona con qué empresa trabajarás hoy</p>
        </div>

        <div className="bg-white border border-steel-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-steel-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Paso 1: empresa (solo si hay más de una o es SUPER) */}
              {(empresas.length > 1 || isSuperUsuario) && !selectedEmpresa && (
                <div>
                  <div className="px-5 py-3 border-b border-steel-100">
                    <p className="text-table-header text-steel-500 uppercase tracking-widest">
                      Empresa
                    </p>
                  </div>
                  <div className="divide-y divide-steel-50">
                    {empresas.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => handleSelectEmpresa(emp)}
                        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-steel-50 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-brand-600/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-4 w-4 text-brand-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-body font-semibold text-steel-900">{emp.nombre}</p>
                          <p className="text-body-sm text-steel-500">{emp.razon_social}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-steel-300" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Paso 2: ubicación */}
              {selectedEmpresa && (
                <div>
                  <div className="px-5 py-3 border-b border-steel-100 flex items-center gap-2">
                    {(empresas.length > 1 || isSuperUsuario) && (
                      <button
                        onClick={() => { setSelectedEmpresa(null); setUbicaciones([]); }}
                        className="text-steel-400 hover:text-brand-600 transition-colors text-body-sm"
                      >
                        ← {selectedEmpresa.nombre}
                      </button>
                    )}
                    {empresas.length <= 1 && (
                      <p className="text-table-header text-steel-500 uppercase tracking-widest">
                        Ubicación — {selectedEmpresa.nombre}
                      </p>
                    )}
                  </div>
                  {ubicaciones.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-body text-steel-500">Esta empresa no tiene ubicaciones activas.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-steel-50" data-testid="ubicaciones-list">
                      {ubicaciones.map((ub) => (
                        <button
                          key={ub.id}
                          onClick={() => handleSelectUbicacion(ub)}
                          data-testid={`ubicacion-${ub.id}`}
                          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-brand-600 hover:text-white group transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-steel-100 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 transition-colors">
                            <MapPin className="h-4 w-4 text-steel-500 group-hover:text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-body font-semibold text-steel-900 group-hover:text-white">
                              {ub.nombre}
                            </p>
                            <p className="text-body-sm text-steel-500 group-hover:text-white/70">
                              {ub.tipo === 'MATRIZ' ? 'Matriz' : ub.tipo === 'FABRICA' ? 'Fábrica' : 'Punto de Venta'}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-steel-300 group-hover:text-white" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-meta text-steel-400 mt-6">
          {usuario?.nombre} {usuario?.apellidos} · {usuario?.rol?.toLowerCase().replace('_', ' ')}
        </p>
      </div>
    </div>
  );
}
