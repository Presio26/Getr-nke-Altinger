import { Suspense, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { DRIVER_STATUS_LABEL } from '@shared/format';
import { useDriverToday } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/brand/Logo';
import { ConfirmModal, IconButton, PageLoader, toast } from '@/components/ui';
import { ConnectionIndicator, GpsIndicator } from './StatusIndicators';
import { DriverGpsBridge } from '@/features/driver/components/DriverGpsBridge';

const STATUS_DOT = {
  off: 'bg-slate-400',
  available: 'bg-emerald-400',
  on_tour: 'bg-accent-400',
  break: 'bg-sky-400',
} as const;

/** Fahrer-App: mobiles Vollbild mit kompakter Kopfzeile */
export function DriverLayout() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const { data } = useDriverToday();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const driver = data?.driver;
  const name = driver?.name ?? user?.name ?? 'Fahrer';

  const onLogout = async () => {
    setBusy(true);
    await logout();
    setBusy(false);
    setConfirm(false);
    toast.success('Sie wurden abgemeldet.', { id: 'logout' });
    navigate('/login');
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <header className="sticky top-0 z-30 bg-brand-900 pt-safe text-white shadow-md shadow-brand-950/20">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-3 sm:px-4 lg:max-w-6xl">
          <Link to="/fahrer" aria-label="Fahrer-Startseite" className="shrink-0 rounded-xl">
            <Logo variant="mark" className="h-10" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight">{name}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-white/70">
              {driver ? (
                <>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[driver.status])} aria-hidden />
                  {DRIVER_STATUS_LABEL[driver.status]}
                  <span className="hidden truncate sm:inline">· {driver.vehicle}</span>
                </>
              ) : (
                'Fahrer-App'
              )}
            </p>
          </div>
          <GpsIndicator tone="dark" />
          <ConnectionIndicator tone="dark" showLabel={false} />
          <IconButton
            icon={LogOut}
            label="Abmelden"
            onClick={() => setConfirm(true)}
            className="text-white/90 hover:bg-white/10 hover:text-white active:bg-white/15"
          />
        </div>
      </header>
      {/* GPS-Teilen während aktiver Tour (läuft auf allen Fahrer-Seiten weiter) + Hinweis bei fehlender Freigabe */}
      <DriverGpsBridge />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-safe-4 pt-4 lg:max-w-6xl lg:px-6 lg:pt-6">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void onLogout()}
        loading={busy}
        title="Abmelden?"
        message="Laufende Touren bleiben erhalten. Die GPS-Übertragung endet, bis Sie sich wieder anmelden."
        confirmLabel="Abmelden"
      />
    </div>
  );
}
