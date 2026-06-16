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
  Menu,
  X,
  Search,
  Truck,
  PackageCheck,
  MonitorDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmpresaLogo } from '@/components/brand/Logo';
import { useAuthStore } from '@/lib/store/auth.store';
import { useContextoStore } from '@/lib/store/contexto.store';
import { ContextSwitcher } from './ContextSwitcher';
import { NotificacionesPanel } from '@/components/global/NotificacionesPanel';
import { GlobalSearch } from '@/components/global/GlobalSearch';
import { usePwaInstall } from '@/lib/pwa/use-pwa-install';
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
  {
    href: '/ventas',
    label: 'Ventas',
    icon: <ShoppingCart className="h-4 w-4" />,
    roles: ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'VENDEDOR'],
  },
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
  {
    href: '/movimientos/remisiones',
    label: 'Remisiones',
    icon: <Truck className="h-4 w-4" />,
    roles: ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA'],
  },
  {
    href: '/movimientos/recibir',
    label: 'Recibir',
    icon: <PackageCheck className="h-4 w-4" />,
    roles: ['SUPER_USUARIO', 'ADMIN', 'ENCARGADO', 'ALMACENISTA'],
  },
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
  {
    href: '/configuracion',
    label: 'Configuración',
    icon: <Settings className="h-4 w-4" />,
    roles: ['ADMIN', 'SUPER_USUARIO'],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, clearAuth } = useAuthStore();
  const { empresa, ubicacion, clearContexto } = useContextoStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { canInstall, install } = usePwaInstall();

  function handleLogout() {
    clearAuth();
    clearContexto();
    router.push('/login');
  }

  function handleNavClick() {
    setMobileOpen(false);
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => usuario && item.roles.includes(usuario.rol),
  );

  const nombreCompleto = usuario ? `${usuario.nombre} ${usuario.apellidos}` : '';

  return (
    <>
      {/* ── Botón hamburguesa (solo móvil) ── */}
      <button
        className="fixed top-3.5 left-4 z-50 md:hidden p-2 rounded-lg bg-steel-900 text-white shadow-md"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Overlay móvil ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          'w-56 bg-steel-900 flex flex-col flex-shrink-0',
          // Desktop: static en el flex layout
          'md:sticky md:top-0 md:h-screen',
          // Móvil: drawer lateral fijo
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:h-full max-md:z-50',
          'max-md:transition-transform max-md:duration-200 max-md:ease-in-out',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        {/* Empresa + ubicación */}
        <div className="px-4 py-4 border-b border-steel-700">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <EmpresaLogo
                logo_url={empresa?.logo_url}
                empresa_nombre={empresa?.nombre}
              />
            </div>
            {/* Botón cerrar (solo móvil, dentro del drawer) */}
            <button
              className="md:hidden text-steel-400 hover:text-white transition-colors p-1"
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
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
                onClick={handleNavClick}
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

        {/* Barra inferior: búsqueda + notificaciones + usuario */}
        <div className="px-3 py-3 border-t border-steel-700 space-y-2">
          {/* Búsqueda global */}
          <button
            onClick={() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-steel-800 hover:bg-steel-700 text-steel-400 hover:text-white transition-colors text-body-sm"
          >
            <Search className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Buscar…</span>
            <kbd className="text-[10px] bg-steel-700 px-1.5 py-0.5 rounded text-steel-400">Ctrl K</kbd>
          </button>

          {/* Instalar PWA — solo visible cuando el browser lo permite */}
          {canInstall && (
            <button
              onClick={install}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors text-body-sm"
            >
              <MonitorDown className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Instalar app</span>
            </button>
          )}

          {/* Usuario + notificaciones + logout */}
          <div className="flex items-center gap-2">
            <Link href="/perfil" onClick={handleNavClick} className="w-7 h-7 rounded-full bg-steel-700 flex items-center justify-center flex-shrink-0 hover:bg-steel-600 transition-colors" title="Mi perfil">
              <span className="text-steel-300 text-meta font-semibold">
                {usuario?.nombre?.charAt(0) ?? '?'}
              </span>
            </Link>
            <div className="flex-1 min-w-0">
              <Link href="/perfil" onClick={handleNavClick} className="block">
                <p className="text-white text-body-sm font-medium truncate hover:text-brand-300 transition-colors">{nombreCompleto}</p>
              </Link>
              <p className="text-steel-500 text-meta truncate capitalize">
                {usuario?.rol?.toLowerCase().replace('_', ' ') ?? ''}
              </p>
            </div>
            <NotificacionesPanel />
            <button
              onClick={handleLogout}
              className="text-steel-500 hover:text-white transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <GlobalSearch />
      </aside>
    </>
  );
}
