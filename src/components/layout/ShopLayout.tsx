import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  CircleUser,
  Home,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  Package,
  Phone,
  Search,
  ShoppingCart,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { formatEuro } from '@shared/format';
import { useCartSummary, useSettings } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useCartCount } from '@/stores/cart';
import { useUi } from '@/stores/ui';
import { openState } from '@/lib/openingHours';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/brand/Logo';
import { IconButton, PageLoader } from '@/components/ui';
import { AccountMenu } from './AccountMenu';
import { Footer, telHref } from './Footer';
import { NotificationBell } from './NotificationBell';

// ───────────────────────────── Ansage-Banner ─────────────────────────────

function AnnouncementBar() {
  const text = useSettings().announcement?.trim();
  const dismissed = useUi((s) => s.dismissedAnnouncement);
  const dismiss = useUi((s) => s.dismissAnnouncement);
  if (!text || dismissed === text) return null;
  return (
    <div className="relative bg-gradient-to-r from-brand-800 via-brand-700 to-brand-800 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2.5 px-12 py-2 text-center text-[13px] font-medium sm:text-sm">
        <Megaphone size={16} aria-hidden className="hidden shrink-0 text-accent-300 sm:block" />
        <p className="leading-snug">{text}</p>
      </div>
      <button
        type="button"
        onClick={() => dismiss(text)}
        aria-label="Hinweis schließen"
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

// ───────────────────────────── Suche ─────────────────────────────

function SearchField({ autoFocus = false, onDone, className }: { autoFocus?: boolean; onDone?: () => void; className?: string }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState(() => (location.pathname.startsWith('/sortiment') ? params.get('q') ?? '' : ''));
  const ref = useRef<HTMLInputElement>(null);

  // Suchbegriff aus der URL übernehmen (z. B. nach Zurück-Navigation)
  useEffect(() => {
    if (location.pathname.startsWith('/sortiment')) setQ(params.get('q') ?? '');
  }, [location.pathname, params]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/sortiment?q=${encodeURIComponent(term)}` : '/sortiment');
    ref.current?.blur();
    onDone?.();
  };

  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={ref}
        type="search"
        enterKeyHint="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Getränke, Marken oder Leihartikel suchen …"
        aria-label="Sortiment durchsuchen"
        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100/80 pl-10 pr-10 text-base text-slate-900 transition-[background-color,border-color,box-shadow] placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:text-[15px]"
      />
      {q ? (
        <button
          type="button"
          onClick={() => {
            setQ('');
            ref.current?.focus();
          }}
          aria-label="Suchbegriff löschen"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
        >
          <X size={16} aria-hidden />
        </button>
      ) : null}
    </form>
  );
}

// ───────────────────────────── Warenkorb-Knopf ─────────────────────────────

function CartButton() {
  const summary = useCartSummary();
  return (
    <Link
      to="/warenkorb"
      className="group relative flex h-11 items-center gap-2.5 rounded-xl bg-brand-700 pl-3 pr-4 text-white shadow-sm shadow-brand-900/15 transition-colors hover:bg-brand-800"
      aria-label={`Warenkorb, ${summary.count} Artikel`}
    >
      <span className="relative">
        <ShoppingCart size={20} aria-hidden />
        {summary.count > 0 ? (
          <span className="absolute -right-2.5 -top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-brand-950 ring-2 ring-brand-700 tabular-nums">
            {summary.count > 99 ? '99+' : summary.count}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] font-medium text-white/70">Warenkorb</span>
        <span className="text-sm font-bold tabular-nums">{formatEuro(summary.itemsTotal)}</span>
      </span>
    </Link>
  );
}

// ───────────────────────────── Navigation ─────────────────────────────

const NAV: { to: string; label: string; dot?: boolean }[] = [
  { to: '/sortiment', label: 'Sortiment' },
  { to: '/angebote', label: 'Angebote', dot: true },
  { to: '/fest', label: 'Festservice' },
  { to: '/markt', label: 'Markt' },
];

function DesktopNav() {
  const role = useSession((s) => s.user?.role);
  const settings = useSettings();
  const now = useNow(60_000);
  const state = openState(settings.openingHours, now);
  return (
    <div className="hidden border-t border-slate-100 lg:block">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-6 px-8">
        <nav aria-label="Hauptnavigation" className="-ml-3 flex items-center gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'relative flex h-12 items-center gap-1.5 px-3 text-[15px] font-semibold transition-colors',
                  isActive ? 'text-brand-700 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-700' : 'text-slate-600 hover:text-slate-900',
                )
              }
            >
              {n.label}
              {n.dot ? <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden /> : null}
            </NavLink>
          ))}
          {role === 'business' ? (
            <NavLink
              to="/business"
              className={({ isActive }) =>
                cn(
                  'ml-2 flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors',
                  isActive ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800 hover:bg-brand-100',
                )
              }
            >
              <Building2 size={16} aria-hidden />
              Geschäftskunden-Portal
            </NavLink>
          ) : null}
          {role === 'admin' || role === 'driver' ? (
            <Link
              to={role === 'admin' ? '/admin' : '/fahrer'}
              className="ml-2 flex h-9 items-center gap-2 rounded-xl bg-accent-100 px-3.5 text-sm font-semibold text-accent-900 hover:bg-accent-200"
            >
              {role === 'admin' ? <LayoutDashboard size={16} aria-hidden /> : <Truck size={16} aria-hidden />}
              {role === 'admin' ? 'Markt-Dashboard' : 'Fahrer-App'}
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-5 text-[13px] text-slate-500">
          <span className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', state.open ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden />
            {state.text}
          </span>
          <span className="flex items-center gap-1.5">
            <Truck size={15} aria-hidden className="text-slate-400" />
            Lieferung in Garching &amp; Umgebung
          </span>
          <a href={telHref(settings.phone)} className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-brand-700">
            <Phone size={15} aria-hidden className="text-slate-400" />
            {settings.phone}
          </a>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Kopfzeile ─────────────────────────────

function ShopHeader() {
  const [mobileSearch, setMobileSearch] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileSearch(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 pt-safe backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:gap-8 lg:px-8">
        <Link to="/" aria-label="Zur Startseite" className="-ml-1 flex shrink-0 items-center rounded-xl p-1">
          <Logo className="h-9 lg:h-11" />
        </Link>
        <SearchField className="hidden max-w-xl flex-1 lg:block" />
        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          <IconButton icon={Search} label="Suchen" className="lg:hidden" onClick={() => setMobileSearch((v) => !v)} aria-expanded={mobileSearch} />
          <NotificationBell />
          <div className="hidden lg:block">
            <AccountMenu />
          </div>
          <div className="hidden lg:block">
            <CartButton />
          </div>
        </div>
      </div>
      {mobileSearch ? (
        <div className="border-t border-slate-100 px-4 py-2.5 animate-fade-in lg:hidden">
          <SearchField autoFocus onDone={() => setMobileSearch(false)} />
        </div>
      ) : null}
      <DesktopNav />
    </header>
  );
}

// ───────────────────────────── Tab-Leiste (Mobil) ─────────────────────────────

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  badge?: number;
}

function MobileTabBar() {
  const role = useSession((s) => s.user?.role ?? null);
  const count = useCartCount();
  const { pathname } = useLocation();

  const accountTab: Tab =
    role === 'admin'
      ? { to: '/admin', label: 'Markt', icon: LayoutDashboard, match: () => false }
      : role === 'driver'
        ? { to: '/fahrer', label: 'Fahrer', icon: Truck, match: () => false }
        : role
          ? { to: '/konto', label: 'Konto', icon: CircleUser, match: (p) => p.startsWith('/konto') }
          : { to: '/login', label: 'Anmelden', icon: CircleUser, match: (p) => p === '/login' || p === '/registrieren' || p === '/geschaeftskunde' };

  const tabs: Tab[] = [
    { to: '/', label: 'Start', icon: Home, match: (p) => p === '/' },
    { to: '/sortiment', label: 'Sortiment', icon: LayoutGrid, match: (p) => p.startsWith('/sortiment') || p.startsWith('/produkt') || p === '/angebote' || p === '/fest' },
    { to: '/warenkorb', label: 'Warenkorb', icon: ShoppingCart, match: (p) => p === '/warenkorb' || p === '/kasse', badge: count },
    role === 'business'
      ? { to: '/business', label: 'Portal', icon: Building2, match: (p) => p.startsWith('/business') }
      : { to: '/bestellungen', label: 'Bestellungen', icon: Package, match: (p) => p.startsWith('/bestellung') },
    accountTab,
  ];

  return (
    <nav
      aria-label="Schnellnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 pb-safe shadow-bar backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.to} className="flex-1">
              <Link
                to={t.to}
                aria-current={active ? 'page' : undefined}
                className={cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors', active ? 'text-brand-700' : 'text-slate-500 active:text-slate-800')}
              >
                {active ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-700" aria-hidden /> : null}
                <span className="relative">
                  <t.icon size={23} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                  {t.badge ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-brand-950 ring-2 ring-white tabular-nums">
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  ) : null}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ───────────────────────────── Layout ─────────────────────────────

/** Shop-Layout (Gäste, Privat- und Geschäftskunden) */
export function ShopLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-brand-700 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Zum Inhalt springen
      </a>
      <AnnouncementBar />
      <ShopHeader />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  );
}
