import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  ChevronDown,
  CircleUser,
  Download,
  Heart,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Package,
  Recycle,
  Repeat,
  Sparkles,
  Store,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useMyCustomer } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { useClickOutside } from '@/lib/hooks';
import { ROLE_LABEL } from '@/lib/roles';
import { cn } from '@/lib/cn';
import { Avatar, Badge, ButtonLink, toast } from '@/components/ui';
import { InstallHelpModal, useInstallAction } from '@/components/pwa/InstallHelp';

interface MenuLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

function linksFor(role: string): MenuLink[] {
  switch (role) {
    case 'driver':
      return [
        { to: '/fahrer', label: 'Fahrer-App', icon: Truck },
        { to: '/', label: 'Shop ansehen', icon: Store },
        { to: '/konto/benachrichtigungen', label: 'Benachrichtigungen', icon: Bell },
      ];
    case 'admin':
      return [
        { to: '/admin', label: 'Markt-Dashboard', icon: LayoutDashboard },
        { to: '/', label: 'Shop ansehen', icon: Store },
        { to: '/konto/benachrichtigungen', label: 'Benachrichtigungen', icon: Bell },
      ];
    case 'business':
      return [
        { to: '/business', label: 'Geschäftskunden-Portal', icon: Building2 },
        { to: '/bestellungen', label: 'Bestellungen', icon: Package },
        { to: '/business/dauerauftraege', label: 'Daueraufträge', icon: Repeat },
        { to: '/konto', label: 'Mein Konto', icon: CircleUser },
        { to: '/konto/leergut', label: 'Leergut-Konto', icon: Recycle },
        { to: '/konto/favoriten', label: 'Favoriten', icon: Heart },
      ];
    default:
      return [
        { to: '/konto', label: 'Mein Konto', icon: CircleUser },
        { to: '/bestellungen', label: 'Meine Bestellungen', icon: Package },
        { to: '/konto/favoriten', label: 'Favoriten', icon: Heart },
        { to: '/konto/abos', label: 'Abos', icon: Repeat },
        { to: '/konto/adressen', label: 'Adressen', icon: MapPin },
        { to: '/konto/leergut', label: 'Leergut-Konto', icon: Recycle },
      ];
  }
}

/** Konto-Menü (Desktop-Kopfzeile bzw. Admin-Kopfzeile) */
export function AccountMenu({ compact = false, className }: { compact?: boolean; className?: string }) {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const { data: customer } = useMyCustomer();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const navigate = useNavigate();
  const setDemoOpen = useUi((s) => s.setDemoOpen);
  const install = useInstallAction();

  if (!user) {
    return (
      <ButtonLink to="/login" variant="ghost" icon={LogIn} className={className}>
        Anmelden
      </ButtonLink>
    );
  }

  const company = customer?.type === 'b2b' || user.role === 'business';
  const displayName = company && customer?.name ? customer.name : user.name;
  // Firmen: vollständiger Name (gekürzt mit „…“); Personen: Vorname
  const shortName = company || user.role === 'admin' ? displayName : displayName.split(' ')[0];
  const pending = customer?.b2b?.status === 'pending';

  const onLogout = async () => {
    setOpen(false);
    await logout();
    toast.success('Sie wurden abgemeldet.', { id: 'logout' });
    navigate('/');
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Kontomenü: ${displayName}`}
        title={displayName}
        className="flex h-11 min-w-0 items-center gap-2 rounded-xl pl-1.5 pr-2 text-left transition-colors hover:bg-slate-100"
      >
        <Avatar name={displayName} size="sm" className="ring-0" />
        {!compact ? (
          <span className="hidden min-w-0 max-w-40 flex-col leading-tight xl:flex">
            <span className="truncate text-sm font-semibold text-slate-900">{shortName}</span>
            <span className="truncate text-xs text-slate-500">{ROLE_LABEL[user.role]}</span>
          </span>
        ) : null}
        <ChevronDown size={16} aria-hidden className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-pop animate-pop-in">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3">
            <Avatar name={displayName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge tone={user.role === 'business' ? 'brand' : user.role === 'admin' ? 'accent' : 'neutral'}>{ROLE_LABEL[user.role]}</Badge>
                {pending ? <Badge tone="warning">wird geprüft</Badge> : null}
              </div>
            </div>
          </div>
          <div className="py-1">
            {linksFor(user.role).map((l) => (
              <Link
                key={l.to + l.label}
                to={l.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                <l.icon size={18} aria-hidden className="text-slate-400" />
                {l.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-100 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setDemoOpen(true);
              }}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              <Sparkles size={18} aria-hidden className="text-accent-500" />
              Demo-Leitfaden &amp; Rollen wechseln
            </button>
            {install.available ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void install.run();
                }}
                className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              >
                <Download size={18} aria-hidden className="text-slate-400" />
                Als App installieren
              </button>
            ) : null}
          </div>
          <div className="border-t border-slate-100 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => void onLogout()}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut size={18} aria-hidden />
              Abmelden
            </button>
          </div>
        </div>
      ) : null}
      <InstallHelpModal open={install.helpOpen} onClose={install.closeHelp} />
    </div>
  );
}
