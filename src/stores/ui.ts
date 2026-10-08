/**
 * Oberflächen-Zustand (nicht serverseitig): Demo-Pille, Seitenleiste, Hinweise.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isStandalone } from '@/lib/platform';

/** Demo-Pille: 'auto' = auf Desktop sichtbar, auf Handy/Tablet (< lg) und in der installierten App ausgeblendet */
export type DemoPillPreference = 'auto' | 'show' | 'hide';

const DESKTOP_QUERY = '(min-width: 1024px)';
const STANDALONE_QUERY = '(display-mode: standalone)';

function matches(query: string): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** Ist die Demo-Pille bei dieser Einstellung auf diesem Gerät gerade sichtbar? */
export function demoPillVisible(pref: DemoPillPreference): boolean {
  if (pref === 'show') return true;
  if (pref === 'hide') return false;
  return matches(DESKTOP_QUERY) && !isStandalone();
}

interface UiState {
  /** Einstellung zur Demo-Pille (persistiert) */
  demoPill: DemoPillPreference;
  /**
   * Demo-Pille JETZT sichtbar (aus Einstellung, Bildschirmbreite und Standalone-Modus abgeleitet;
   * Tastenkürzel Alt+D). Feste Leisten können damit ausweichen.
   */
  demoBarVisible: boolean;
  /** Pille ein-/ausblenden (merkt sich die Wahl) */
  setDemoBarVisible(visible: boolean): void;
  toggleDemoBar(): void;
  /** Demo-Umschalter (Sheet) geöffnet */
  demoOpen: boolean;
  setDemoOpen(open: boolean): void;
  /** Admin-Seitenleiste auf Desktop eingeklappt (persistiert) */
  adminSidebarCollapsed: boolean;
  setAdminSidebarCollapsed(collapsed: boolean): void;
  /** Mobile Navigation (Admin-Drawer) geöffnet */
  mobileNavOpen: boolean;
  setMobileNavOpen(open: boolean): void;
  /** Ansage-Banner geschlossen (Text, damit neue Ansagen wieder erscheinen; persistiert) */
  dismissedAnnouncement: string | null;
  dismissAnnouncement(text: string): void;
  /** Installationshinweis zuletzt geschlossen (ms) */
  installDismissedAt: number | null;
  dismissInstall(): void;
}

type Persisted = Pick<UiState, 'demoPill' | 'adminSidebarCollapsed' | 'installDismissedAt' | 'dismissedAnnouncement'>;

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      demoPill: 'auto',
      demoBarVisible: demoPillVisible('auto'),
      setDemoBarVisible: (visible) => {
        const demoPill: DemoPillPreference = visible ? 'show' : 'hide';
        set({ demoPill, demoBarVisible: demoPillVisible(demoPill) });
      },
      toggleDemoBar: () => get().setDemoBarVisible(!get().demoBarVisible),
      demoOpen: false,
      setDemoOpen: (demoOpen) => set({ demoOpen }),
      adminSidebarCollapsed: false,
      setAdminSidebarCollapsed: (adminSidebarCollapsed) => set({ adminSidebarCollapsed }),
      mobileNavOpen: false,
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      dismissedAnnouncement: null,
      dismissAnnouncement: (text) => set({ dismissedAnnouncement: text }),
      installDismissedAt: null,
      dismissInstall: () => set({ installDismissedAt: Date.now() }),
    }),
    {
      name: 'altinger.ui',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Persisted => ({
        demoPill: s.demoPill,
        adminSidebarCollapsed: s.adminSidebarCollapsed,
        installDismissedAt: s.installDismissedAt,
        dismissedAnnouncement: s.dismissedAnnouncement,
      }),
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Partial<Persisted> & { demoBarVisible?: boolean };
        if (version < 2) {
          // v1 kannte nur sichtbar/unsichtbar; "sichtbar" war der Standard → automatisch
          return {
            demoPill: old.demoBarVisible === false ? 'hide' : 'auto',
            adminSidebarCollapsed: !!old.adminSidebarCollapsed,
            installDismissedAt: typeof old.installDismissedAt === 'number' ? old.installDismissedAt : null,
            dismissedAnnouncement: null,
          } satisfies Persisted;
        }
        return old as Persisted;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Persisted>;
        const demoPill: DemoPillPreference = p.demoPill === 'show' || p.demoPill === 'hide' ? p.demoPill : 'auto';
        return { ...current, ...p, demoPill, demoBarVisible: demoPillVisible(demoPill) };
      },
    },
  ),
);

// Sichtbarkeit bei Drehung/Größenänderung bzw. Installation neu bestimmen
if (typeof window !== 'undefined' && window.matchMedia) {
  const recompute = () => {
    const { demoPill, demoBarVisible } = useUi.getState();
    const next = demoPillVisible(demoPill);
    if (next !== demoBarVisible) useUi.setState({ demoBarVisible: next });
  };
  for (const q of [DESKTOP_QUERY, STANDALONE_QUERY]) {
    try {
      window.matchMedia(q).addEventListener('change', recompute);
    } catch {
      /* ältere Browser: Sichtbarkeit bleibt beim Startwert */
    }
  }
}
