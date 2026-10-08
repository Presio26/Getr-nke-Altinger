/**
 * Markt: Click & Collect – Abholungen heute/morgen nach Zeitfenster, Abholcode prüfen
 * (Eingabe oder Kamera-Scan) und Übergabe verbuchen.
 */
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Clock, PackageCheck, ScanLine, Search, ShoppingBag } from 'lucide-react';
import type { Order } from '@shared/types';
import { ApiError } from '@shared/api';
import { formatDate, formatEuro } from '@shared/format';
import { addDays, timeString, todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Badge, Button, Card, EmptyState, ErrorState, Input, OrderStatusBadge, PageHeader, Skeleton, Tabs, errorMessage } from '@/components/ui';
import { useAdminOrder, useAdminOrders } from './ops/api';
import { hasBarcodeDetector } from './ops/hooks';
import { OPEN_STATUSES, orderCrates, windowLabel } from './ops/model';
import { B2BTag } from './ops/components/OrderBits';
import { QuickStepButton } from './ops/components/StatusActions';
import { PickupModal, QrScannerModal, paymentInfo } from './ops/components/Pickup';

type TabId = 'heute' | 'morgen' | 'ueberfaellig';

function groupByWindow(orders: Order[]): { key: string; start: string; end: string; orders: Order[] }[] {
  const map = new Map<string, { key: string; start: string; end: string; orders: Order[] }>();
  for (const o of orders) {
    const key = `${o.slot.date} ${o.slot.start}-${o.slot.end}`;
    const g = map.get(key) ?? { key, start: o.slot.start, end: o.slot.end, orders: [] };
    g.orders.push(o);
    map.set(key, g);
  }
  const rank = (o: Order) => (o.status === 'picked_up' ? 2 : o.status === 'cancelled' ? 3 : 0);
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => ({ ...g, orders: g.orders.sort((a, b) => rank(a) - rank(b) || a.customerName.localeCompare(b.customerName, 'de')) }));
}

function PickupRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const pay = paymentInfo(order);
  const done = order.status === 'picked_up' || order.status === 'cancelled';
  return (
    <li>
      <div
        className={cn(
          'relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-slate-50 has-[.row-link:focus-visible]:bg-brand-50/60 sm:flex-nowrap',
          done && 'opacity-70',
        )}
      >
        <span className="w-[5.5rem] shrink-0 rounded-lg bg-slate-900 px-2 py-1.5 text-center font-mono text-[13px] font-bold tracking-[0.12em] text-white">
          {order.pickupCode ?? '––––––'}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="row-link flex max-w-full items-center gap-1.5 text-left text-[15px] font-semibold text-slate-900 outline-none after:absolute after:inset-0 after:content-['']"
          >
            <span className="truncate">{order.customerName}</span>
            <B2BTag type={order.customerType} />
          </button>
          <p className="truncate text-xs text-slate-500">
            {order.number} · {orderCrates(order)} Geb. · {pay.due ? `${formatEuro(order.totals.total)} ${order.totals.total < 0 ? 'auszahlen' : 'kassieren'}` : pay.title.toLowerCase()}
            {order.emptiesReturn.length ? ' · mit Leergut' : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-between max-sm:pl-[6.25rem]">
          <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
          <span className="relative z-[1] empty:hidden">
            <QuickStepButton order={order} arrow={false} />
          </span>
        </div>
      </div>
    </li>
  );
}

export default function PickupsPage() {
  const now = useNow(30_000);
  const today = todayString(now);
  const tomorrow = addDays(today, 1);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>('heute');
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const canScan = useMemo(() => hasBarcodeDetector(), []);

  const todayQ = useAdminOrders(useMemo(() => ({ fulfillment: 'pickup' as const, date: today }), [today]));
  const tomorrowQ = useAdminOrders(useMemo(() => ({ fulfillment: 'pickup' as const, date: tomorrow }), [tomorrow]));
  const openQ = useAdminOrders(useMemo(() => ({ fulfillment: 'pickup' as const, status: OPEN_STATUSES }), []));
  const overdue = useMemo(() => (openQ.data ?? []).filter((o) => o.slot.date < today), [openQ.data, today]);
  const { data: openOrder } = useAdminOrder(openId ?? undefined);

  const todayList = todayQ.data ?? [];
  const lists: Record<TabId, Order[]> = { heute: todayList, morgen: tomorrowQ.data ?? [], ueberfaellig: overdue };
  const current = lists[tab];
  const active = tab === 'heute' ? todayQ : tab === 'morgen' ? tomorrowQ : openQ;
  const groups = groupByWindow(current);
  const nowTime = timeString(now);

  const readyCount = todayList.filter((o) => o.status === 'ready').length;
  const doneCount = todayList.filter((o) => o.status === 'picked_up').length;
  const waiting = todayList.filter((o) => ['pending', 'confirmed', 'picking'].includes(o.status)).length;

  const check = async (raw: string) => {
    const value = raw.trim();
    if (!value) {
      setCheckError('Bitte geben Sie einen Abholcode ein oder scannen Sie den QR-Code.');
      inputRef.current?.focus();
      return;
    }
    setChecking(true);
    setCheckError(null);
    try {
      const order = await api.adminFindPickup(value);
      qc.setQueryData(qk.adminOrder(order.id), order);
      setOpenId(order.id);
      setCode('');
    } catch (err) {
      setCheckError(err instanceof ApiError && err.code === 'not_found' ? `Zu „${value.length > 24 ? `${value.slice(0, 24)}…` : value.toUpperCase()}“ wurde keine Reservierung gefunden. Bitte Code prüfen.` : errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void check(code);
  };

  const closeModal = () => setOpenId(null);
  const nextCode = () => {
    setOpenId(null);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <>
      <PageHeader
        title="Abholungen"
        documentTitle="Abholungen"
        subtitle={`Click & Collect · ${formatDate(today, 'long')}`}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[25rem_minmax(0,1fr)]">
        {/* Code prüfen */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <Card className="overflow-hidden">
            <div className="-mx-4 -mt-4 mb-4 bg-brand-900 px-4 pb-5 pt-4 text-white sm:-mx-5 sm:-mt-5 sm:px-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <ScanLine size={18} aria-hidden /> Abholcode prüfen
              </p>
              <p className="mt-1 text-sm text-white/70">Code aus der Bestätigung, Bestellnummer oder QR-Inhalt – mit Enter bestätigen.</p>
            </div>
            <form onSubmit={onSubmit} className="space-y-3" noValidate>
              <Input
                ref={inputRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCheckError(null);
                }}
                placeholder="z. B. K7Q2X9"
                aria-label="Abholcode"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={80}
                icon={Search}
                error={checkError}
                className="!h-14 font-mono !text-xl font-bold uppercase tracking-[0.18em] placeholder:font-sans placeholder:normal-case placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
              />
              <div className="flex gap-2">
                <Button type="submit" size="lg" icon={CheckCircle2} loading={checking} block className="flex-1">
                  Prüfen
                </Button>
                {canScan ? (
                  <Button type="button" size="lg" variant="outline" icon={Camera} onClick={() => setScanOpen(true)} aria-label="QR-Code mit der Kamera scannen">
                    Scannen
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center shadow-card">
              <p className="text-2xl font-bold tabular-nums text-slate-900">{waiting}</p>
              <p className="text-xs font-medium text-slate-500">in Vorbereitung</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center shadow-card">
              <p className="text-2xl font-bold tabular-nums text-emerald-700">{readyCount}</p>
              <p className="text-xs font-medium text-emerald-800">abholbereit</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-3 text-center shadow-card">
              <p className="text-2xl font-bold tabular-nums text-slate-900">{doneCount}</p>
              <p className="text-xs font-medium text-slate-500">abgeholt</p>
            </div>
          </div>
        </div>

        {/* Liste */}
        <div className="min-w-0">
          <Tabs
            aria-label="Tag"
            value={tab}
            onChange={(v) => setTab(v as TabId)}
            className="mb-4"
            tabs={[
              { id: 'heute', label: 'Heute', count: todayList.length },
              { id: 'morgen', label: `Morgen, ${formatDate(tomorrow, 'medium')}`, count: tomorrowQ.data?.length ?? 0 },
              ...(overdue.length ? [{ id: 'ueberfaellig', label: 'Nicht abgeholt', count: overdue.length }] : []),
            ]}
          />
          {active.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full rounded-2xl" />
            </div>
          ) : active.error ? (
            <Card>
              <ErrorState error={active.error} onRetry={() => void active.refetch()} />
            </Card>
          ) : !current.length ? (
            <Card>
              <EmptyState
                icon={ShoppingBag}
                title={tab === 'morgen' ? 'Für morgen ist noch nichts reserviert' : tab === 'heute' ? 'Heute keine Abholungen' : 'Keine offenen Reservierungen'}
                description="Neue Click-&-Collect-Bestellungen erscheinen hier automatisch."
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const isNow = tab === 'heute' && nowTime >= g.start && nowTime < g.end;
                const past = tab === 'heute' && nowTime >= g.end;
                const open = g.orders.filter((o) => o.status !== 'picked_up' && o.status !== 'cancelled').length;
                return (
                  <Card key={g.key} padding="none" className={cn('overflow-hidden', isNow && 'border-brand-300 ring-2 ring-brand-500/15')}>
                    <div className={cn('flex items-center gap-3 border-b px-4 py-2.5', isNow ? 'border-brand-100 bg-brand-50' : 'border-slate-100 bg-slate-50/70')}>
                      <Clock size={16} aria-hidden className={isNow ? 'text-brand-700' : 'text-slate-400'} />
                      <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                        {tab === 'ueberfaellig' ? `${formatDate(g.key.slice(0, 10), 'medium')} · ` : ''}
                        {windowLabel(g)}
                      </p>
                      {isNow ? (
                        <Badge tone="brand" solid>
                          Jetzt
                        </Badge>
                      ) : past && open ? (
                        <Badge tone="warning">überfällig</Badge>
                      ) : null}
                      <span className="text-xs font-medium text-slate-500">
                        {open ? `${open} offen` : (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <PackageCheck size={13} aria-hidden /> erledigt
                          </span>
                        )}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {g.orders.map((o) => (
                        <PickupRow key={o.id} order={o} onOpen={() => setOpenId(o.id)} />
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <PickupModal order={openId ? openOrder ?? null : null} onClose={closeModal} onNext={nextCode} />
      <QrScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={(value) => {
          setScanOpen(false);
          void check(value);
        }}
      />
    </>
  );
}
