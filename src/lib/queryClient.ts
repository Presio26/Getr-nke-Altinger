/**
 * Gemeinsamer React-Query-Client (einmal pro App). Auch außerhalb von React nutzbar
 * (Session-Store räumt beim Benutzerwechsel den Cache auf).
 */
import { QueryCache, QueryClient, type Query } from '@tanstack/react-query';
import { ApiError } from '@shared/api';

/** Fehler, bei denen ein erneuter Versuch nichts bringt */
const NO_RETRY_CODES = new Set(['unauthorized', 'forbidden', 'not_found', 'validation', 'conflict']);

let onUnauthorized: (() => void) | null = null;
/** Wird vom Session-Store gesetzt: abgelaufene Sitzung erkennen */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error) {
      if (error instanceof ApiError && error.code === 'unauthorized') onUnauthorized?.();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      retry(failureCount, error) {
        if (error instanceof ApiError && NO_RETRY_CODES.has(error.code)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 6000),
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Wurzeln von Query-Keys, deren Daten nicht vom angemeldeten Nutzer abhängen.
 * Alles andere wird beim Benutzerwechsel verworfen.
 */
const PUBLIC_ROOTS = new Set(['products', 'slots', 'rentals', 'zip', 'address-search']);

function isUserScoped(query: Query): boolean {
  const root = query.queryKey[0];
  return !(typeof root === 'string' && PUBLIC_ROOTS.has(root));
}

/**
 * Nach Anmeldung/Benutzerwechsel: nutzerbezogene Daten zurücksetzen (aktive Abfragen laden neu),
 * öffentliche Daten im Hintergrund auffrischen.
 */
export async function resetUserQueries(): Promise<void> {
  await queryClient.cancelQueries({ predicate: isUserScoped });
  await Promise.allSettled([
    queryClient.resetQueries({ predicate: isUserScoped }),
    queryClient.invalidateQueries({ predicate: (q) => !isUserScoped(q) }),
  ]);
}

/** Nach Abmeldung: nutzerbezogene Daten vollständig entfernen */
export function removeUserQueries(): void {
  queryClient.cancelQueries({ predicate: isUserScoped }).catch(() => {});
  queryClient.removeQueries({ predicate: isUserScoped });
  queryClient.invalidateQueries({ predicate: (q) => !isUserScoped(q) }).catch(() => {});
}
