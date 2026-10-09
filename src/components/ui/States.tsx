import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, LockKeyhole, RefreshCw, SearchX, WifiOff, type LucideIcon } from 'lucide-react';
import { ApiError } from '@shared/api';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/brand/Logo';
import { Button } from './Button';
import { Spinner } from './Spinner';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon ? (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-8 ring-slate-50">
          <Icon size={28} aria-hidden />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Lesbare Fehlermeldung aus beliebigem Fehler */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) {
    if (/Failed to fetch|NetworkError|Load failed|dynamically imported module|Importing a module script failed/i.test(error.message)) {
      return 'Die Verbindung ist unterbrochen oder die App wurde aktualisiert. Bitte laden Sie die Seite neu.';
    }
    return error.message;
  }
  if (typeof error === 'string' && error) return error;
  return 'Es ist ein unerwarteter Fehler aufgetreten.';
}

function errorVisual(error: unknown): { icon: LucideIcon; title: string } {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'not_found') return { icon: SearchX, title: 'Nicht gefunden' };
  if (code === 'unauthorized') return { icon: LockKeyhole, title: 'Bitte melden Sie sich an' };
  if (code === 'forbidden') return { icon: LockKeyhole, title: 'Kein Zugriff' };
  const msg = errorMessage(error);
  if (/Verbindung|Server antwortet/i.test(msg)) return { icon: WifiOff, title: 'Keine Verbindung' };
  return { icon: AlertTriangle, title: 'Das hat leider nicht geklappt' };
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  /** zusätzliche Aktion, z. B. Link zur Startseite */
  action?: ReactNode;
}

export function ErrorState({ error, onRetry, className, action }: ErrorStateProps) {
  const { icon: Icon, title } = errorVisual(error);
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 ring-8 ring-red-50/50">
        <Icon size={28} aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{errorMessage(error)}</p>
      {onRetry || action ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button variant="outline" icon={RefreshCw} onClick={onRetry}>
              Erneut versuchen
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

export interface LoadingScreenProps {
  label?: string;
}

/** Vollbild-Ladeanzeige mit Logo (App-Start) */
export function LoadingScreen({ label = 'Einen Moment bitte …' }: LoadingScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-slate-50 px-6 animate-fade-in" aria-busy>
      <Logo className="h-14" />
      <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
        <Spinner size={18} />
        <span>{label}</span>
      </div>
    </div>
  );
}

// Solange irgendwo eine Seiten-Ladeanzeige steht, blenden Layouts den Footer aus (sonst springt er
// beim Laden der Seite aus dem Bild → Layout-Shift/CLS).
let activeLoaders = 0;
const loaderListeners = new Set<() => void>();
function changeLoaders(delta: number) {
  activeLoaders = Math.max(0, activeLoaders + delta);
  loaderListeners.forEach((l) => l());
}
function subscribeLoaders(cb: () => void) {
  loaderListeners.add(cb);
  return () => loaderListeners.delete(cb);
}

/** true, solange eine PageLoader-Ladeanzeige (Suspense, Zugriffsprüfung …) sichtbar ist */
export function usePageLoading(): boolean {
  return useSyncExternalStore(subscribeLoaders, () => activeLoaders > 0, () => false);
}

/** Ladeanzeige innerhalb eines Layouts (Seitenwechsel, Suspense) */
export function PageLoader({ label = 'Wird geladen …', className }: { label?: string; className?: string }) {
  useLayoutEffect(() => {
    changeLoaders(1);
    return () => changeLoaders(-1);
  }, []);
  return (
    <div className={cn('flex min-h-[40vh] items-center justify-center', className)} aria-busy>
      <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-card">
        <Spinner size={16} />
        {label}
      </div>
    </div>
  );
}
