import { Outlet, ScrollRestoration } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { RealtimeBridge } from '@/api/RealtimeBridge';
import { getApiMode } from '@/api/client';
import { useOnline } from '@/lib/hooks';
import { Toaster } from '@/components/ui';
import { DemoSwitcher } from '@/components/demo/DemoSwitcher';
import { InstallPrompt, UpdatePrompt } from '@/components/pwa';

function OfflineNotice() {
  const online = useOnline();
  if (online || getApiMode() === 'local') return null;
  return (
    <div role="status" className="no-print fixed inset-x-0 top-safe-2 z-[55] flex justify-center px-3">
      <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-pop">
        <WifiOff size={15} aria-hidden className="text-amber-300" />
        Keine Internetverbindung – Änderungen werden erst danach übertragen.
      </div>
    </div>
  );
}

/** Wurzel aller Routen: globale Dienste (Echtzeit, Hinweise, Demo-Umschalter, PWA) */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <RealtimeBridge />
      <Toaster />
      <DemoSwitcher />
      <InstallPrompt />
      <UpdatePrompt />
      <OfflineNotice />
      <ScrollRestoration />
    </>
  );
}
