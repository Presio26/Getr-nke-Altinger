/**
 * Anmeldung: Token (localStorage "altinger.token"), aktueller Nutzer, Login/Logout.
 *
 * Das Token liegt zusätzlich im sessionStorage des Tabs: So behält jeder Tab nach einem Neuladen
 * „seinen“ Nutzer (wichtig für Demos mit Kunde, Fahrer und Markt in mehreren Tabs), neue Tabs
 * übernehmen die zuletzt verwendete Anmeldung.
 */
import { create } from 'zustand';
import type { BusinessRequestInput, ID, RegisterInput, Session, User } from '@shared/types';
import { ApiError } from '@shared/api';
import { api, setAuthToken } from '@/api/client';
import { readStorage, writeStorage } from '@/lib/storage';
import { isCustomerRole } from '@/lib/roles';
import { useCart } from '@/stores/cart';
import { removeUserQueries, resetUserQueries, setUnauthorizedHandler } from '@/lib/queryClient';

export const TOKEN_KEY = 'altinger.token';

function loadToken(): string | null {
  return readStorage(TOKEN_KEY, 'session') ?? readStorage(TOKEN_KEY, 'local');
}

function saveToken(token: string | null): void {
  writeStorage(TOKEN_KEY, token, 'local');
  writeStorage(TOKEN_KEY, token, 'session');
}

const initialToken = loadToken();
// Token sofort an den Transport geben – auch API-Aufrufe vor refresh() sind dann angemeldet
setAuthToken(initialToken);

export type SessionStatus = 'loading' | 'guest' | 'authenticated';

export interface SessionState {
  status: SessionStatus;
  session: Session | null;
  user: User | null;
  token: string | null;
  login(email: string, password: string): Promise<Session>;
  demoLogin(userId: ID): Promise<Session>;
  /** Registrierung Privatkunde (meldet direkt an) */
  register(input: RegisterInput): Promise<Session>;
  /** Antrag Geschäftskunde (meldet direkt an, Konto zunächst "wird geprüft") */
  requestBusinessAccount(input: BusinessRequestInput): Promise<Session>;
  logout(): Promise<void>;
  /** Sitzung zum gespeicherten Token neu laden (api.me) */
  refresh(): Promise<Session | null>;
  /** Sitzung übernehmen (z. B. nach eigener API-Anmeldung); null = abmelden ohne Serveraufruf */
  applySession(session: Session | null): void;
}

let refreshing: Promise<Session | null> | null = null;

export const useSession = create<SessionState>()((set, get) => {
  function apply(session: Session | null): void {
    const prevUserId = get().user?.id ?? null;
    const token = session?.token ?? null;
    setAuthToken(token);
    saveToken(token);
    set({
      status: session ? 'authenticated' : 'guest',
      session,
      user: session?.user ?? null,
      token,
    });
    const nextUserId = session?.user.id ?? null;
    // Warenkorb-Angaben (Adresse, Zahlart, Kostenstelle …) gehören zum jeweiligen Kunden
    if (session && isCustomerRole(session.user.role)) useCart.getState().bindUser(session.user.id);
    if (prevUserId !== nextUserId) {
      if (session) void resetUserQueries();
      // Abmelden: erst nach dem Rendern aufräumen, damit geschützte Seiten zuvor wegnavigieren
      else window.setTimeout(removeUserQueries, 0);
    }
  }

  return {
    status: 'loading',
    session: null,
    user: null,
    token: initialToken,

    async login(email, password) {
      const session = await api.login(email.trim(), password);
      apply(session);
      return session;
    },

    async demoLogin(userId) {
      const session = await api.demoLogin(userId);
      apply(session);
      return session;
    },

    async register(input) {
      const session = await api.register(input);
      apply(session);
      return session;
    },

    async requestBusinessAccount(input) {
      const session = await api.requestBusinessAccount(input);
      apply(session);
      return session;
    },

    async logout() {
      try {
        if (get().token) await api.logout();
      } catch {
        // Abmelden klappt lokal immer – auch ohne Serververbindung
      }
      apply(null);
    },

    refresh() {
      if (refreshing) return refreshing;
      refreshing = (async () => {
        const token = get().token ?? loadToken();
        if (!token) {
          apply(null);
          return null;
        }
        setAuthToken(token);
        try {
          const session = await api.me();
          apply(session);
          return session;
        } catch (err) {
          if (err instanceof ApiError && (err.code === 'unauthorized' || err.code === 'forbidden')) {
            apply(null);
            return null;
          }
          // Netzwerkproblem: Zustand nicht verwerfen
          if (get().status === 'loading') set({ status: 'guest' });
          throw err;
        }
      })().finally(() => {
        refreshing = null;
      });
      return refreshing;
    },

    applySession(session) {
      apply(session);
    },
  };
});

// Abgelaufene Sitzung (z. B. nach Server-Neustart ohne Daten) erkennen und sauber abmelden
let lastUnauthorizedCheck = 0;
setUnauthorizedHandler(() => {
  const s = useSession.getState();
  if (s.status !== 'authenticated') return;
  const now = Date.now();
  if (now - lastUnauthorizedCheck < 5000) return;
  lastUnauthorizedCheck = now;
  s.refresh().catch(() => {});
});

/** Angemeldeter Nutzer oder null */
export function useUser(): User | null {
  return useSession((s) => s.user);
}

/** Rolle des angemeldeten Nutzers oder null (Gast) */
export function useRole(): User['role'] | null {
  return useSession((s) => s.user?.role ?? null);
}
