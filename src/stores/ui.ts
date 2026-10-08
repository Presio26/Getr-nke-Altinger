/**
 * Oberflächen-Zustand (nicht serverseitig): Demo-Leiste, Seitenleiste, Hinweise.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UiState {
  /** Demo-Pille sichtbar (persistiert, Tastenkürzel Alt+D) */
  demoBarVisible: boolean;
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
  /** Ansage-Banner in dieser Sitzung geschlossen (Text, damit neue Ansagen wieder erscheinen) */
  dismissedAnnouncement: string | null;
  dismissAnnouncement(text: string): void;
  /** Installationshinweis zuletzt geschlossen (ms) */
  installDismissedAt: number | null;
  dismissInstall(): void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      demoBarVisible: true,
      setDemoBarVisible: (demoBarVisible) => set({ demoBarVisible }),
      toggleDemoBar: () => set((s) => ({ demoBarVisible: !s.demoBarVisible })),
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
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        demoBarVisible: s.demoBarVisible,
        adminSidebarCollapsed: s.adminSidebarCollapsed,
        installDismissedAt: s.installDismissedAt,
      }),
    },
  ),
);
