/**
 * Markt: Bestellungen als Kanban-Board (live) oder als filterbare Liste.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ClipboardList, Columns3, Inbox, LayoutList, Phone, Search, ShoppingBag, Truck, X } from 'lucide-react';
import type { AdminOrderQuery } from '@shared/api';
import type { Driver, FulfillmentType, Order, OrderStatus } from '@shared/types';
import { ORDER_STATUS_LABEL, formatDate, formatEuro, formatRelative } from '@shared/format';
import { todayString, addDays } from '@shared/time';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { useDebouncedValue, useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  OrderStatusBadge,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  errorMessage,
  toast,
} from '@/components/ui';
import { useAdminDrivers, useAdminOrders } from './ops/api';
import { useElementWidth, useFreshIds, useParamState } from './ops/hooks';
import { BOARD_COLUMNS, DAY_RE, OPEN_STATUSES, columnOf, lastStatusAt, orderCrates, slotKey, slotShort, type BoardColumnId } from './ops/model';
import { B2BTag, FulfillmentIcon, LiveDot, SourceTag } from './ops/components/OrderBits';
import { PhoneOrderLauncher, useOpenPhoneOrder } from './ops/components/PhoneOrderLauncher';
import { useNewOrderChime } from './ops/sound';
import { OrderCard } from './ops/components/OrderCard';
import { OrderQuickView } from './ops/components/OrderQuickView';
import { QuickStepButton } from './ops/components/StatusActions';
import { DayPicker } from './ops/components/DayPicker';

type View = 'board' | 'liste';
const ALL_QUERY: AdminOrderQuery = {};

// ───────────────────────────── Board ─────────────────────────────

function useConfirmAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orders: Order[]) => {
      let ok = 0;
      for (const o of orders) {
        try {
          await api.adminUpdateOrderStatus(o.id, 'confirmed');
          ok++;
        } catch {
          // einzelne Konflikte (z. B. parallel storniert) überspringen
        }
      }
      return ok;
    },
    onSuccess: async (ok) => {
      await qc.invalidateQueries({ queryKey: qk.admin });
      toast.success(ok === 1 ? '1 Bestellung bestätigt' : `${ok} Bestellungen bestätigt`, { description: 'Die Kunden wurden benachrichtigt.' });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

function BoardColumnView({
  id,
  title,
  dot,
  orders,
  now,
  drivers,
  fresh,
  onOpen,
  bodyClassName,
  plain = false,
}: {
  id: BoardColumnId;
  title: string;
  dot: string;
  orders: Order[];
  now: Date;
  drivers: Map<string, Driver>;
  fresh: Set<string>;
  onOpen: (o: Order) => void;
  bodyClassName?: string;
  /** ohne Spaltenrahmen (Reiter-Ansicht) */
  plain?: boolean;
}) {
  const confirmAll = useConfirmAll();
  return (
    <section
      aria-label={title}
      className={cn('flex min-w-0 flex-col', !plain && 'rounded-2xl bg-slate-100/80 ring-1 ring-inset ring-slate-200/60')}
    >
      {!plain ? (
        <header className="flex min-h-12 items-center gap-2 px-2.5 pb-1.5 pt-2.5">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot)} aria-hidden />
          <h2 className="min-w-0 flex-1 text-[13px] font-bold leading-tight text-slate-700">{title}</h2>
          {orders.length ? (
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700 shadow-xs ring-1 ring-slate-200">{orders.length}</span>
          ) : (
            <span className="sr-only">0</span>
          )}
        </header>
      ) : null}
      {id === 'pending' && orders.length > 1 ? (
        <div className={cn(plain ? 'mb-3' : 'px-1.5 pb-1')}>
          <Button
            size="sm"
            variant="ghost"
            icon={CheckCheck}
            block
            loading={confirmAll.isPending}
            onClick={() => confirmAll.mutate(orders)}
            className={cn('!h-8 !text-[13px] text-brand-700', plain ? 'bg-brand-50 hover:bg-brand-100' : 'hover:bg-white')}
          >
            Alle {orders.length} bestätigen
          </Button>
        </div>
      ) : null}
      <div className={cn('flex-1 space-y-2', !plain && 'p-1.5 pt-1', bodyClassName)}>
        {orders.length ? (
          orders.map((o) => <OrderCard key={o.id} order={o} now={now} driver={o.driverId ? drivers.get(o.driverId) : undefined} fresh={fresh.has(o.id)} onOpen={onOpen} />)
        ) : (
          plain ? (
            <Card className="sm:col-span-2 lg:col-span-3">
              <EmptyState icon={Inbox} title={`Keine Bestellungen in „${title.replace('\u00AD', '')}“`} description="Sobald sich etwas ändert, erscheint es hier automatisch." className="py-8" />
            </Card>
          ) : (
            <p className="mx-1 rounded-xl border border-dashed border-slate-300/80 px-2 py-6 text-center text-[13px] text-slate-400">Keine Bestellungen</p>
          )
        )}
      </div>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-3 xl:grid-cols-6" aria-busy>
      {BOARD_COLUMNS.map((c) => (
        <div key={c.id} className="space-y-2 rounded-2xl bg-slate-100/80 p-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

function BoardView({ orders, now, drivers, fresh, onOpen }: { orders: Order[]; now: Date; drivers: Map<string, Driver>; fresh: Set<string>; onOpen: (o: Order) => void }) {
  const today = todayString(now);
  const [chosenTab, setTab] = useState<BoardColumnId | null>(null);
  const grouped = useMemo(() => {
    const g = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.id, [] as Order[]])) as Record<BoardColumnId, Order[]>;
    for (const o of orders) {
      const col = columnOf(o, today);
      if (col) g[col].push(o);
    }
    for (const c of BOARD_COLUMNS) {
      if (c.id === 'done') g[c.id].sort((a, b) => lastStatusAt(b).localeCompare(lastStatusAt(a)));
      else g[c.id].sort((a, b) => slotKey(a).localeCompare(slotKey(b)) || a.createdAt.localeCompare(b.createdAt));
    }
    return g;
  }, [orders, today]);
  // ohne Auswahl: erste Spalte mit Bestellungen
  const tab = chosenTab ?? BOARD_COLUMNS.find((c) => grouped[c.id].length)?.id ?? 'pending';
  const active = BOARD_COLUMNS.find((c) => c.id === tab) ?? BOARD_COLUMNS[0];
  const [widthRef, width] = useElementWidth<HTMLDivElement>();
  const wide = width >= 1060;

  return (
    <>
      {/* Breiter Inhaltsbereich (ab ca. 1060 px): alle Spalten nebeneinander, sonst eine Spalte je Reiter */}
      <div ref={widthRef}>
        {width === 0 ? null : wide ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: BOARD_COLUMNS.map((c) => (grouped[c.id].length ? 'minmax(0,1fr)' : 'minmax(0,0.7fr)')).join(' ') }}
          >
            {BOARD_COLUMNS.map((c) => (
              <BoardColumnView
                key={c.id}
                id={c.id}
                title={c.id === 'picking' ? 'Kommissio\u00ADnierung' : c.title}
                dot={c.dot}
                orders={grouped[c.id]}
                now={now}
                drivers={drivers}
                fresh={fresh}
                onOpen={onOpen}
                bodyClassName="max-h-[calc(100dvh-17rem)] min-h-40 overflow-y-auto overscroll-contain"
              />
            ))}
          </div>
        ) : (
          <>
            <Tabs
              aria-label="Status"
              value={tab}
              onChange={(v) => setTab(v as BoardColumnId)}
              tabs={BOARD_COLUMNS.map((c) => ({ id: c.id, label: c.title, count: grouped[c.id].length }))}
              className="mb-4"
            />
            <BoardColumnView
              id={active.id}
              title={active.title}
              dot={active.dot}
              orders={grouped[active.id]}
              now={now}
              drivers={drivers}
              fresh={fresh}
              onOpen={onOpen}
              plain
              bodyClassName="grid gap-3 space-y-0 sm:grid-cols-2 lg:grid-cols-3"
            />
          </>
        )}
      </div>
    </>
  );
}

// ───────────────────────────── Liste ─────────────────────────────

const STATUS_FILTERS: { value: string; label: string; statuses?: OrderStatus[] }[] = [
  { value: '', label: 'Alle Status' },
  { value: 'offen', label: 'In Bearbeitung', statuses: OPEN_STATUSES },
  { value: 'unterwegs', label: 'Unterwegs / Problem', statuses: ['out_for_delivery', 'failed'] },
  { value: 'erledigt', label: 'Erledigt', statuses: ['delivered', 'picked_up'] },
  ...(['pending', 'confirmed', 'picking', 'ready', 'out_for_delivery', 'delivered', 'picked_up', 'failed', 'cancelled'] as OrderStatus[]).map((s) => ({
    value: s,
    label: ORDER_STATUS_LABEL[s],
    statuses: [s],
  })),
];

const PAGE = 50;

function ListView({ now, onOpen }: { now: Date; onOpen: (o: Order) => void }) {
  const navigate = useNavigate();
  const [date, setDate] = useParamState('datum', '');
  const [art, setArt] = useParamState('art', '');
  const [status, setStatus] = useParamState('status', '');
  const [q, setQ] = useParamState('q', '');
  const [limit, setLimit] = useState(PAGE);
  const debouncedQ = useDebouncedValue(q.trim(), 250);

  const query = useMemo<AdminOrderQuery>(() => {
    const out: AdminOrderQuery = {};
    if (DAY_RE.test(date)) out.date = date;
    if (art === 'delivery' || art === 'pickup') out.fulfillment = art as FulfillmentType;
    const st = STATUS_FILTERS.find((f) => f.value === status)?.statuses;
    if (st) out.status = st;
    if (debouncedQ) out.q = debouncedQ;
    return out;
  }, [date, art, status, debouncedQ]);
  const { data, isLoading, error, refetch, isFetching } = useAdminOrders(query);
  const list = data ?? [];
  const shown = list.slice(0, limit);
  const sum = list.reduce((s, o) => s + (o.status === 'cancelled' ? 0 : o.totals.total), 0);
  const filtered = !!(date || art || status || q);

  return (
    <div className="space-y-4">
      <Card padding="sm" className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_14rem]">
          <Input
            containerClassName="col-span-2 md:col-span-1"
            icon={Search}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Nummer, Kunde, Straße, Abholcode …"
            aria-label="Bestellungen durchsuchen"
            suffix={
              q ? (
                <button type="button" onClick={() => setQ('')} aria-label="Suche leeren" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={16} aria-hidden />
                </button>
              ) : undefined
            }
          />
          <Select
            aria-label="Lieferart"
            value={art}
            onChange={(e) => {
              setArt(e.target.value);
              setLimit(PAGE);
            }}
            options={[
              { value: '', label: 'Alle Lieferarten' },
              { value: 'delivery', label: 'Lieferung' },
              { value: 'pickup', label: 'Abholung' },
            ]}
          />
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setLimit(PAGE);
            }}
            options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          />
        </div>
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
          <Button size="sm" variant={date ? 'ghost' : 'secondary'} onClick={() => setDate('')} className="!h-10">
            Alle Tage
          </Button>
          <DayPicker value={DAY_RE.test(date) ? date : ''} onChange={(d) => setDate(d)} arrows={false} wrap={false} />
          {filtered ? (
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              className="!h-10 sm:ml-auto"
              onClick={() => {
                setDate('');
                setArt('');
                setStatus('');
                setQ('');
              }}
            >
              Filter zurücksetzen
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 text-sm text-slate-500">
        <p>
          <strong className="font-semibold text-slate-800">{list.length}</strong> {list.length === 1 ? 'Bestellung' : 'Bestellungen'}
          {list.length ? (
            <>
              {' '}
              · Summe <strong className="font-semibold tabular-nums text-slate-800">{formatEuro(sum)}</strong>
            </>
          ) : null}
        </p>
        {isFetching && !isLoading ? <span className="text-xs">wird aktualisiert …</span> : null}
      </div>

      {isLoading ? (
        <Card padding="none" className="space-y-px overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-none" />
          ))}
        </Card>
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : !list.length ? (
        <Card>
          <EmptyState icon={Inbox} title="Keine Bestellungen gefunden" description={filtered ? 'Passen Sie die Filter an oder setzen Sie sie zurück.' : 'Sobald Bestellungen eingehen, erscheinen sie hier.'} />
        </Card>
      ) : (
        <>
          {/* Tabelle ab md */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Bestellung</TH>
                  <TH>Kunde</TH>
                  <TH>Zeitfenster</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Gebinde</TH>
                  <TH className="text-right">Betrag</TH>
                  <TH className="w-40 text-right">
                    <span className="sr-only">Aktion</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {shown.map((o) => (
                  <TR key={o.id} onClick={() => navigate(`/admin/bestellungen/${o.id}`)}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <FulfillmentIcon type={o.fulfillment} size="sm" />
                        <div>
                          <p className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{o.number}</p>
                          <p className="whitespace-nowrap text-xs text-slate-400">{formatRelative(o.createdAt, now)}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="max-w-72">
                      <p className="flex items-center gap-1.5 font-medium text-slate-800">
                        <span className="truncate">{o.customerName}</span>
                        <B2BTag type={o.customerType} />
                        <SourceTag source={o.source} />
                      </p>
                      <p className="truncate text-xs text-slate-500">{o.address ? `${o.address.street}, ${o.address.zip} ${o.address.city}` : o.pickupCode ? `Abholcode ${o.pickupCode}` : 'Abholung im Markt'}</p>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <p className="text-slate-800">{formatDate(o.slot.date, 'relative', now)}</p>
                      <p className="text-xs tabular-nums text-slate-500">
                        {o.slot.start}–{o.slot.end} Uhr
                      </p>
                    </TD>
                    <TD>
                      <OrderStatusBadge status={o.status} fulfillment={o.fulfillment} />
                    </TD>
                    <TD className="text-right tabular-nums">{orderCrates(o)}</TD>
                    <TD className="text-right font-semibold tabular-nums text-slate-900">{formatEuro(o.totals.total)}</TD>
                    <TD className="whitespace-nowrap py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <QuickStepButton order={o} arrow={false} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {/* Karten mobil */}
          <ul className="space-y-2 md:hidden">
            {shown.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onOpen(o)}
                  className="w-full rounded-2xl border border-slate-200/70 bg-white p-3.5 text-left shadow-card active:bg-slate-50"
                >
                  <div className="flex items-center gap-2.5">
                    <FulfillmentIcon type={o.fulfillment} size="sm" />
                    <span className="font-semibold tabular-nums text-slate-900">{o.number}</span>
                    <span className="ml-auto">
                      <OrderStatusBadge status={o.status} fulfillment={o.fulfillment} />
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[15px] font-medium text-slate-800">
                    <span className="truncate">{o.customerName}</span>
                    <B2BTag type={o.customerType} />
                    <SourceTag source={o.source} />
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3 text-sm text-slate-500">
                    <span className="truncate">
                      {slotShort(o.slot, now)} · {orderCrates(o)} Geb.
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatEuro(o.totals.total)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {list.length > shown.length ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                Weitere {Math.min(PAGE, list.length - shown.length)} anzeigen
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

export default function OrdersBoardPage() {
  const now = useNow(30_000);
  const [view, setView] = useParamState('ansicht', 'board');
  const [art, setArt] = useParamState('lieferart', '');
  const [day, setDay] = useParamState('tag', '');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useAdminOrders(ALL_QUERY, { refetchInterval: 60_000 });
  const { data: driverList } = useAdminDrivers();
  const drivers = useMemo(() => new Map((driverList ?? []).map((d) => [d.id, d])), [driverList]);
  const ids = useMemo(() => data?.map((o) => o.id), [data]);
  const fresh = useFreshIds(ids);
  useNewOrderChime(data);
  const openPhoneOrder = useOpenPhoneOrder();

  const today = todayString(now);
  const tomorrow = addDays(today, 1);
  const needle = search.trim().toLowerCase();
  const boardOrders = useMemo(() => {
    return (data ?? []).filter((o) => {
      if (art && o.fulfillment !== art) return false;
      if (day === 'heute' && o.slot.date !== today && o.status !== 'out_for_delivery') return false;
      if (day === 'morgen' && o.slot.date !== tomorrow) return false;
      if (needle) {
        const hay = [o.number, o.customerName, o.address?.street, o.address?.city, o.pickupCode].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, art, day, today, tomorrow, needle]);

  const openOrder = useMemo(() => (openId ? (data ?? []).find((o) => o.id === openId) ?? null : null), [openId, data]);
  const onOpen = useCallback((o: Order) => setOpenId(o.id), []);
  const openCount = (data ?? []).filter((o) => OPEN_STATUSES.includes(o.status)).length;
  const newCount = (data ?? []).filter((o) => o.status === 'pending').length;

  return (
    <>
      <PageHeader
        title="Bestellungen"
        subtitle={
          data ? (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <LiveDot />
              <span>
                {newCount ? `${newCount} neu · ` : ''}
                {openCount} in Bearbeitung
              </span>
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button variant="accent" icon={Phone} onClick={() => openPhoneOrder()}>
              Telefonbestellung
            </Button>
            <SegmentedControl
              aria-label="Ansicht"
              value={view === 'liste' ? 'liste' : 'board'}
              onChange={(v) => setView(v as View)}
              options={[
                { value: 'board', label: 'Board', icon: Columns3 },
                { value: 'liste', label: 'Liste', icon: LayoutList },
              ]}
            />
          </>
        }
      />

      {view === 'liste' ? (
        <ListView now={now} onOpen={onOpen} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-2">
            <Input
              icon={Search}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Board durchsuchen …"
              aria-label="Board durchsuchen"
              containerClassName="md:w-64 md:mr-1 xl:w-80"
            />
            <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none md:contents">
              <SegmentedControl
                aria-label="Lieferart"
                size="sm"
                value={art}
                onChange={setArt}
                options={[
                  { value: '', label: 'Alle' },
                  { value: 'delivery', label: 'Lieferung', icon: Truck },
                  { value: 'pickup', label: 'Abholung', icon: ShoppingBag },
                ]}
              />
              <SegmentedControl
                aria-label="Tag"
                size="sm"
                value={day}
                onChange={setDay}
                options={[
                  { value: '', label: 'Alle Tage' },
                  { value: 'heute', label: 'Heute' },
                  { value: 'morgen', label: 'Morgen' },
                ]}
              />
            </div>
          </div>
          {isLoading ? (
            <BoardSkeleton />
          ) : error ? (
            <Card>
              <ErrorState error={error} onRetry={() => void refetch()} />
            </Card>
          ) : !data?.length ? (
            <Card>
              <EmptyState icon={ClipboardList} title="Noch keine Bestellungen" description="Neue Bestellungen erscheinen hier automatisch – ohne Neuladen." />
            </Card>
          ) : (
            <BoardView orders={boardOrders} now={now} drivers={drivers} fresh={fresh} onOpen={onOpen} />
          )}
        </>
      )}

      <PhoneOrderLauncher />
      <OrderQuickView order={openOrder} driver={openOrder?.driverId ? drivers.get(openOrder.driverId) : undefined} now={now} onClose={() => setOpenId(null)} />
    </>
  );
}
