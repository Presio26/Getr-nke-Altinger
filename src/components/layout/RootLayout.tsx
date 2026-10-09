import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { RealtimeBridge } from '@/api/RealtimeBridge';
import { refreshDocumentTitle } from '@/lib/hooks';
import { Toaster } from '@/components/ui';
import { DemoSwitcher } from '@/components/demo/DemoSwitcher';
import { InstallPrompt, UpdatePrompt } from '@/components/pwa';

/** Fenstertitel nach jedem Seitenwechsel neu zusammensetzen (Bereich Markt/Fahrer hängt vom Pfad ab) */
function TitleSync() {
  const { pathname } = useLocation();
  useEffect(() => refreshDocumentTitle(), [pathname]);
  return null;
}

/**
 * Wurzel aller Routen: globale Dienste (Echtzeit, Hinweise, Demo-Umschalter, PWA).
 * Verbindungs-Hinweise (offline, lokaler Modus) zeigt ConnectionBanner in der Kopfzeile jedes Layouts.
 */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <RealtimeBridge />
      <TitleSync />
      <Toaster />
      <DemoSwitcher />
      <InstallPrompt />
      <UpdatePrompt />
      <ScrollRestoration />
    </>
  );
}
