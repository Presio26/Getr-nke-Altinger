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
const DEFAULT_TITLE = `${TITLE_SUFFIX} – Getränke liefern & reservieren in Garching`;

/**
 * Fenstertitel – einheitliches Schema, zentral gelöst (Seiten müssen nichts beachten):
 *   Shop:    "<Seite> · Getränke Altinger"
 *   Fahrer:  "<Seite> · Fahrer · Getränke Altinger"
 *   Markt:   "<Seite> · Markt · Getränke Altinger"
 * Der Bereich ergibt sich aus dem Pfad (/fahrer, /admin). Seiten-Titel (useDocumentTitle, PageHeader)
 * haben Vorrang vor dem Rückfall-Titel des Layouts (useFallbackDocumentTitle); bei mehreren Seiten-Titeln
 * gewinnt der zuletzt angemeldete (die Seite selbst vor ihrem PageHeader).
 */
interface TitleEntry {
  id: number;
  title: string | null;
  fallback: boolean;
}

const titleEntries: TitleEntry[] = [];
let titleSeq = 0;

function titleArea(pathname: string): 'Markt' | 'Fahrer' | null {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'Markt';
  if (pathname === '/fahrer' || pathname.startsWith('/fahrer/')) return 'Fahrer';
  return null;
}

/** "Live-Karte · Markt" → "Live-Karte" (Bereich und Marke hängt das Schema selbst an) */
function stripSuffix(title: string, area: string | null): string {
  let t = title.trim();
  const tails = [` · ${TITLE_SUFFIX}`, ...(area ? [` · ${area}`] : [])];
  let changed = true;
  while (changed) {
    changed = false;
    for (const tail of tails) {
      if (t.endsWith(tail)) {
        t = t.slice(0, -tail.length).trim();
        changed = true;
      }
    }
  }
  return t;
}

/** Titel nach Schema zusammensetzen (exportiert für Tests/Sonderfälle) */
export function formatDocumentTitle(title: string | null | undefined, pathname: string): string {
  const area = titleArea(pathname);
  const base = title ? stripSuffix(title, area) : '';
  if (!base) {
    if (area === 'Markt') return `Markt-Dashboard · ${TITLE_SUFFIX}`;
    if (area === 'Fahrer') return `Fahrer-App · ${TITLE_SUFFIX}`;
    return DEFAULT_TITLE;
  }
  return area ? `${base} · ${area} · ${TITLE_SUFFIX}` : `${base} · ${TITLE_SUFFIX}`;
}

function pickTitle(fallback: boolean): string | null {
  for (let i = titleEntries.length - 1; i >= 0; i--) {
    const e = titleEntries[i];
    if (e.fallback === fallback && e.title) return e.title;
  }
  return null;
}

/** Fenstertitel aus den angemeldeten Titeln neu setzen (z. B. nach einem Seitenwechsel) */
export function refreshDocumentTitle(): void {
  if (typeof document === 'undefined') return;
  const next = formatDocumentTitle(pickTitle(false) ?? pickTitle(true), window.location.pathname);
  if (document.title !== next) document.title = next;
}

function useTitleEntry(title: string | null | undefined, fallback: boolean): void {
  const entry = useRef<TitleEntry | null>(null);
  useEffect(() => {
    const e: TitleEntry = { id: ++titleSeq, title: null, fallback };
    entry.current = e;
    titleEntries.push(e);
    return () => {
      const i = titleEntries.indexOf(e);
      if (i !== -1) titleEntries.splice(i, 1);
      entry.current = null;
      refreshDocumentTitle();
    };
  }, [fallback]);
  useEffect(() => {
    if (entry.current) entry.current.title = title?.trim() || null;
    refreshDocumentTitle();
  }, [title, fallback]);
}

/** Fenstertitel der Seite setzen: "Sortiment" → "Sortiment · Getränke Altinger" (null = Standardtitel) */
export function useDocumentTitle(title: string | null | undefined): void {
  useTitleEntry(title, false);
}

/** Rückfall-Titel eines Layouts (gilt nur, solange die Seite keinen eigenen Titel setzt) */
export function useFallbackDocumentTitle(title: string | null | undefined): void {
  useTitleEntry(title, true);
}

/** Klick außerhalb eines Elements oder Esc (Dropdowns, Popover) */
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current();
    };
    document.addEventListener('pointerdown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('keydown', onKey);
    };
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
