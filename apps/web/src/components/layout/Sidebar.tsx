'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ArrowUpFromLine,
  Users,
  ClipboardList,
  UserCog,
  BarChart3,
  Settings,
  LogOut,
  ChevronsUpDown,
  Calculator,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Wordmark } from '@/components/brand/Logo';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { ContextSwitcher } from './ContextSwitcher';
import type { RolUsuario } from '@/lib/store/auth.store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: RolUsuario[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
    roles: ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR', 'ALMACENISTA', 'JEFE_MANUFACTURA', 'JEFE_RH'],
  },
  // SUPER_USUARIO: solo historial (sin alta), VENDEDOR: solo captura
  {
    href: '/ventas',
    label: 'Ventas',
    icon: <ShoppingCart className="h-4 w-4" />,
    roles: ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR'],
  },
  // ALMACENISTA y JEFE_MANUFACTURA gestionan inventario; SUPER_USUARIO no
  {
    href: '/inventario',
    label: 'Inventario',
    icon: <Package className="h-4 w-4" />,
    roles: ['ADMIN', 'ENCARGADO', 'ALMACENISTA', 'JEFE_MANUFACTURA'],
  },
  {
    href: '/movimientos',
    label: 'Movimientos',
    icon: <ArrowUpFromLine className="h-4 w-4" />,
    roles: ['ADMIN', 'ENCARGADO', 'ALMACENISTA', 'JEFE_MANUFACTURA'],
  },
  // Clientes y Compras: operación diaria, no para SUPER ni roles de almacén/manufactura
  {
    href: '/ventas/clientes',
    label: 'Clientes',
    icon: <Users className="h-4 w-4" />,
    roles: ['ADMIN', 'ENCARGADO'],
  },
  {
    href: '/ventas/corte-caja',
    label: 'Corte de Caja',
    icon: <Calculator className="h-4 w-4" />,
    roles: ['ADMIN', 'ENCARGADO'],
  },
  {
    href: '/compras',
    label: 'Compras',
    icon: <ClipboardList className="h-4 w-4" />,
    roles: ['ADMIN', 'ENCARGADO'],
  },
  // RH: solo ADMIN gestiona empleados; JEFE_RH opera el módulo
  {
    href: '/rh',
    label: 'RH',
    icon: <UserCog className="h-4 w-4" />,
    roles: ['ADMIN', 'JEFE_RH'],
  },
  {
    href: '/reportes',
    label: 'Reportes',
    icon: <BarChart3 className="h-4 w-4" />,
    roles: ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'],
  },
  {
    href: '/historial-legacy',
    label: 'Historial Legacy',
    icon: <History className="h-4 w-4" />,
    roles: ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO'],
  },
  // Configuración: exclusivo ADMIN (usuarios, inventario parametrizable, precios)
  {
    href: '/configuracion',
    label: 'Configuración',
    icon: <Settings className="h-4 w-4" />,
    roles: ['ADMIN'],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, clearAuth } = useAuthStore();
  const { empresa, ubicacion, clearContexto } = useContextoStore();

  function handleLogout() {
    clearAuth();
    clearContexto();
    router.push('/login');
  }
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter(
    (item) => usuario && item.roles.includes(usuario.rol),
  );

  const nombreCompleto = usuario ? `${usuario.nombre} ${usuario.apellidos}` : '';

  return (
    <aside className="w-56 bg-steel-900 h-screen flex flex-col sticky top-0 flex-shrink-0">
      {/* Empresa + ubicación activa */}
      <div className="px-4 py-4 border-b border-steel-700">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-[9px]">EMF</span>
          </div>
          <Wordmark dark />
        </div>
        {empresa && (
          <button
            onClick={() => setSwitcherOpen(true)}
            data-testid="context-switcher-btn"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-steel-800 text-left mt-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-white text-body-sm font-medium truncate">{empresa.nombre}</p>
              <p className="text-steel-500 text-meta truncate">
                {ubicacion?.nombre ?? 'Sin ubicación'}
              </p>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-steel-500 flex-shrink-0" />
          </button>
        )}
        <ContextSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-body transition-colors',
                isActive
                  ? 'bg-brand-600 text-white font-medium'
                  : 'text-steel-400 hover:bg-steel-800 hover:text-white',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Usuario activo */}
      <div className="px-4 py-3 border-t border-steel-700">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-steel-700 flex items-center justify-center flex-shrink-0">
            <span className="text-steel-300 text-meta font-semibold">
              {usuario?.nombre?.charAt(0) ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-body-sm font-medium truncate">{nombreCompleto}</p>
            <p className="text-steel-500 text-meta truncate capitalize">
              {usuario?.rol?.toLowerCase().replace('_', ' ') ?? ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-steel-500 hover:text-white transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
