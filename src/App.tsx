import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { MonitorSmartphone, RefreshCw } from 'lucide-react';
import type { Bootstrap } from '@shared/types';
import { ApiError, NETWORK_ERROR_MESSAGE, api, getApiMode, initApi, isModeSwitchable, waitForServer, wasServerReachableAtStart } from '@/api/client';
import { BootstrapContext, type BootstrapContextValue } from '@/api/hooks';
import { queryClient } from '@/lib/queryClient';
import { useSession } from '@/stores/session';
import { Logo } from '@/components/brand/Logo';
import { Button, LoadingScreen, errorMessage } from '@/components/ui';
import { router } from '@/routes';

type BootState =
  | { status: 'loading' }
  | { status: 'connecting'; progress: number; elapsedMs: number }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; bootstrap: Bootstrap };

/** so lange wartet der Start auf einen schlafenden Server (Render-Kaltstart) */
const SERVER_WAKE_MS = 60_000;

/** Offline-Demo (Core im Browser) für diesen Tab starten */
function startOfflineDemo() {
  const url = new URL(window.location.href);
  url.searchParams.set('api', 'local');
  window.location.href = `${url.pathname}${url.search}${url.hash}`;
}

/** Netzwerkfehler (Server nicht erreichbar) statt fachlichem Fehler? */
function isNetworkError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.code !== 'internal') return false;
  return err.message === NETWORK_ERROR_MESSAGE || /Server antwortet nicht|Unerwartete Antwort vom Server \(HTTP 5/.test(err.message);
}

/** Start-Bildschirm, solange der Server geweckt wird */
function ConnectingScreen({ progress, elapsedMs }: { progress: number; elapsedMs: number }) {
  const seconds = Math.floor(elapsedMs / 1000);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 py-12 animate-fade-in" aria-busy>
      <div className="w-full max-w-sm text-center">
        <Logo className="mx-auto h-14" />
        <h1 className="mt-8 text-lg font-bold text-slate-900">Verbinde mit Server …</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">
          {seconds < 6
            ? 'Einen Moment bitte.'
            : 'Der Server wird gerade gestartet – das kann bis zu einer Minute dauern.'}
        </p>
        <div
          className="mx-auto mt-6 h-2 w-full max-w-64 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Verbindungsaufbau"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-linear" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs tabular-nums text-slate-400">{seconds} s</p>
        {isModeSwitchable() ? (
          <div className="mt-8">
            <Button variant="outline" icon={MonitorSmartphone} onClick={startOfflineDemo} block>
              Offline-Demo starten
            </Button>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Mit Beispieldaten nur auf diesem Gerät – ohne Live-Abgleich mit Markt und Fahrern.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
            {remote && isModeSwitchable() ? (
              <Button variant="outline" icon={MonitorSmartphone} block onClick={startOfflineDemo}>
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
  const abort = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: 'loading' });
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 3500);
    /** Server schläft (Kaltstart) → bis zu 60 s mit Fortschritt warten statt sofort aufzugeben */
    const wake = async (): Promise<boolean> => {
      if (controller.signal.aborted) return false;
      setState({ status: 'connecting', progress: 0, elapsedMs: 0 });
      return waitForServer({
        timeoutMs: SERVER_WAKE_MS,
        signal: controller.signal,
        onProgress: (progress, elapsedMs) => {
          if (!controller.signal.aborted) setState({ status: 'connecting', progress, elapsedMs });
        },
      });
    };
    try {
      await initApi();
      if (getApiMode() === 'remote' && !wasServerReachableAtStart() && !(await wake())) {
        if (controller.signal.aborted) return;
        throw new ApiError('internal', 'Der Server ist nicht erreichbar. Bitte prüfen Sie die Internetverbindung oder versuchen Sie es gleich noch einmal.');
      }
      let bootstrap: Bootstrap;
      try {
        bootstrap = await api.getBootstrap();
      } catch (err) {
        // Server war kurz weg (Neustart, Funkloch) → einmal warten und erneut laden
        if (getApiMode() !== 'remote' || !isNetworkError(err) || !(await wake())) throw err;
        bootstrap = await api.getBootstrap();
      }
      if (controller.signal.aborted) return;
      // Anmeldung prüfen – Netzwerkfehler hier sind nicht fatal (Gast-Ansicht, Token bleibt erhalten)
      await useSession
        .getState()
        .refresh()
        .catch(() => null);
      setState({ status: 'ready', bootstrap });
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: 'error', error });
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void start();
    return () => abort.current?.abort();
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
  if (state.status === 'connecting') return <ConnectingScreen progress={state.progress} elapsedMs={state.elapsedMs} />;
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
