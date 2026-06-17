'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Users, Columns3, DatabaseZap, Printer, Shield, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/store/auth.store';

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { usuario } = useAuthStore();

  const isAdmin       = usuario?.rol === 'ADMIN';
  const isSuperUsuario = usuario?.rol === 'SUPER_USUARIO';

  if (!usuario || (!isAdmin && !isSuperUsuario)) {
    return <div className="min-h-full">{children}</div>;
  }

  const miEmpresaHref = usuario.empresa_id
    ? `/configuracion/empresas/${usuario.empresa_id}`
    : '/configuracion/empresas';

  const TABS = [
    {
      href: miEmpresaHref,
      matchPrefix: '/configuracion/empresas',
      label: 'Mi Empresa',
      icon: <Building2 className="h-3.5 w-3.5" />,
    },
    {
      href: '/configuracion/usuarios',
      matchPrefix: '/configuracion/usuarios',
      label: 'Usuarios',
      icon: <Users className="h-3.5 w-3.5" />,
    },
    {
      href: '/configuracion/inventario',
      matchPrefix: '/configuracion/inventario',
      label: 'Inventario',
      icon: <Columns3 className="h-3.5 w-3.5" />,
    },
    {
      href: '/configuracion/migracion',
      matchPrefix: '/configuracion/migracion',
      label: 'Migración',
      icon: <DatabaseZap className="h-3.5 w-3.5" />,
    },
    {
      href: '/configuracion/ticketera',
      matchPrefix: '/configuracion/ticketera',
      label: 'Ticketera',
      icon: <Printer className="h-3.5 w-3.5" />,
    },
    {
      href: '/configuracion/auditoria',
      matchPrefix: '/configuracion/auditoria',
      label: 'Auditoría',
      icon: <Shield className="h-3.5 w-3.5" />,
    },
    {
      href: '/configuracion/sistema',
      matchPrefix: '/configuracion/sistema',
      label: 'Sistema',
      icon: <Database className="h-3.5 w-3.5" />,
    },
  ];

  // En la pantalla de columnas ocultamos la sub-nav (tiene su propio breadcrumb)
  const isColumnasPage = pathname.includes('/configuracion/columnas/');

  return (
    <div className="min-h-full">
      {!isColumnasPage && (
        <div className="bg-white border-b border-steel-200 px-8">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => {
              const isActive =
                pathname === tab.matchPrefix ||
                pathname.startsWith(`${tab.matchPrefix}/`);
              return (
                <Link
                  key={tab.matchPrefix}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-body-sm font-medium border-b-2 transition-colors',
                    isActive
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-steel-500 hover:text-steel-900 hover:border-steel-300',
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
      {children}
    </div>
  );
}
