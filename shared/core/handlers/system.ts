/**
 * System: Bootstrap und Demo-Reset.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type { DemoUser } from '../../types';
import type { Engine } from '../engine';
import { reseedDb } from '../seed';
import { DEMO_USER_INFO } from '../seed/people';
import { publicSettings } from '../access';

/** App-Version – gemeinsame Quelle für Server (/api/health), Bootstrap und Oberfläche; muss zu package.json passen */
export const CORE_VERSION = '1.0.0';

export function demoUsers(e: Engine): DemoUser[] {
  const out: DemoUser[] = [];
  for (const info of DEMO_USER_INFO) {
    const u = e.db.users.find((x) => x.id === info.id);
    if (u) out.push({ id: u.id, role: u.role, name: u.name, email: u.email, description: info.description });
  }
  return out;
}

export function systemHandlers(e: Engine): Pick<CoreHandlers, 'getBootstrap' | 'resetDemo'> {
  return {
    getBootstrap(ctx) {
      const db = e.db;
      return {
        settings: ctx.user?.role === 'admin' ? db.settings : publicSettings(db.settings),
        categories: [...db.categories].sort((a, b) => a.sort - b.sort),
        depositTypes: db.depositTypes,
        demoUsers: e.demoMode ? demoUsers(e) : [],
        mode: e.mode,
        version: CORE_VERSION,
        serverTime: ctx.now.toISOString(),
      };
    },

    resetDemo(ctx) {
      if (ctx.user?.role !== 'admin' && !e.demoMode) {
        throw new ApiError('forbidden', 'Nur die Marktleitung darf die Daten zurücksetzen.');
      }
      // Anmeldungen behalten, sofern es den Nutzer im neuen Bestand gibt
      e.setDb(reseedDb(e.db, ctx.now));
      e.emit({ type: 'data.reset' }, { all: true });
    },
  };
}
