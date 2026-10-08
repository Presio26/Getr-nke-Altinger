import { Suspense, useEffect, useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Repeat,
  Route,
  Settings,
  ShoppingBag,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { OrderStatus } from '@shared/types';
import { todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/hooks';
import { Logo } from '@/components/brand/Logo';
import { Drawer, IconButton, PageLoader } from '@/components/ui';
import { AccountMenu } from './AccountMenu';
import { NotificationBell } from './NotificationBell';
import { ConnectionIndicator } from './StatusIndicators';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: 'orders' | 'pickups';
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Tagesgeschäft',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/bestellungen', label: 'Bestellungen', icon: ClipboardList, badge: 'orders' },
      { to: '/admin/touren', label: 'Touren', icon: Route },
      { to: '/admin/live', label: 'Live-Karte', icon: MapPinned },
      { to: '/admin/abholungen', label: 'Abholungen', icon: ShoppingBag, badge: 'pickups' },
    ],
  },
  {
    title: 'Stammdaten',
    items: [
      { to: '/admin/sortiment', label: 'Sortiment', icon: Package },
      { to: '/admin/kunden', label: 'Kunden', icon: Users },
    ],
  },
  {
    title: 'Finanzen & Auswertung',
    items: [
      { to: '/admin/rechnungen', label: 'Rechnungen', icon: Receipt },
      { to: '/admin/abos', label: 'Abos', icon: Repeat },
      { to: '/admin/statistik', label: 'Statistik', icon: BarChart3 },
    ],
  },
  {
    title: 'System',
    items: [{ to: '/admin/einstellungen', label: 'Einstellungen', icon: Settings }],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);
const OPEN_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'picking', 'ready'];

/** Zähler für die Seitenleiste: neue Bestellungen und offene Abholungen (bis heute) */
function useAdminBadges() {
  const isAdmin = useSession((s) => s.user?.role === 'admin');
  const query = useMemo(() => ({ status: OPEN_STATUSES }), []);
  const { data } = useQuery({
    queryKey: qk.adminOrders(query),
    queryFn: () => api.adminListOrders(query),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });
  return useMemo(() => {
    const today = todayString();
    const list = data ?? [];
    return {
      orders: list.filter((o) => o.status === 'pending').length,
      pickups: list.filter((o) => o.fulfillment === 'pickup' && o.slot.date <= today).length,
    };
  }, [data]);
}

function SidebarNav({ collapsed, theme, onNavigate }: { collapsed: boolean; theme: 'dark' | 'light'; onNavigate?: () => void }) {
  const badges = useAdminBadges();
  const dark = theme === 'dark';
  return (
    <nav aria-label="Markt-Navigation" className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-none">
      {GROUPS.map((g) => (
        <div key={g.title}>
          {!collapsed ? (
            <p className={cn('mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em]', dark ? 'text-white/40' : 'text-slate-400')}>{g.title}</p>
          ) : (
            <div className={cn('mx-3 mb-2 h-px', dark ? 'bg-white/10' : 'bg-slate-200')} />
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const count = item.badge ? badges[item.badge] : 0;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        dark
                          ? isActive
                            ? 'bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                            : 'text-white/70 hover:bg-white/6 hover:text-white'
                          : isActive
                            ? 'bg-brand-50 text-brand-800'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && dark ? <span className="absolute left-0 top-2.5 h-6 w-1 rounded-r-full bg-accent-400" aria-hidden /> : null}
                        <item.icon size={20} aria-hidden className={cn('shrink-0', isActive ? (dark ? 'text-accent-300' : 'text-brand-700') : undefined)} />
                        {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                        {count > 0 ? (
                          <span
                            className={cn(
                              'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                              collapsed && 'absolute right-1 top-1 h-4 min-w-4 px-1 text-[10px]',
                              item.badge === 'orders' ? 'bg-accent-500 text-brand-950' : dark ? 'bg-white/90 text-brand-900' : 'bg-brand-700 text-white',
                            )}
                          >
                            {count}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ collapsed, theme, onNavigate }: { collapsed: boolean; theme: 'dark' | 'light'; onNavigate?: () => void }) {
  const dark = theme === 'dark';
  const cls = cn(
    'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
    collapsed && 'justify-center px-0',
    dark ? 'text-white/60 hover:bg-white/6 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
  );
  return (
    <div className={cn('space-y-0.5 border-t px-3 py-3', dark ? 'border-white/10' : 'border-slate-200')}>
      <Link to="/" className={cls} onClick={onNavigate} title={collapsed ? 'Zum Shop' : undefined}>
        <Store size={18} aria-hidden />
        {!collapsed ? 'Zum Shop' : null}
      </Link>
      <Link to="/demo" className={cls} onClick={onNavigate} title={collapsed ? 'Demo-Leitfaden' : undefined}>
        <BookOpen size={18} aria-hidden />
        {!collapsed ? 'Demo-Leitfaden' : null}
      </Link>
    </div>
  );
}

/** Markt-/Dispositions-Dashboard: Seitenleiste (einklappbar) + Kopfzeile */
export function AdminLayout() {
  const collapsed = useUi((s) => s.adminSidebarCollapsed);
  const setCollapsed = useUi((s) => s.setAdminSidebarCollapsed);
  const mobileOpen = useUi((s) => s.mobileNavOpen);
  const setMobileOpen = useUi((s) => s.setMobileNavOpen);
  const { pathname } = useLocation();

  const current = useMemo(
    () => [...ALL_ITEMS].sort((a, b) => b.to.length - a.to.length).find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to))),
    [pathname],
  );
  useDocumentTitle(current ? `${current.label} · Markt` : 'Markt-Dashboard');
  useEffect(() => setMobileOpen(false), [pathname, setMobileOpen]);

  const width = collapsed ? 'lg:w-[4.75rem]' : 'lg:w-64';
  const pad = collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-64';

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Seitenleiste Desktop */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col bg-brand-950 text-white transition-[width] duration-200 lg:flex', width)}>
        <div className={cn('flex h-16 shrink-0 items-center border-b border-white/10', collapsed ? 'justify-center px-2' : 'px-5')}>
          <Link to="/admin" aria-label="Markt-Dashboard" className="rounded-xl">
            {collapsed ? <Logo variant="mark" className="h-10" /> : <Logo variant="white" className="h-10" />}
          </Link>
        </div>
        <SidebarNav collapsed={collapsed} theme="dark" />
        <SidebarFooter collapsed={collapsed} theme="dark" />
      </aside>

      {/* Navigation Mobil/Tablet */}
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" width="min(18rem, 86vw)" title="Markt-Dashboard" bodyClassName="flex flex-col p-0">
        <SidebarNav collapsed={false} theme="light" onNavigate={() => setMobileOpen(false)} />
        <SidebarFooter collapsed={false} theme="light" onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <div className={cn('flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200', pad)}>
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 pt-safe backdrop-blur-md">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-5 lg:px-6">
            <IconButton icon={Menu} label="Navigation öffnen" className="lg:hidden" onClick={() => setMobileOpen(true)} />
            <span className="hidden lg:block">
              <IconButton
                icon={collapsed ? PanelLeftOpen : PanelLeftClose}
                label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
                onClick={() => setCollapsed(!collapsed)}
              />
            </span>
            <Link to="/admin" className="hidden sm:block lg:hidden" aria-label="Markt-Dashboard">
              <Logo variant="mark" className="h-9" />
            </Link>
            <div className="ml-1 min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-slate-900">{current?.label ?? 'Markt-Dashboard'}</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">Getränke Altinger · Markt &amp; Disposition</p>
            </div>
            <span className="hidden sm:block">
              <ConnectionIndicator showMode />
            </span>
            <span className="sm:hidden">
              <ConnectionIndicator showLabel={false} />
            </span>
            <NotificationBell />
            <AccountMenu compact />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
