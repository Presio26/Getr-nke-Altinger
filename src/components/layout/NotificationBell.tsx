import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellOff, BellRing, CheckCheck, FileText, Megaphone, Package, PackageSearch, Settings2, Truck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@shared/types';
import { formatRelative } from '@shared/format';
import { api } from '@/api/client';
import { qk, useNotifications } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useClickOutside } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { notificationPermission, requestNotificationPermission } from '@/lib/notifications';
import { IconButton, Skeleton } from '@/components/ui';

const KIND_ICON = {
  order: Package,
  delivery: Truck,
  system: Settings2,
  promo: Megaphone,
  stock: PackageSearch,
  invoice: FileText,
} as const;

const KIND_COLOR = {
  order: 'bg-brand-50 text-brand-700',
  delivery: 'bg-emerald-50 text-emerald-700',
  system: 'bg-slate-100 text-slate-600',
  promo: 'bg-accent-100 text-accent-800',
  stock: 'bg-amber-50 text-amber-700',
  invoice: 'bg-sky-50 text-sky-700',
} as const;

export function NotificationItem({ n, onOpen, compact = false }: { n: AppNotification; onOpen?: (n: AppNotification) => void; compact?: boolean }) {
  const Icon = KIND_ICON[n.kind] ?? Bell;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(n)}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50',
        !n.read && 'bg-brand-50/40',
      )}
    >
      <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', KIND_COLOR[n.kind] ?? KIND_COLOR.system)}>
        <Icon size={17} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={cn('text-sm leading-snug text-slate-900', !n.read ? 'font-semibold' : 'font-medium')}>{n.title}</span>
          {!n.read ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="ungelesen" /> : null}
        </span>
        <span className={cn('mt-0.5 block text-[13px] leading-snug text-slate-500', compact && 'line-clamp-2')}>{n.body}</span>
        <span className="mt-1 block text-xs text-slate-400">{formatRelative(n.createdAt)}</span>
      </span>
    </button>
  );
}

/** Glocke mit Ungelesen-Zahl und Schnellübersicht */
export function NotificationBell({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const authenticated = useSession((s) => s.status === 'authenticated');
  const { data, isLoading } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [permission, setPermission] = useState(() => notificationPermission());
  if (!authenticated) return null;

  const list = data ?? [];
  const unread = list.filter((n) => !n.read).length;

  const markRead = async (ids?: string[]) => {
    qc.setQueryData<AppNotification[]>(qk.notifications, (prev) =>
      prev?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
    );
    try {
      await api.markNotificationsRead(ids);
    } finally {
      void qc.invalidateQueries({ queryKey: qk.notifications });
    }
  };

  const openItem = (n: AppNotification) => {
    setOpen(false);
    if (!n.read) void markRead([n.id]);
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <IconButton
        icon={Bell}
        label="Benachrichtigungen"
        badge={unread}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={tone === 'dark' ? 'text-white hover:bg-white/10 hover:text-white active:bg-white/15' : undefined}
      />
      {open ? (
        <div
          role="dialog"
          aria-label="Benachrichtigungen"
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4rem)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-pop-in sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-[15px] font-bold text-slate-900">Benachrichtigungen</p>
            {unread ? (
              <button type="button" onClick={() => void markRead()} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
                <CheckCheck size={15} aria-hidden /> Alle gelesen
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(26rem,60dvh)] overflow-y-auto p-1.5">
            {isLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-slate-500">
                <BellOff size={26} className="text-slate-300" aria-hidden />
                Noch keine Benachrichtigungen.
              </div>
            ) : (
              list.slice(0, 8).map((n) => <NotificationItem key={n.id} n={n} onOpen={openItem} compact />)
            )}
          </div>
          {permission === 'default' ? (
            <button
              type="button"
              onClick={async () => setPermission(await requestNotificationPermission())}
              className="flex w-full items-center justify-center gap-2 border-t border-slate-100 bg-brand-50/50 px-4 py-2.5 text-[13px] font-semibold text-brand-800 hover:bg-brand-50"
            >
              <BellRing size={15} aria-hidden /> Browser-Hinweise aktivieren
            </button>
          ) : null}
          <Link
            to="/konto/benachrichtigungen"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-semibold text-brand-700 hover:bg-slate-50"
          >
            Alle Benachrichtigungen anzeigen
          </Link>
        </div>
      ) : null}
    </div>
  );
}
