import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { MonitorSmartphone, RefreshCw } from 'lucide-react';
import type { Bootstrap } from '@shared/types';
import { api, getApiMode, initApi } from '@/api/client';
import { BootstrapContext, type BootstrapContextValue } from '@/api/hooks';
import { queryClient } from '@/lib/queryClient';
import { useSession } from '@/stores/session';
import { Logo } from '@/components/brand/Logo';
import { Button, LoadingScreen, errorMessage } from '@/components/ui';
import { router } from '@/routes';

type BootState = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; bootstrap: Bootstrap };

function StartupError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const remote = getApiMode() === 'remote';
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md text-center">
        <Logo className="mx-auto h-12" />
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-xl font-bold text-slate-900">Die App konnte nicht starten</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{errorMessage(error)}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button icon={RefreshCw} onClick={onRetry} block>
              Erneut versuchen
            </Button>
            {remote ? (
              <Button
                variant="outline"
                icon={MonitorSmartphone}
                block
                onClick={() => {
                  window.location.href = '/?api=local';
                }}
              >
                Offline-Demo auf diesem Gerät starten
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-6 text-sm text-slate-500">Getränke Altinger · Freisinger Landstraße 19 · 85748 Garching · 089 3202562</p>
      </div>
    </div>
  );
}

function Bootstrapper() {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const [slow, setSlow] = useState(false);

  const start = useCallback(async () => {
    setState({ status: 'loading' });
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 3500);
    try {
      await initApi();
      const bootstrap = await api.getBootstrap();
      // Anmeldung prüfen – Netzwerkfehler hier sind nicht fatal (Gast-Ansicht)
      await useSession
        .getState()
        .refresh()
        .catch(() => null);
      setState({ status: 'ready', bootstrap });
    } catch (error) {
      setState({ status: 'error', error });
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const update = useCallback((patch: Partial<Bootstrap>) => {
    setState((s) => (s.status === 'ready' ? { status: 'ready', bootstrap: { ...s.bootstrap, ...patch } } : s));
  }, []);

  const reload = useCallback(async () => {
    const bootstrap = await api.getBootstrap();
    setState((s) => (s.status === 'ready' ? { status: 'ready', bootstrap } : s));
  }, []);

  const bootstrap = state.status === 'ready' ? state.bootstrap : null;
  const ctx = useMemo<BootstrapContextValue | null>(() => (bootstrap ? { bootstrap, update, reload } : null), [bootstrap, update, reload]);

  if (state.status === 'error') return <StartupError error={state.error} onRetry={() => void start()} />;
  if (!ctx) return <LoadingScreen label={slow ? 'Verbindung wird aufgebaut …' : 'Getränkemarkt wird geöffnet …'} />;

  return (
    <BootstrapContext.Provider value={ctx}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </BootstrapContext.Provider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Bootstrapper />
    </QueryClientProvider>
  );
}
