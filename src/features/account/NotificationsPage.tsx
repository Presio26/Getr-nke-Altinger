import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, BellRing, CheckCheck, Inbox } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@shared/types';
import { formatDate } from '@shared/format';
import { dayString, todayString, addDays } from '@shared/time';
import { api } from '@/api/client';
import { qk, useNotifications } from '@/api/hooks';
import { notificationPermission, requestNotificationPermission, showNotification } from '@/lib/notifications';
import { NotificationItem } from '@/components/layout';
import { Button, Card, EmptyState, ErrorState, PageHeader, SegmentedControl, Skeleton, errorMessage, toast } from '@/components/ui';

function dayHeading(day: string): string {
  const today = todayString();
  if (day === today) return 'Heute';
  if (day === addDays(today, -1)) return 'Gestern';
  if (day > addDays(today, -7)) return formatDate(day, 'weekday');
  return formatDate(day, 'long');
}

function PermissionBanner() {
  const [permission, setPermission] = useState(() => notificationPermission());
  if (permission !== 'default') return null;
  const enable = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') {
      toast.success('Browser-Benachrichtigungen sind aktiv.');
      void showNotification('Getränke Altinger', { body: 'Wir melden uns, sobald sich bei Ihrer Bestellung etwas tut.', tag: 'altinger-test' });
    }
  };
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm">
        <BellRing size={19} aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm text-brand-900">
        <strong className="font-semibold">Keine Lieferung mehr verpassen:</strong> Erlauben Sie Browser-Benachrichtigungen – dann sagen wir Bescheid, wenn der Fahrer losfährt,
        auch wenn die App im Hintergrund ist.
      </p>
      <Button size="sm" variant="primary" icon={BellRing} onClick={() => void enable()} className="self-start sm:self-center">
        Aktivieren
      </Button>
    </div>
  );
}

/** Alle Benachrichtigungen mit Filter „ungelesen“, „Alle als gelesen“ und Link-Navigation */
export default function NotificationsPage() {
  const { data, isLoading, error, refetch } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);

  const list = data ?? [];
  const unread = list.filter((n) => !n.read).length;
  const visible = filter === 'unread' ? list.filter((n) => !n.read) : list;

  const groups = useMemo(() => {
    const out: { day: string; items: AppNotification[] }[] = [];
    for (const n of visible) {
      const day = dayString(new Date(n.createdAt));
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(n);
      else out.push({ day, items: [n] });
    }
    return out;
  }, [visible]);

  const markRead = async (ids?: string[]) => {
    const prev = qc.getQueryData<AppNotification[]>(qk.notifications);
    qc.setQueryData<AppNotification[]>(qk.notifications, (old) => old?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    try {
      await api.markNotificationsRead(ids);
    } catch (err) {
      if (prev) qc.setQueryData(qk.notifications, prev);
      throw err;
    } finally {
      void qc.invalidateQueries({ queryKey: qk.notifications });
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await markRead();
      toast.success('Alle Benachrichtigungen als gelesen markiert.', { id: 'notifications-read' });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = (n: AppNotification) => {
    if (!n.read) void markRead([n.id]).catch(() => {});
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <PageHeader
        title="Benachrichtigungen"
        subtitle={unread ? `${unread} ungelesen – Neuigkeiten zu Bestellungen, Lieferungen und Angeboten.` : 'Neuigkeiten zu Bestellungen, Lieferungen und Angeboten.'}
        back
        icon={Bell}
      />
      <PermissionBanner />
      <div className="max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            aria-label="Filter"
            value={filter}
            onChange={(v) => setFilter(v as 'all' | 'unread')}
            options={[
              { value: 'all', label: `Alle${list.length ? ` (${list.length})` : ''}` },
              { value: 'unread', label: `Ungelesen${unread ? ` (${unread})` : ''}` },
            ]}
          />
          <Button variant="ghost" size="sm" icon={CheckCheck} onClick={() => void markAll()} disabled={!unread} loading={busy}>
            Alle als gelesen
          </Button>
        </div>

        {isLoading ? (
          <Card padding="sm" className="space-y-2" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </Card>
        ) : error ? (
          <Card>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            {filter === 'unread' && list.length ? (
              <EmptyState
                icon={CheckCheck}
                title="Alles gelesen"
                description="Sie haben keine ungelesenen Benachrichtigungen."
                action={
                  <Button variant="outline" onClick={() => setFilter('all')}>
                    Alle anzeigen
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={list.length ? Inbox : BellOff} title="Noch keine Benachrichtigungen" description="Hier erscheinen Hinweise zu Ihren Bestellungen, zur Lieferung und zu Aktionen." />
            )}
          </Card>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.day} aria-label={dayHeading(g.day)}>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{dayHeading(g.day)}</h2>
                <Card padding="none" className="divide-y divide-slate-100 overflow-hidden p-1.5">
                  {g.items.map((n) => (
                    <div key={n.id} className="py-0.5">
                      <NotificationItem n={n} onOpen={open} />
                    </div>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
