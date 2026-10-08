import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Clock, Megaphone, Package, Receipt, ShieldCheck, UserPlus, Users, UserX } from 'lucide-react';
import type { Customer } from '@shared/types';
import { formatDate, formatEuro, formatRelative } from '@shared/format';
import { useDepositTypes } from '@/api/hooks';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/hooks';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  Skeleton,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
} from '@/components/ui';
import { customerFigures, emptyFigures, formatCount, matchesSearch, sortBy, useUrlState, useAdminAllOrders, useAdminCustomers, useAdminInvoices, type CustomerFigures, type SortDir } from './master/lib';
import { AlertBanner, SearchField, SortTH, StatsSkeleton, TableFootnote, TableSkeleton } from './master/ui';
import { CustomerTypeBadges, defaultAddress } from './master/customers/customerUi';
import { ActivateBusinessModal } from './master/customers/ActivateBusinessModal';
import { BroadcastModal } from './master/customers/BroadcastModal';

type TabId = 'alle' | 'privat' | 'geschaeft' | 'antraege';
type SortKey = 'name' | 'orders' | 'revenue' | 'deposit' | 'open';

const stop = (e: MouseEvent) => e.stopPropagation();

function Figure({ loading, children, className }: { loading: boolean; children: ReactNode; className?: string }) {
  if (loading) return <Skeleton className="ml-auto h-4 w-14" />;
  return <span className={className}>{children}</span>;
}

export default function CustomersPage() {
  const wide = useMediaQuery('(min-width: 768px)');
  const customersQ = useAdminCustomers();
  const ordersQ = useAdminAllOrders();
  const invoicesQ = useAdminInvoices();
  const depositTypes = useDepositTypes();
  const navigate = useNavigate();
  const { params, set: setUrl } = useUrlState();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [activate, setActivate] = useState<Customer | null>(null);
  const xl = useMediaQuery('(min-width: 1280px)');

  const tab = (params.get('tab') as TabId) || 'alle';
  const q = params.get('q') ?? '';
  const sort = { key: (params.get('sort') as SortKey) || 'name', dir: (params.get('dir') as SortDir) || 'asc' };
  const setParam = (key: string, value: string | null) => setUrl({ [key]: value });
  const onSort = (key: SortKey) => setUrl({ sort: key, dir: key === sort.key ? (sort.dir === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc' });

  const customers = useMemo(() => customersQ.data ?? [], [customersQ.data]);
  const figuresLoading = ordersQ.isLoading || invoicesQ.isLoading;
  const figures = useMemo(
    () => customerFigures(customers, ordersQ.data ?? [], invoicesQ.data ?? [], depositTypes),
    [customers, ordersQ.data, invoicesQ.data, depositTypes],
  );
  const fig = (c: Customer): CustomerFigures => figures.get(c.id) ?? emptyFigures();

  const counts = useMemo(
    () => ({
      alle: customers.length,
      privat: customers.filter((c) => c.type === 'b2c').length,
      geschaeft: customers.filter((c) => c.type === 'b2b').length,
      antraege: customers.filter((c) => c.b2b?.status === 'pending').length,
    }),
    [customers],
  );

  const totals = useMemo(() => {
    let revenue = 0;
    let open = 0;
    let overdue = 0;
    let depositCount = 0;
    let depositValue = 0;
    for (const f of figures.values()) {
      revenue += f.revenue;
      open += f.openAmount;
      overdue += f.overdueAmount;
      depositCount += f.depositCount;
      depositValue += f.depositValue;
    }
    return { revenue, open, overdue, depositCount, depositValue };
  }, [figures]);

  const filtered = useMemo(() => {
    const list = customers.filter((c) => {
      if (tab === 'privat' && c.type !== 'b2c') return false;
      if (tab === 'geschaeft' && c.type !== 'b2b') return false;
      if (tab === 'antraege' && c.b2b?.status !== 'pending') return false;
      const a = defaultAddress(c);
      return matchesSearch([c.name, c.contactName, c.email, c.phone, c.b2b?.customerNumber, c.b2b?.companyName, a?.street, a?.zip, a?.city], q);
    });
    const key =
      sort.key === 'orders'
        ? (c: Customer) => fig(c).orders
        : sort.key === 'revenue'
          ? (c: Customer) => fig(c).revenue
          : sort.key === 'deposit'
            ? (c: Customer) => fig(c).depositValue
            : sort.key === 'open'
              ? (c: Customer) => fig(c).openAmount
              : (c: Customer) => c.name;
    const sorted = sortBy(list, key, sort.dir);
    // offene Anträge immer oben
    return [...sorted.filter((c) => c.b2b?.status === 'pending'), ...sorted.filter((c) => c.b2b?.status !== 'pending')];
  }, [customers, tab, q, sort.key, sort.dir, figures]);

  const open = (c: Customer) => navigate(`/admin/kunden/${encodeURIComponent(c.id)}`);

  return (
    <>
      <PageHeader
        title="Kunden"
        documentTitle="Kunden · Markt"
        subtitle="Privat- und Geschäftskunden, Konditionen, Leergut und offene Posten"
        actions={
          <Button icon={Megaphone} onClick={() => setBroadcastOpen(true)}>
            Nachricht an Kunden
          </Button>
        }
      />

      {customersQ.isLoading ? (
        <StatsSkeleton className="mb-6" />
      ) : customersQ.data ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Kunden" value={formatCount(counts.alle)} hint={`${counts.privat} privat · ${counts.geschaeft} geschäftlich`} icon={Users} tone="brand" />
          <StatCard label="Umsatz gesamt" value={figuresLoading ? '…' : formatEuro(totals.revenue)} hint="Warenwert brutto, alle Bestellungen" icon={Package} tone="success" />
          <StatCard
            label="Offene Posten"
            value={figuresLoading ? '…' : formatEuro(totals.open)}
            hint={totals.overdue ? <span className="font-semibold text-red-600">davon {formatEuro(totals.overdue)} überfällig</span> : 'nichts überfällig'}
            icon={Receipt}
            tone={totals.overdue ? 'danger' : 'warning'}
            onClick={() => navigate('/admin/rechnungen')}
          />
          <StatCard label="Leergut bei Kunden" value={formatEuro(totals.depositValue)} hint={`${formatCount(totals.depositCount)} Gebinde Pfand im Umlauf`} icon={Building2} tone="accent" />
        </div>
      ) : null}

      {counts.antraege > 0 && tab !== 'antraege' ? (
        <AlertBanner icon={UserPlus} title={counts.antraege === 1 ? '1 offener Antrag auf ein Geschäftskundenkonto' : `${counts.antraege} offene Anträge auf ein Geschäftskundenkonto`} cta="Prüfen" onClick={() => setParam('tab', 'antraege')} className="mb-5">
          – bitte prüfen und freischalten.
        </AlertBanner>
      ) : null}

      <Tabs
        aria-label="Kundengruppen"
        value={tab}
        onChange={(id) => setParam('tab', id === 'alle' ? null : id)}
        tabs={[
          { id: 'alle', label: 'Alle', count: counts.alle },
          { id: 'privat', label: 'Privat', count: counts.privat },
          { id: 'geschaeft', label: 'Geschäft', count: counts.geschaeft },
          { id: 'antraege', label: 'Anträge', count: counts.antraege, icon: Clock },
        ]}
        className="mb-4"
      />

      <SearchField value={q} onChange={(v) => setParam('q', v)} placeholder="Name, E-Mail, Telefon, Kundennummer, Ort …" className="mb-4 sm:max-w-md" label="Kunden suchen" />

      {customersQ.isLoading ? (
        <TableSkeleton rows={10} />
      ) : customersQ.error ? (
        <Card>
          <ErrorState error={customersQ.error} onRetry={() => void customersQ.refetch()} />
        </Card>
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={tab === 'antraege' ? ShieldCheck : UserX}
            title={tab === 'antraege' && !q ? 'Keine offenen Anträge' : 'Keine Kunden gefunden'}
            description={tab === 'antraege' && !q ? 'Alle Geschäftskunden-Anträge sind bearbeitet.' : 'Zu Ihrer Suche passt kein Kunde.'}
            action={
              q ? (
                <Button variant="outline" onClick={() => setParam('q', null)}>
                  Suche zurücksetzen
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {wide ? (
            <div>
              <Table className="[&_td:first-child]:pl-4 [&_td]:px-3 [&_th:first-child]:pl-4 [&_th]:px-3">
                <THead>
                  <tr>
                    <SortTH label="Kunde" sortKey="name" sort={sort} onSort={onSort} />
                    <TH className="hidden xl:table-cell">Typ</TH>
                    <SortTH label="Bestellungen" sortKey="orders" sort={sort} onSort={onSort} align="right" />
                    <SortTH label="Umsatz" sortKey="revenue" sort={sort} onSort={onSort} align="right" />
                    <SortTH label="Leergut" sortKey="deposit" sort={sort} onSort={onSort} align="right" className="hidden xl:table-cell" />
                    <SortTH label="Offene Posten" sortKey="open" sort={sort} onSort={onSort} align="right" />
                    <TH className="w-8">
                      <span className="sr-only">Öffnen</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {filtered.map((c) => {
                    const f = fig(c);
                    const a = defaultAddress(c);
                    const pending = c.b2b?.status === 'pending';
                    return (
                      <TR key={c.id} onClick={() => open(c)} className={cn(pending && 'bg-amber-50/70 hover:bg-amber-50')}>
                        <TD className="py-2.5">
                          <div className="flex min-w-0 max-w-[15rem] items-center gap-3 xl:max-w-[16rem] 2xl:max-w-[22rem]">
                            <Avatar name={c.name} size="md" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{c.name}</p>
                              <p className="truncate text-xs text-slate-500">
                                {a ? `${a.zip} ${a.city}` : c.email}
                                {c.b2b ? ` · ${c.b2b.customerNumber}` : ''}
                              </p>
                              <div className="mt-1 xl:hidden">
                                <CustomerTypeBadges customer={c} showSegment={false} />
                              </div>
                            </div>
                          </div>
                        </TD>
                        <TD className="hidden xl:table-cell">
                          <CustomerTypeBadges customer={c} />
                        </TD>
                        {pending ? (
                          <TD colSpan={xl ? 5 : 4} className="text-right">
                            <span onClick={stop} className="inline-flex flex-wrap items-center justify-end gap-3">
                              <span className="text-sm text-amber-900">Antrag vom {formatDate(c.createdAt, 'short')}</span>
                              <Button size="sm" variant="success" icon={ShieldCheck} onClick={() => setActivate(c)}>
                                Freischalten
                              </Button>
                            </span>
                          </TD>
                        ) : (
                          <>
                            <TD className="whitespace-nowrap text-right">
                              <Figure loading={figuresLoading}>
                                <span className="font-semibold tabular-nums text-slate-900">{f.orders}</span>
                                {f.lastOrderAt ? <span className="block text-xs text-slate-500">{formatRelative(f.lastOrderAt)}</span> : null}
                              </Figure>
                            </TD>
                            <TD className="whitespace-nowrap text-right">
                              <Figure loading={figuresLoading}>
                                <Money cents={f.revenue} className={f.revenue ? 'font-semibold text-slate-900' : 'text-slate-400'} />
                              </Figure>
                            </TD>
                            <TD className="hidden whitespace-nowrap text-right xl:table-cell">
                              {f.depositCount ? (
                                <>
                                  <span className="font-semibold tabular-nums text-slate-900">{f.depositCount} Geb.</span>
                                  <span className="block text-xs text-slate-500">{formatEuro(f.depositValue)}</span>
                                </>
                              ) : (
                                <span className="text-slate-400">–</span>
                              )}
                            </TD>
                            <TD className="whitespace-nowrap text-right">
                              <Figure loading={figuresLoading}>
                                {f.openAmount ? (
                                  <>
                                    <Money cents={f.openAmount} className={cn('font-semibold', f.overdueAmount ? 'text-red-700' : 'text-slate-900')} />
                                    {f.overdueAmount ? <span className="block text-xs font-medium text-red-600">{formatEuro(f.overdueAmount)} überfällig</span> : null}
                                  </>
                                ) : (
                                  <span className="text-slate-400">–</span>
                                )}
                              </Figure>
                            </TD>
                            <TD className="pl-0 pr-3">
                              <ChevronRight size={18} aria-hidden className="text-slate-300" />
                            </TD>
                          </>
                        )}
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          ) : null}

          {!wide ? (
            <ul className="space-y-3">
              {filtered.map((c) => {
                const f = fig(c);
                const a = defaultAddress(c);
                const pending = c.b2b?.status === 'pending';
                return (
                  <li key={c.id}>
                    <Card padding="none" className={cn('overflow-hidden', pending && 'border-amber-300 bg-amber-50/60')}>
                      <Link to={`/admin/kunden/${encodeURIComponent(c.id)}`} className="flex items-start gap-3 p-4">
                        <Avatar name={c.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{c.name}</p>
                          <p className="truncate text-sm text-slate-500">{a ? `${a.zip} ${a.city}` : c.email}</p>
                          <div className="mt-2">
                            <CustomerTypeBadges customer={c} />
                          </div>
                        </div>
                        <ChevronRight size={18} aria-hidden className="mt-1 shrink-0 text-slate-300" />
                      </Link>
                      {pending ? (
                        <div className="border-t border-amber-200 px-4 py-3">
                          <Button size="sm" variant="success" icon={ShieldCheck} block onClick={() => setActivate(c)}>
                            Antrag prüfen & freischalten
                          </Button>
                        </div>
                      ) : (
                        <dl className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 text-center">
                          <div className="px-2 py-2.5">
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Bestell.</dt>
                            <dd className="font-semibold tabular-nums text-slate-900">{figuresLoading ? '…' : f.orders}</dd>
                          </div>
                          <div className="px-2 py-2.5">
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Umsatz</dt>
                            <dd className="font-semibold tabular-nums text-slate-900">{figuresLoading ? '…' : formatEuro(f.revenue)}</dd>
                          </div>
                          <div className="px-2 py-2.5">
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Offen</dt>
                            <dd className={cn('font-semibold tabular-nums', f.overdueAmount ? 'text-red-700' : f.openAmount ? 'text-slate-900' : 'text-slate-400')}>
                              {figuresLoading ? '…' : f.openAmount ? formatEuro(f.openAmount) : '–'}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <TableFootnote>
            {filtered.length === customers.length ? `${formatCount(customers.length)} Kunden` : `${formatCount(filtered.length)} von ${formatCount(customers.length)} Kunden`} · Umsatz = Warenwert
            brutto ohne Pfand, ohne stornierte Bestellungen.
          </TableFootnote>
        </>
      )}

      <BroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} />
      <ActivateBusinessModal customer={activate} onClose={() => setActivate(null)} />
    </>
  );
}
