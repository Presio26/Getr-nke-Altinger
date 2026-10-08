/**
 * Kleine, allgemeine React-Hooks (Medien-Abfragen, Entprellen, Dokumenttitel …).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** CSS-Medienabfrage beobachten, z. B. useMediaQuery('(min-width: 1024px)') */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Desktop-Layout (ab Tailwind-Breakpoint lg = 1024 px) */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** Wert verzögert übernehmen (z. B. Sucheingaben, Preisberechnung) */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const TITLE_SUFFIX = 'Getränke Altinger';

/** Fenstertitel setzen: "Sortiment · Getränke Altinger" */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = title ? `${title} · ${TITLE_SUFFIX}` : `${TITLE_SUFFIX} – Getränke liefern & reservieren in Garching`;
  }, [title]);
}

/** Klick außerhalb eines Elements (Dropdowns, Popover) */
export function useClickOutside<T extends HTMLElement>(onOutside: () => void, enabled = true) {
  const ref = useRef<T | null>(null);
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: PointerEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) cb.current();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [enabled]);
  return ref;
}

/** Aktuelle Zeit, die sich in einem Intervall aktualisiert (z. B. "vor 3 Min."-Anzeigen) */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Online-/Offline-Status des Browsers */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    () => true,
  );
}
