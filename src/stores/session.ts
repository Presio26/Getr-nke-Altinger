/**
 * Anmeldung: Token, aktueller Nutzer, Login/Logout.
 *
 * Sitzung je Tab: Das Token des Tabs liegt im sessionStorage ("altinger.token") und hat beim Neuladen
 * immer Vorrang – jeder Tab behält „seinen“ Nutzer (Demo mit Kunde, Fahrer und Markt in mehreren Tabs).
 * localStorage hält nur die zuletzt AUSDRÜCKLICH gewählte Anmeldung (Login, Demo-Login, Abmelden) als
 * Startwert für NEUE Tabs; ein Login in Tab B schaltet Tab A daher nie um – auch nicht beim Neuladen.
 *
 * Das Token wird nur bei einer echten 401-Antwort des Servers (oder beim Abmelden) gelöscht – nie beim
 * Start, etwa wenn der Server gerade nicht erreichbar ist oder die App im lokalen Modus läuft. Tokens des
 * lokalen Modus liegen getrennt ("altinger.token.local"), damit eine Offline-Demo die Server-Anmeldung nicht
 * überschreibt.
 */
import { create } from 'zustand';
import type { BusinessRequestInput, ID, RegisterInput, Session, User } from '@shared/types';
import { ApiError } from '@shared/api';
import { api, getApiMode, setAuthToken, type ApiMode } from '@/api/client';
import { readStorage, writeStorage } from '@/lib/storage';
import { isCustomerRole } from '@/lib/roles';
import { useCart } from '@/stores/cart';
import { removeUserQueries, resetUserQueries, setUnauthorizedHandler } from '@/lib/queryClient';

export const TOKEN_KEY = 'altinger.token';

function tokenKey(mode: ApiMode = getApiMode()): string {
  return mode === 'local' ? `${TOKEN_KEY}.local` : TOKEN_KEY;
}

/** Token dieses Tabs (sessionStorage) – sonst die zuletzt gewählte Anmeldung (localStorage) als Startwert */
function loadToken(mode: ApiMode = getApiMode()): string | null {
  const key = tokenKey(mode);
  const own = readStorage(key, 'session');
  if (own) return own;
  // Tab hat schon einen eigenen Stand (z. B. hier abgemeldet) → nicht die Anmeldung anderer Tabs übernehmen
  if (readStorage(`${key}.tab`, 'session')) return null;
  const shared = readStorage(key, 'local');
  // sofort an den Tab binden: spätere Logins in anderen Tabs ändern diesen Tab nicht mehr
  writeStorage(`${key}.tab`, '1', 'session');
  if (shared) {
    writeStorage(key, shared, 'session');
    // übernommene Sitzung (teilt sich das Token mit dem Tab, in dem angemeldet wurde)
    writeStorage(`${key}.inherited`, '1', 'session');
  }
  return shared;
}

/** true, wenn dieser Tab sein Token nur von einem anderen Tab übernommen hat */
function tokenInherited(): boolean {
  return readStorage(`${tokenKey()}.inherited`, 'session') === '1';
}

/** Token speichern. `shared` = auch als Startwert für neue Tabs (nur bei ausdrücklicher An-/Abmeldung). */
function saveToken(token: string | null, shared: boolean): void {
  const key = tokenKey();
  const previous = readStorage(key, 'session');
  writeStorage(`${key}.tab`, '1', 'session');
  writeStorage(key, token, 'session');
  if (token !== previous) writeStorage(`${key}.inherited`, null, 'session');
  if (shared) writeStorage(key, token, 'local');
}

let tokenMode: ApiMode = getApiMode();
const initialToken = loadToken(tokenMode);
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
  /**
   * Sitzung zum gespeicherten Token neu laden (api.me). Kennt der Server das Token nicht, ist der Tab
   * danach Gast – das Token bleibt aber gespeichert (z. B. lokaler Modus). Gelöscht wird es nur mit
   * `{ unauthorized: true }` (nach einer echten 401-Antwort).
   */
  refresh(options?: { unauthorized?: boolean }): Promise<Session | null>;
  /** Sitzung übernehmen (z. B. nach eigener API-Anmeldung); null = abmelden ohne Serveraufruf */
  applySession(session: Session | null): void;
}

let refreshing: Promise<Session | null> | null = null;

export const useSession = create<SessionState>()((set, get) => {
  /** Sitzung übernehmen; `shared` = ausdrückliche An-/Abmeldung (Startwert für neue Tabs) */
  function apply(session: Session | null, shared = true): void {
    const prevUserId = get().user?.id ?? null;
    const token = session?.token ?? null;
    setAuthToken(token);
    saveToken(token, shared);
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
        // Übernommene Sitzung: nur in diesem Tab abmelden – der Tab, der sich angemeldet hat, bleibt angemeldet
        if (get().token && !tokenInherited()) await api.logout();
      } catch {
        // Abmelden klappt lokal immer – auch ohne Serververbindung
      }
      apply(null);
    },

    refresh(options = {}) {
      if (refreshing) return refreshing;
      refreshing = (async () => {
        // Modus steht erst nach initApi() fest (z. B. ?api=local) → passendes Token laden
        const mode = getApiMode();
        if (mode !== tokenMode) {
          tokenMode = mode;
          set({ token: loadToken(mode) });
        }
        const token = get().token ?? loadToken(mode);
        if (!token) {
          if (get().status !== 'guest' || get().user) apply(null, false);
          else set({ status: 'guest' });
          return null;
        }
        setAuthToken(token);
        try {
          const session = await api.me();
          if (session) {
            apply(session, false);
            return session;
          }
          if (options.unauthorized) {
            // echte 401-Antwort und der Server kennt das Token nicht → abmelden
            apply(null, false);
            return null;
          }
          // Token unbekannt (z. B. lokaler Modus oder Daten neu erzeugt): Gast, Token aber NICHT löschen
          const prevUserId = get().user?.id ?? null;
          set({ status: 'guest', session: null, user: null, token });
          if (prevUserId) window.setTimeout(removeUserQueries, 0);
          return null;
        } catch (err) {
          if (err instanceof ApiError && err.code === 'unauthorized') {
            apply(null, false);
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
  s.refresh({ unauthorized: true }).catch(() => {});
});

/** Angemeldeter Nutzer oder null */
export function useUser(): User | null {
  return useSession((s) => s.user);
}

/** Rolle des angemeldeten Nutzers oder null (Gast) */
export function useRole(): User['role'] | null {
  return useSession((s) => s.user?.role ?? null);
}
