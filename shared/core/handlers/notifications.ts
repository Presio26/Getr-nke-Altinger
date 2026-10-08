/**
 * Benachrichtigungen des angemeldeten Nutzers (inkl. Rollen-Broadcasts).
 */
import type { CoreHandlers } from '../../api';
import type { AppNotification, User } from '../../types';
import type { Engine } from '../engine';
import { requireUser } from '../access';

export function isRecipient(user: User, n: AppNotification): boolean {
  if (n.recipient === user.id) return true;
  if (n.recipient === 'admin') return user.role === 'admin';
  if (n.recipient === 'drivers') return user.role === 'driver';
  return false;
}

export function notificationHandlers(e: Engine): Pick<CoreHandlers, 'listNotifications' | 'markNotificationsRead'> {
  return {
    listNotifications(ctx) {
      const user = requireUser(ctx);
      // neueste zuerst; bei gleichem Zeitstempel die zuletzt angelegte
      return e.db.notifications
        .map((n, i) => ({ n, i }))
        .filter(({ n }) => isRecipient(user, n))
        .sort((a, b) => b.n.createdAt.localeCompare(a.n.createdAt) || b.i - a.i)
        .slice(0, 100)
        .map(({ n }) => n);
    },

    markNotificationsRead(ctx, ids) {
      const user = requireUser(ctx);
      const only = Array.isArray(ids) ? new Set(ids) : null;
      for (const n of e.db.notifications) {
        if (!isRecipient(user, n)) continue;
        if (only && !only.has(n.id)) continue;
        n.read = true;
      }
    },
  };
}
