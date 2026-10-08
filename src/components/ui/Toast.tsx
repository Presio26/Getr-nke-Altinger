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
  /** gleiche id ersetzt einen bestehenden Toast (z. B. alle Status-Hinweise einer Bestellung) */
  id?: string;
}

interface ToastItem extends ToastOptions {
  id: string;
  kind: ToastKind;
  message: string;
  createdAt: number;
  /** wie oft derselbe Hinweis zusammengefasst wurde */
  count: number;
}

/** höchstens so viele Hinweise gleichzeitig (ältere weichen) */
const MAX_VISIBLE = 3;
/** gleicher Hinweis innerhalb dieser Zeit = doppelt ausgelöst (z. B. Effekt im StrictMode) */
const DUPLICATE_MS = 400;

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;
/** zuletzt angesagter Text für Screenreader (eine Live-Region je Dringlichkeit, nicht verschachtelt) */
let announcement = { polite: '', assertive: '', seq: 0 };

function emit() {
  for (const l of listeners) l();
}

function announce(kind: ToastKind, text: string) {
  announcement = {
    polite: kind === 'error' ? announcement.polite : text,
    assertive: kind === 'error' ? text : announcement.assertive,
    seq: announcement.seq + 1,
  };
}

function push(kind: ToastKind, message: string, options: ToastOptions = {}): string {
  const now = Date.now();
  // gleichartige Hinweise (gleiche Art + Text) zusammenfassen statt stapeln
  const twin = options.id ? undefined : items.find((t) => t.kind === kind && t.message === message && (t.description ?? '') === (options.description ?? ''));
  const id = options.id ?? twin?.id ?? `t${++counter}`;
  const previous = items.find((t) => t.id === id);
  const sameContent = previous && previous.kind === kind && previous.message === message && (previous.description ?? '') === (options.description ?? '');
  // derselbe Hinweis im selben Augenblick (doppelt ausgelöst) zählt nicht als Wiederholung
  if (sameContent && now - previous.createdAt < DUPLICATE_MS) return id;
  const item: ToastItem = {
    ...options,
    id,
    kind,
    message,
    createdAt: now,
    // „2×“ nur für wiederholte gleichartige Hinweise; ersetzte Hinweise (gleiche id, neuer Inhalt) zählen neu
    count: sameContent && !options.id ? previous.count + 1 : 1,
  };
  // ersetzen an Ort und Stelle (kein Springen), neue Hinweise unten anfügen
  items = previous ? items.map((t) => (t.id === id ? item : t)) : [...items, item];
  if (items.length > MAX_VISIBLE) items = items.slice(-MAX_VISIBLE);
  announce(kind, options.description ? `${message}. ${options.description}` : message);
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
      // eigener Schlüssel je Inhalt → ersetzter Hinweis blendet kurz neu ein
      key={item.createdAt}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 pr-2 shadow-pop backdrop-blur animate-toast-in"
    >
      <Icon size={20} aria-hidden className={cn('mt-0.5 shrink-0', ICON_COLOR[item.kind])} />
      <div className={cn('min-w-0 flex-1', item.href && 'cursor-pointer')} onClick={open}>
        <p className="text-[15px] font-semibold leading-snug text-slate-900">
          {item.message}
          {item.count > 1 ? (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 align-[1px] text-[11px] font-bold tabular-nums text-slate-600">
              {item.count}×
            </span>
          ) : null}
        </p>
        {item.description ? <p className="mt-0.5 text-sm leading-snug text-slate-500">{item.description}</p> : null}
        {item.href ? (
          <button type="button" onClick={open} className="mt-1 inline-flex min-h-8 items-center text-sm font-semibold text-brand-700 hover:text-brand-800">
            {item.actionLabel ?? 'Ansehen'} →
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Hinweis schließen"
        className="-my-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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

/**
 * Einmal innerhalb des Routers montieren.
 * Position: unten – auf dem Handy über Tab-Leiste und fester Aktionsleiste (CSS-Variablen
 * --tabbar-h/--sticky-bar-h), ab sm rechts unten. So verdecken Hinweise nie Kopfzeile oder Zurück-Pfeil.
 */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  const said = useSyncExternalStore(subscribe, () => announcement, () => announcement);
  return (
    <>
      <section
        aria-label="Hinweise"
        className="no-print pointer-events-none fixed inset-x-0 z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-3 bottom-floating sm:bottom-floating-lg sm:left-auto sm:right-6 sm:mx-0 sm:w-96 sm:px-0"
      >
        {list.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </section>
      {/* genau eine Live-Region je Dringlichkeit – die sichtbaren Karten selbst sind keine Live-Regionen */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {said.polite}
      </div>
      <div className="sr-only" role="alert" aria-atomic="true">
        {said.assertive}
      </div>
    </>
  );
}
