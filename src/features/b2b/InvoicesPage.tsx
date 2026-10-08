import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Clock, Download, FileText, Landmark, PackageCheck, Search, Wallet } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '@shared/types';
import { formatDate, formatEuro, INVOICE_STATUS_LABEL } from '@shared/format';
import { useMyCustomer, useMyInvoices, useMyOrders, useSettings } from '@/api/hooks';
import { downloadCsv, safeFilename } from '@/lib/download';
import { useMediaQuery, useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Button, Card, EmptyState, ErrorState, Notice, PageHeader, SegmentedControl, Skeleton, StatCard } from '@/components/ui';
import { BusinessNav } from './components/BusinessNav';
import { InvoiceStatusBadge } from './components/InvoiceStatusBadge';
import { DEMO_IBAN } from './components/InvoiceDocument';
import { dueText, openItems, unbilledDelivered } from './lib/b2b';

type Filter = 'all' | InvoiceStatus;
const FILTERS: Filter[] = ['all', 'open', 'overdue', 'paid'];

function isFilter(v: string | null): v is Filter {
  return !!v && (FILTERS as string[]).includes(v);
}

/** Rechnungsübersicht für Geschäftskunden */
export default function InvoicesPage() {
  const now = useNow(60_000);
  const navigate = useNavigate();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const wide = useMediaQuery('(min-width: 640px)');
  const customerQ = useMyCustomer();
  const invoicesQ = useMyInvoices();
  const ordersQ = useMyOrders();

  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const filter: Filter = isFilter(params.get('status')) ? (params.get('status') as Filter) : 'all';
  const setFilter = (f: string) => {
    const next = new URLSearchParams(params);
    if (f === 'all') next.delete('status');
    else next.set('status', f);
    setParams(next, { replace: true });
  };

  const items = useMemo(() => openItems(invoices), [invoices]);
  const unbilled = useMemo(() => unbilledDelivered(ordersQ.data ?? []), [ordersQ.data]);
  const unbilledSum = unbilled.reduce((s, o) => s + o.totals.total, 0);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: invoices.length, open: 0, overdue: 0, paid: 0 };
    for (const i of invoices) c[i.status] += 1;
    return c;
  }, [invoices]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/\s/g, '');
    return invoices.filter((i) => {
      if (filter !== 'all' && i.status !== filter) return false;
      if (!term) return true;
      return i.number.toLowerCase().includes(term) || formatEuro(i.gross).replace(/\s/g, '').includes(term) || formatDate(i.date, 'short').includes(term);
    });
  }, [invoices, filter, q]);
  const visibleSum = visible.reduce((s, i) => s + i.gross, 0);

  const b2b = customerQ.data?.b2b;
  const terms = b2b?.paymentTermsDays ?? 14;

  const exportCsv = () => {
    const rows: unknown[][] = [['Rechnungsnummer', 'Rechnungsdatum', 'Fällig am', 'Lieferungen', 'Netto (EUR)', 'MwSt. (EUR)', 'Pfand (EUR)', 'Leergut (EUR)', 'Brutto (EUR)', 'Status']];
    for (const i of visible) {
      rows.push([
        i.number,
        formatDate(i.date, 'short'),
        formatDate(i.dueDate, 'short'),
        i.orderIds.length,
        i.net / 100,
        i.vat / 100,
        i.deposit / 100,
        -i.depositRefund / 100,
        i.gross / 100,
        INVOICE_STATUS_LABEL[i.status],
      ]);
    }
    downloadCsv(rows, safeFilename(`Rechnungen ${b2b?.customerNumber ?? ''} ${formatDate(now, 'short')}`));
  };

  const loading = invoicesQ.isLoading;

  return (
    <div>
      <BusinessNav />
      <PageHeader
        title="Rechnungen"
        subtitle="Ihre Sammelrechnungen für Lieferungen auf Rechnung – jederzeit als PDF druckbar."
        actions={
          <Button variant="outline" icon={Download} onClick={exportCsv} disabled={!visible.length} className="w-full sm:w-auto">
            Als CSV exportieren
          </Button>
        }
      />

      {/* Summen */}
      <section aria-label="Summen" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className={cn('h-[124px] rounded-2xl', i === 2 && 'col-span-2 lg:col-span-1')} />)
        ) : (
          <>
            <StatCard
              label="Offen gesamt"
              icon={Wallet}
              tone="brand"
              value={formatEuro(items.openAmount)}
              hint={items.openCount ? `${items.openCount} ${items.openCount === 1 ? 'Rechnung' : 'Rechnungen'}` : invoices.length ? 'alles bezahlt' : 'keine offenen Rechnungen'}
              onClick={() => setFilter('open')}
            />
            <StatCard
              label="Davon überfällig"
              icon={AlertTriangle}
              tone={items.overdueCount ? 'danger' : 'success'}
              value={<span className={items.overdueCount ? 'text-red-600' : undefined}>{formatEuro(items.overdueAmount)}</span>}
              hint={items.overdueCount ? `${items.overdueCount} ${items.overdueCount === 1 ? 'Rechnung' : 'Rechnungen'}` : 'keine'}
              onClick={() => setFilter('overdue')}
            />
            <StatCard
              label="Noch nicht abgerechnet"
              icon={PackageCheck}
              tone="neutral"
              value={formatEuro(unbilledSum)}
              hint={unbilled.length ? `${unbilled.length} ${unbilled.length === 1 ? 'Lieferung' : 'Lieferungen'} – kommt in die nächste Sammelrechnung` : 'alle Lieferungen abgerechnet'}
              className="col-span-2 lg:col-span-1"
            />
          </>
        )}
      </section>

      {items.overdueCount > 0 ? (
        <Notice tone="danger" icon={AlertTriangle} title={`${items.overdueCount} ${items.overdueCount === 1 ? 'Rechnung ist' : 'Rechnungen sind'} überfällig`} className="mt-5">
          Bitte begleichen Sie {formatEuro(items.overdueAmount)} zeitnah. Haben Sie bereits überwiesen, ist dieser Hinweis gegenstandslos – Zahlungseingänge werden täglich
          verbucht.
        </Notice>
      ) : null}

      {b2b?.status === 'pending' && !invoices.length ? (
        <Notice tone="info" icon={Landmark} title="Kauf auf Rechnung nach der Freischaltung" className="mt-4">
          Sobald Ihr Geschäftskundenkonto geprüft ist, können Sie auf Rechnung bestellen. Ihre Lieferungen werden dann gesammelt und regelmäßig abgerechnet.
        </Notice>
      ) : (
        <Notice tone="brand" icon={Landmark} title={`Zahlungsziel: ${terms} Tage netto ab Rechnungsdatum`} className="mt-4">
          Bitte überweisen Sie unter Angabe der Rechnungsnummer an {settings.legalName} · IBAN {DEMO_IBAN}. Fragen zu Rechnungen:{' '}
          <span className="whitespace-nowrap">{settings.phone}</span>.
        </Notice>
      )}

      {/* Filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <SegmentedControl
            aria-label="Rechnungen filtern"
            size={wide ? 'md' : 'sm'}
            block={!wide}
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              value: f,
              label: (
                <>
                  {f === 'all' ? 'Alle' : INVOICE_STATUS_LABEL[f].charAt(0).toUpperCase() + INVOICE_STATUS_LABEL[f].slice(1)}
                  <span className="ml-1 tabular-nums text-slate-400 sm:ml-1.5">{counts[f]}</span>
                </>
              ),
            }))}
          />
        </div>
        <div className="relative sm:w-72">
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nummer, Datum oder Betrag"
            aria-label="Rechnungen durchsuchen"
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-900 shadow-xs placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:text-[15px]"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="mt-4">
        {invoicesQ.isError ? (
          <Card>
            <ErrorState error={invoicesQ.error} onRetry={() => void invoicesQ.refetch()} />
          </Card>
        ) : loading ? (
          <Card padding="none" className="divide-y divide-slate-100">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </Card>
        ) : !invoices.length ? (
          <Card>
            <EmptyState
              icon={FileText}
              title="Noch keine Rechnungen"
              description="Lieferungen auf Rechnung werden gesammelt und regelmäßig in einer Sammelrechnung abgerechnet. Sie erhalten eine Benachrichtigung, sobald eine Rechnung bereitsteht."
            />
          </Card>
        ) : !visible.length ? (
          <Card>
            <EmptyState
              icon={Search}
              title="Keine Rechnungen in dieser Ansicht"
              description={q ? `Zu „${q}“ wurde keine Rechnung gefunden.` : 'Wählen Sie einen anderen Filter.'}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setFilter('all');
                  }}
                >
                  Alle Rechnungen zeigen
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {/* Desktop: Tabelle */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">Rechnung</th>
                    <th scope="col" className="px-4 py-3">Datum</th>
                    <th scope="col" className="px-4 py-3">Fällig am</th>
                    <th scope="col" className="px-4 py-3 text-right">Netto</th>
                    <th scope="col" className="px-4 py-3 text-right">Betrag</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="w-10 px-3 py-3">
                      <span className="sr-only">Öffnen</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((inv) => (
                    <InvoiceTableRow key={inv.id} invoice={inv} now={now} onOpen={() => navigate(`/business/rechnungen/${inv.id}`)} />
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50/60">
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-sm text-slate-500">
                      {visible.length} {visible.length === 1 ? 'Rechnung' : 'Rechnungen'}
                      {filter !== 'all' || q ? ' (gefiltert)' : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatEuro(visibleSum)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobil: Karten */}
            <ul className="space-y-3 md:hidden">
              {visible.map((inv) => (
                <li key={inv.id}>
                  <Link
                    to={`/business/rechnungen/${inv.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card active:bg-slate-50"
                  >
                    <span
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                        inv.status === 'overdue' ? 'bg-red-50 text-red-600' : inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-700',
                      )}
                    >
                      <FileText size={20} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold tabular-nums text-slate-900">{inv.number}</span>
                        <span className="shrink-0 font-bold tabular-nums text-slate-900">{formatEuro(inv.gross)}</span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px] text-slate-500">vom {formatDate(inv.date, 'short')}</span>
                        <InvoiceStatusBadge status={inv.status} className="shrink-0" />
                      </span>
                      <span className={cn('mt-0.5 block truncate text-[13px]', inv.status === 'overdue' ? 'font-semibold text-red-600' : 'text-slate-500')}>
                        {dueText(inv, now)}
                      </span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
              <li className="flex items-center justify-between px-1 pt-1 text-sm text-slate-500">
                <span>
                  {visible.length} {visible.length === 1 ? 'Rechnung' : 'Rechnungen'}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">Summe {formatEuro(visibleSum)}</span>
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function InvoiceTableRow({ invoice: inv, now, onOpen }: { invoice: Invoice; now: Date; onOpen: () => void }) {
  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-brand-50/50 focus-visible:outline-none"
    >
      <td className="px-5 py-3.5">
        <span className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              inv.status === 'overdue' ? 'bg-red-50 text-red-600' : inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-700',
            )}
          >
            <FileText size={17} aria-hidden />
          </span>
          <span>
            <Link to={`/business/rechnungen/${inv.id}`} onClick={(e) => e.stopPropagation()} className="block font-semibold tabular-nums text-slate-900 hover:text-brand-700">
              {inv.number}
            </Link>
            <span className="block text-xs text-slate-500">
              {inv.orderIds.length} {inv.orderIds.length === 1 ? 'Lieferung' : 'Lieferungen'}
            </span>
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-slate-700">{formatDate(inv.date, 'short')}</td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <span className="block tabular-nums text-slate-700">{formatDate(inv.dueDate, 'short')}</span>
        <span className={cn('flex items-center gap-1 text-xs', inv.status === 'overdue' ? 'font-semibold text-red-600' : 'text-slate-500')}>
          {inv.status === 'open' ? <Clock size={12} aria-hidden /> : null}
          {dueText(inv, now)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-slate-600">{formatEuro(inv.net)}</td>
      <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-slate-900">{formatEuro(inv.gross)}</td>
      <td className="px-4 py-3.5">
        <InvoiceStatusBadge status={inv.status} />
      </td>
      <td className="px-3 py-3.5 text-slate-300">
        <ChevronRight size={18} aria-hidden />
      </td>
    </tr>
  );
}
