/**
 * Kleine Hooks für das Tagesgeschäft.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Neu hinzugekommene IDs erkennen (z. B. neue Bestellungen per Echtzeit) und für `ttlMs` markieren.
 * Beim ersten Laden gilt alles als bekannt – nur spätere Neuzugänge werden hervorgehoben.
 */
export function useFreshIds(ids: string[] | undefined, ttlMs = 9000): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<number[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const key = ids ? ids.join('|') : null;

  useEffect(() => {
    if (!ids) return;
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const known = seen.current;
    const added = ids.filter((id) => !known.has(id));
    if (!added.length) return;
    for (const id of added) known.add(id);
    setFresh((prev) => new Set([...prev, ...added]));
    const t = window.setTimeout(() => {
      setFresh((prev) => {
        const next = new Set(prev);
        for (const id of added) next.delete(id);
        return next;
      });
    }, ttlMs);
    timers.current.push(t);
  }, [key, ttlMs]);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );
  return fresh;
}

/** Einzelner Such-Parameter als Zustand (ersetzt den Verlaufseintrag) */
export function useParamState(name: string, fallback: string): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? fallback;
  const set = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (!next || next === fallback) p.delete(name);
          else p.set(name, next);
          return p;
        },
        { replace: true },
      );
    },
    [name, fallback, setParams],
  );
  return [value, set];
}

/** Gibt true zurück, solange der Browser BarcodeDetector (QR) unterstützt */
export function hasBarcodeDetector(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/** Breite eines Elements beobachten (ResizeObserver) – z. B. für Layout-Wechsel abhängig vom Inhaltsbereich */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') setWidth(w);
    });
    ro.observe(el);
    observer.current = ro;
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}
