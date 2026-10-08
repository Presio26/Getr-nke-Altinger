import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CalendarRange, CheckCircle2, PauseCircle, PlayCircle, Repeat, Truck, Wallet } from 'lucide-react';
import type { Customer, Order, Subscription } from '@shared/types';
import { INTERVAL_LABEL, PAYMENT_METHOD_LABEL, WEEKDAY_LABEL, formatDate, formatEuro, formatSlot } from '@shared/format';
import { addDays, diffDays, todayString } from '@shared/time';
import { priceProduct } from '@shared/core/pricing';
import { api } from '@/api/client';
import { qk, useApiMutation, useDepositTypes, useProductMap } from '@/api/hooks';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Input,
  Money,
  Notice,
  PageHeader,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
} from '@/components/ui';
import { formatCount, matchesSearch, useAdminCustomers, useAdminSubscriptions } from './master/lib';
import { FilterChip, FormSection, SearchField, StatsSkeleton, TableFootnote, TableSkeleton } from './master/ui';

type TabId = 'alle' | 'b2c' | 'b2b';
const PER_4_WEEKS = { weekly: 4, biweekly: 2, monthly: 1 } as const;

function capitalize(s: string) {
  return s.replace(/^./, (c) => c.toUpperCase());
}

function nextText(date: string, today: string): string {
  const d = diffDays(today, date);
  if (d === 0) return 'heute';
  if (d === 1) return 'morgen';
  if (d < 0) return `seit ${-d} ${-d === 1 ? 'Tag' : 'Tagen'} fällig`;
  return `in ${d} Tagen`;
}

export default function SubscriptionsAdminPage() {
  const subsQ = useAdminSubscriptions();
  const customersQ = useAdminCustomers();
  const products = useProductMap();
  const depositTypes = useDepositTypes();
  const [params, setParams] = useSearchParams();
  const today = todayString();
  const tomorrow = addDays(today, 1);
  const [until, setUntil] = useState(tomorrow);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ until: string; expected: number; orders: Order[] } | null>(null);

  const tab = (params.get('tab') as TabId) || 'alle';
  const q = params.get('q') ?? '';
  const onlyActive = params.has('aktiv');
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const customers = useMemo(() => new Map((customersQ.data ?? []).map((c) => [c.id, c])), [customersQ.data]);
  const subs = useMemo(() => subsQ.data ?? [], [subsQ.data]);

  const valueOf = useMemo(() => {
    const cache = new Map<string, number>();
    return (s: Subscription): number => {
      const hit = cache.get(s.id);
      if (hit !== undefined) return hit;
      const customer: Customer | null = customers.get(s.customerId) ?? null;
      let sum = 0;
      for (const item of s.items) {
        const p = products.get(item.productId);
        if (p) sum += priceProduct(p, customer, item.qty, new Date(), depositTypes).lineGross;
      }
      cache.set(s.id, sum);
      return sum;
    };
  }, [customers, products, depositTypes]);

  const typeOf = (s: Subscription) => customers.get(s.customerId)?.type ?? 'b2c';

  const kpi = useMemo(() => {
    const active = subs.filter((s) => s.active);
    const week = addDays(today, 7);
    return {
      active: active.length,
      activeB2B: active.filter((s) => customers.get(s.customerId)?.type === 'b2b').length,
      paused: subs.length - active.length,
      next7: active.filter((s) => s.nextDate <= week).length,
      monthly: active.reduce((sum, s) => sum + valueOf(s) * (PER_4_WEEKS[s.interval] ?? 1), 0),
    };
  }, [subs, customers, today, valueOf]);

  const due = useMemo(() => subs.filter((s) => s.active && s.nextDate <= until && until >= today), [subs, until, today]);

  const filtered = useMemo(
    () =>
      subs.filter((s) => {
        const c = customers.get(s.customerId);
        if (tab !== 'alle' && (c?.type ?? 'b2c') !== tab) return false;
        if (onlyActive && !s.active) return false;
        const names = s.items.map((i) => {
          const p = products.get(i.productId);
          return p ? `${p.brand} ${p.name}` : '';
        });
        return matchesSearch([s.name, c?.name, c?.b2b?.customerNumber, ...names], q);
      }),
    [subs, customers, products, tab, onlyActive, q],
  );

  const run = useApiMutation((date: string) => api.adminRunSubscriptions(date), {
    invalidate: [qk.admin, qk.orders],
    success: (orders) => (orders.length === 1 ? '1 Bestellung aus Abos angelegt' : `${orders.length} Bestellungen aus Abos angelegt`),
    onSuccess: (orders, date) => {
      setResult({ until: date, expected: due.length, orders });
      setConfirm(false);
    },
    onError: () => setConfirm(false),
  });

  const counts = {
    alle: subs.length,
    b2c: subs.filter((s) => typeOf(s) === 'b2c').length,
    b2b: subs.filter((s) => typeOf(s) === 'b2b').length,
  };

  const itemsText = (s: Subscription) =>
    s.items
      .map((i) => {
        const p = products.get(i.productId);
        return `${i.qty} × ${p ? `${p.brand} ${p.name}` : i.productId}`;
      })
      .join(' · ');

  return (
    <>
      <PageHeader title="Abos & Daueraufträge" documentTitle="Abos · Markt" subtitle="Regelmäßige Lieferungen von Privat- und Geschäftskunden" />

      {subsQ.isLoading ? (
        <StatsSkeleton className="mb-6" />
      ) : subsQ.data ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Aktive Abos" value={formatCount(kpi.active)} hint={`${kpi.active - kpi.activeB2B} ${kpi.active - kpi.activeB2B === 1 ? 'Abo' : 'Abos'} · ${kpi.activeB2B} ${kpi.activeB2B === 1 ? 'Dauerauftrag' : 'Daueraufträge'}`} icon={Repeat} tone="brand" />
          <StatCard label="Fällig in 7 Tagen" value={formatCount(kpi.next7)} hint="Abos mit Lieferung bis nächste Woche" icon={CalendarClock} tone="accent" />
          <StatCard label="Warenwert je 4 Wochen" value={formatEuro(kpi.monthly)} hint="brutto, aus allen aktiven Abos" icon={Wallet} tone="success" />
          <StatCard label="Pausiert" value={formatCount(kpi.paused)} hint={kpi.paused ? 'vom Kunden angehalten' : 'alle Abos laufen'} icon={PauseCircle} tone="neutral" />
        </div>
      ) : null}

      <FormSection
        title="Fällige Abos in Bestellungen umwandeln"
        subtitle="Legt für alle aktiven Abos und Daueraufträge mit Liefertermin bis zum gewählten Tag bestätigte Bestellungen an – mit passendem Lieferfenster."
        icon={PlayCircle}
        className="mb-6"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Liefertermine bis"
              type="date"
              min={today}
              value={until}
              onChange={(e) => setUntil(e.target.value || tomorrow)}
              containerClassName="w-48"
            />
            <div className="flex gap-2 pb-1">
              <FilterChip active={until === tomorrow} onClick={() => setUntil(tomorrow)}>
                Bis morgen
              </FilterChip>
              <FilterChip active={until === addDays(today, 7)} onClick={() => setUntil(addDays(today, 7))}>
                Nächste 7 Tage
              </FilterChip>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
            <p className="text-sm text-slate-600">
              {due.length ? (
                <>
                  <strong className="text-slate-900">{due.length}</strong> {due.length === 1 ? 'Abo ist' : 'Abos sind'} bis {formatDate(until, 'medium')} fällig
                </>
              ) : (
                <>Bis {formatDate(until, 'medium')} ist kein Abo fällig.</>
              )}
            </p>
            <Button icon={PlayCircle} onClick={() => setConfirm(true)} disabled={!subs.length} loading={run.isPending}>
              Jetzt umwandeln
            </Button>
          </div>
        </div>

        {due.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {due.map((s) => (
              <li key={s.id}>
                <Badge tone="brand" icon={CalendarRange}>
                  {customers.get(s.customerId)?.name ?? s.customerId} · {formatDate(s.nextDate, 'medium')}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {result ? (
          <div className="mt-5 border-t border-slate-100 pt-5">
            {result.orders.length ? (
              <>
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 size={18} aria-hidden />
                  {result.orders.length === 1 ? '1 Bestellung angelegt' : `${result.orders.length} Bestellungen angelegt`} (Liefertermine bis {formatDate(result.until, 'short')})
                </p>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {result.orders.map((o) => (
                    <li key={o.id}>
                      <Link to={`/admin/bestellungen/${encodeURIComponent(o.id)}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <Truck size={17} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">
                            {o.number} · {o.customerName}
                          </p>
                          <p className="truncate text-sm text-slate-500">{formatSlot(o.slot)}</p>
                        </div>
                        <Money cents={o.totals.total} className="font-semibold text-slate-900" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Notice tone="info" title="Keine neuen Bestellungen">
                Bis {formatDate(result.until, 'short')} war kein Abo fällig. Abos, die nicht ausgeführt werden konnten (z. B. kein freies Lieferfenster), meldet die Glocke oben rechts.
              </Notice>
            )}
            {result.orders.length > 0 && result.orders.length < result.expected ? (
              <Notice tone="warning" icon={AlertTriangle} className="mt-3">
                Nicht alle fälligen Abos konnten ausgeführt werden – Details finden Sie in den Benachrichtigungen.
              </Notice>
            ) : null}
          </div>
        ) : null}
      </FormSection>

      <Tabs
        aria-label="Art"
        value={tab}
        onChange={(id) => setParam('tab', id === 'alle' ? null : id)}
        tabs={[
          { id: 'alle', label: 'Alle', count: counts.alle },
          { id: 'b2c', label: 'Abos (Privat)', count: counts.b2c },
          { id: 'b2b', label: 'Daueraufträge (Geschäft)', count: counts.b2b },
        ]}
        className="mb-4"
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchField value={q} onChange={(v) => setParam('q', v)} placeholder="Kunde, Bezeichnung oder Artikel" className="flex-1 sm:max-w-md" label="Abos suchen" />
        <FilterChip active={onlyActive} onClick={() => setParam('aktiv', onlyActive ? null : '1')} icon={CheckCircle2}>
          Nur aktive
        </FilterChip>
      </div>

      {subsQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : subsQ.error ? (
        <Card>
          <ErrorState error={subsQ.error} onRetry={() => void subsQ.refetch()} />
        </Card>
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={Repeat}
            title={subs.length ? 'Keine Abos gefunden' : 'Noch keine Abos'}
            description={subs.length ? 'Zu Ihrer Suche bzw. dem Filter passt kein Abo.' : 'Kunden richten Abos und Daueraufträge selbst in ihrem Konto ein.'}
          />
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Table className="[&_td:first-child]:pl-4 [&_td]:px-3 [&_th:first-child]:pl-4 [&_th]:px-3">
              <THead>
                <tr>
                  <TH>Kunde & Abo</TH>
                  <TH>Rhythmus</TH>
                  <TH>Nächste Lieferung</TH>
                  <TH className="hidden xl:table-cell">Zahlart</TH>
                  <TH className="text-right">Warenwert</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {filtered.map((s) => {
                  const c = customers.get(s.customerId);
                  return (
                    <TR key={s.id} className={cn(!s.active && 'bg-slate-50/70')}>
                      <TD className="py-3">
                        <div className="max-w-[28rem]">
                          <p className="flex flex-wrap items-center gap-2">
                            <Link to={`/admin/kunden/${encodeURIComponent(s.customerId)}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                              {c?.name ?? s.customerId}
                            </Link>
                            <Badge tone={c?.type === 'b2b' ? 'brand' : 'neutral'}>{c?.type === 'b2b' ? 'Dauerauftrag' : 'Abo'}</Badge>
                          </p>
                          <p className="text-sm font-medium text-slate-700">„{s.name}“</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{itemsText(s)}</p>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <p className="text-slate-900">{capitalize(INTERVAL_LABEL[s.interval])}</p>
                        <p className="text-xs text-slate-500">
                          {WEEKDAY_LABEL[s.weekday]} ab {s.slotStart} Uhr
                        </p>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <p className="font-medium text-slate-900">{formatDate(s.nextDate, 'medium')}</p>
                        <p className={cn('text-xs', s.nextDate <= tomorrow && s.active ? 'font-semibold text-accent-700' : 'text-slate-500')}>{nextText(s.nextDate, today)}</p>
                      </TD>
                      <TD className="hidden whitespace-nowrap xl:table-cell">
                        {PAYMENT_METHOD_LABEL[s.paymentMethod]}
                        {s.autoEmptiesReturn ? <p className="text-xs text-slate-500">Leergut wird mitgenommen</p> : null}
                      </TD>
                      <TD className="whitespace-nowrap text-right">
                        <Money cents={valueOf(s)} className="font-semibold text-slate-900" />
                        <p className="text-xs text-slate-500">je Lieferung</p>
                      </TD>
                      <TD>
                        <Badge tone={s.active ? 'success' : 'neutral'} icon={s.active ? CheckCircle2 : PauseCircle}>
                          {s.active ? 'Aktiv' : 'Pausiert'}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <ul className="space-y-3 md:hidden">
            {filtered.map((s) => {
              const c = customers.get(s.customerId);
              return (
                <li key={s.id}>
                  <Card padding="sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/admin/kunden/${encodeURIComponent(s.customerId)}`} className="block truncate font-semibold text-slate-900">
                          {c?.name ?? s.customerId}
                        </Link>
                        <p className="text-sm text-slate-600">„{s.name}“</p>
                      </div>
                      <Badge tone={s.active ? 'success' : 'neutral'}>{s.active ? 'Aktiv' : 'Pausiert'}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{itemsText(s)}</p>
                    <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
                      <div>
                        <p className="text-slate-900">
                          {capitalize(INTERVAL_LABEL[s.interval])} · {WEEKDAY_LABEL[s.weekday]}
                        </p>
                        <p className="text-slate-500">
                          nächste: {formatDate(s.nextDate, 'medium')} ({nextText(s.nextDate, today)})
                        </p>
                      </div>
                      <Money cents={valueOf(s)} className="font-semibold text-slate-900" />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <TableFootnote>
            {formatCount(filtered.length)} von {formatCount(subs.length)} · Warenwert brutto je Lieferung zu aktuellen Preisen und Kundenkonditionen, ohne Pfand.
          </TableFootnote>
        </>
      )}

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => run.mutate(until)}
        loading={run.isPending}
        title="Fällige Abos jetzt umwandeln?"
        message={
          due.length ? (
            <>
              Für <strong>{due.length}</strong> {due.length === 1 ? 'Abo' : 'Abos'} mit Liefertermin bis {formatDate(until, 'long')} werden bestätigte Bestellungen angelegt. Die Kunden werden benachrichtigt.
            </>
          ) : (
            <>Laut aktuellem Stand ist bis {formatDate(until, 'long')} kein Abo fällig. Trotzdem prüfen lassen?</>
          )
        }
        confirmLabel="Bestellungen anlegen"
      />
    </>
  );
}
