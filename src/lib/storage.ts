/**
 * Sichere Zugriffe auf localStorage/sessionStorage (Safari im privaten Modus, gesperrte Cookies …).
 */

type Area = 'local' | 'session';

function area(kind: Area): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage(key: string, kind: Area = 'local'): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null, kind: Area = 'local'): void {
  try {
    const s = area(kind);
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Speicher voll oder gesperrt – nicht kritisch
  }
}

export function readJson<T>(key: string, fallback: T, kind: Area = 'local'): T {
  const raw = readStorage(key, kind);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, kind: Area = 'local'): void {
  writeStorage(key, JSON.stringify(value), kind);
}
