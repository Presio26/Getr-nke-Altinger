import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  /** zweite Zeile */
  description?: string;
  /** App-interner Link (Klick öffnet ihn) */
  href?: string;
  /** Beschriftung des Links, Default "Ansehen" */
  actionLabel?: string;
  /** Anzeigedauer in ms (Default 4,5 s, Fehler 7 s) */
  duration?: number;
  /** gleiche id ersetzt einen bestehenden Toast */
  id?: string;
}

interface ToastItem extends ToastOptions {
  id: string;
  kind: ToastKind;
  message: string;
  createdAt: number;
}

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const l of listeners) l();
}

function push(kind: ToastKind, message: string, options: ToastOptions = {}): string {
  const id = options.id ?? `t${++counter}`;
  const item: ToastItem = { ...options, id, kind, message, createdAt: Date.now() };
  items = [...items.filter((t) => t.id !== id), item].slice(-4);
  emit();
  return id;
}

function dismiss(id?: string) {
  items = id ? items.filter((t) => t.id !== id) : [];
  emit();
}

/** Kurze Rückmeldungen: toast.success('Gespeichert') */
export const toast = {
  success: (message: string, options?: ToastOptions) => push('success', message, options),
  error: (message: string, options?: ToastOptions) => push('error', message, options),
  info: (message: string, options?: ToastOptions) => push('info', message, options),
  warning: (message: string, options?: ToastOptions) => push('warning', message, options),
  dismiss,
};

const ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle } as const;
const ICON_COLOR = {
  success: 'text-emerald-600',
  error: 'text-red-600',
  info: 'text-brand-600',
  warning: 'text-amber-600',
} as const;

function ToastCard({ item }: { item: ToastItem }) {
  const navigate = useNavigate();
  const Icon = ICON[item.kind];
  const duration = item.duration ?? (item.kind === 'error' ? 7000 : 4500);

  useEffect(() => {
    const t = window.setTimeout(() => dismiss(item.id), duration);
    return () => window.clearTimeout(t);
  }, [item.id, item.createdAt, duration]);

  const open = () => {
    if (!item.href) return;
    dismiss(item.id);
    navigate(item.href);
  };

  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 pr-2 shadow-pop backdrop-blur animate-toast-in"
    >
      <Icon size={20} aria-hidden className={cn('mt-0.5 shrink-0', ICON_COLOR[item.kind])} />
      <div className={cn('min-w-0 flex-1', item.href && 'cursor-pointer')} onClick={open}>
        <p className="text-[15px] font-semibold leading-snug text-slate-900">{item.message}</p>
        {item.description ? <p className="mt-0.5 text-sm leading-snug text-slate-500">{item.description}</p> : null}
        {item.href ? (
          <button type="button" onClick={open} className="mt-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
            {item.actionLabel ?? 'Ansehen'} →
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Hinweis schließen"
        className="-my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <X size={17} aria-hidden />
      </button>
    </div>
  );
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Einmal innerhalb des Routers montieren */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-safe-2 z-[60] mx-auto flex w-full max-w-md flex-col-reverse gap-2 px-3 sm:bottom-6 sm:left-auto sm:right-6 sm:top-auto sm:mx-0 sm:w-96 sm:flex-col sm:px-0"
    >
      {list.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}
