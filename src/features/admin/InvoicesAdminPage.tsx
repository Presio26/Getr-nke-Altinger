import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Download, FileStack, FileText, Receipt } from 'lucide-react';
import type { Invoice, InvoiceStatus } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { addDays, todayString } from '@shared/time';
import { downloadCsv } from '@/lib/download';
import { cn } from '@/lib/cn';
import { Button, Card, EmptyState, ErrorState, Money, PageHeader, SegmentedControl, Select, StatCard, Table, TBody, TD, TH, THead, TR, toast } from '@/components/ui';
import { formatCount, matchesSearch, useAdminAllOrders, useAdminCustomers, useAdminInvoices } from './master/lib';
import { AlertBanner, SearchField, StatsSkeleton, TableFootnote, TableSkeleton } from './master/ui';
import { InvoiceStatusBadge, MarkPaidButton, PrintInvoiceButton, dueText } from './master/invoices/invoiceUi';
import { BillingRunModal, billingCandidates } from './master/invoices/BillingRunModal';

type StatusFilter = 'alle' | InvoiceStatus;

export default function InvoicesAdminPage() {
  const invoicesQ = useAdminInvoices();
  const ordersQ = useAdminAllOrders();
  const customersQ = useAdminCustomers();
  const [params, setParams] = useSearchParams();
  const [runOpen, setRunOpen] = useState(false);
  const today = todayString();

  const status = (params.get('status') as StatusFilter) || 'alle';
  const customerId = params.get('kunde') ?? '';
  const q = params.get('q') ?? '';
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

  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const candidates = useMemo(() => billingCandidates(customersQ.data ?? [], ordersQ.data ?? []), [customersQ.data, ordersQ.data]);
  const unbilledSum = candidates.reduce((s, c) => s + c.amount, 0);
  const unbilledCount = candidates.reduce((s, c) => s + c.orders.length, 0);

  const kpi = useMemo(() => {
    const sum = (list: Invoice[]) => list.reduce((s, i) => s + i.gross, 0);
    const open = invoices.filter((i) => i.status === 'open');
    const overdue = invoices.filter((i) => i.status === 'overdue');
    const since = addDays(today, -30);
    const paid30 = invoices.filter((i) => i.status === 'paid' && i.paidAt && i.paidAt.slice(0, 10) >= since);
    return {
      open: { n: open.length, sum: sum(open) },
      overdue: { n: overdue.length, sum: sum(overdue) },
      paid30: { n: paid30.length, sum: sum(paid30) },
      counts: {
        alle: invoices.length,
        open: open.length,
        overdue: overdue.length,
        paid: invoices.filter((i) => i.status === 'paid').length,
      },
    };
  }, [invoices, today]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of invoices) map.set(i.customerId, i.customerName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de')).map(([value, label]) => ({ value, label }));
  }, [invoices]);

  const filtered = useMemo(
    () =>
      invoices.filter((i) => {
        if (status !== 'alle' && i.status !== status) return false;
        if (customerId && i.customerId !== customerId) return false;
        return matchesSearch([i.number, i.customerName], q);
      }),
    [invoices, status, customerId, q],
  );
  const sums = useMemo(
    () => ({ net: filtered.reduce((s, i) => s + i.net, 0), vat: filtered.reduce((s, i) => s + i.vat, 0), gross: filtered.reduce((s, i) => s + i.gross, 0) }),
    [filtered],
  );
  const filtersActive = status !== 'alle' || !!customerId || !!q;

  const exportCsv = () => {
    downloadCsv(
      [
        ['Rechnungsnummer', 'Kunde', 'Rechnungsdatum', 'Fällig am', 'Status', 'Lieferungen', 'Netto (€)', 'MwSt. (€)', 'Pfand (€)', 'Leergut-Gutschrift (€)', 'Brutto (€)', 'Bezahlt am'],
        ...filtered.map((i) => [
          i.number,
          i.customerName,
          formatDate(i.date, 'short'),
          formatDate(i.dueDate, 'short'),
          i.status === 'paid' ? 'bezahlt' : i.status === 'overdue' ? 'überfällig' : 'offen',
          i.orderIds.length,
          i.net / 100,
          i.vat / 100,
          i.deposit / 100,
          i.depositRefund / 100,
          i.gross / 100,
          i.paidAt ? formatDate(i.paidAt, 'short') : '',
        ]),
      ],
      `Rechnungen-${today}.csv`,
    );
    toast.success(`${filtered.length} Rechnungen exportiert`);
  };

  return (
    <>
      <PageHeader
        title="Rechnungen"
        documentTitle="Rechnungen · Markt"
        subtitle="Rechnungen an Geschäftskunden, Zahlungseingänge und Rechnungslauf"
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
              Export
            </Button>
            <Button icon={FileStack} onClick={() => setRunOpen(true)} disabled={ordersQ.isLoading || customersQ.isLoading}>
              Rechnungslauf{candidates.length ? ` (${candidates.length})` : ''}
            </Button>
          </>
        }
      />

      {invoicesQ.isLoading ? (
        <StatsSkeleton className="mb-6" />
      ) : invoicesQ.data ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard
            label="Offen"
            value={formatEuro(kpi.open.sum)}
            hint={`${kpi.open.n} ${kpi.open.n === 1 ? 'Rechnung' : 'Rechnungen'} im Zahlungsziel`}
            icon={Clock}
            tone="brand"
            onClick={() => setParam('status', 'open')}
          />
          <StatCard
            label="Überfällig"
            value={formatEuro(kpi.overdue.sum)}
            hint={kpi.overdue.n ? `${kpi.overdue.n} ${kpi.overdue.n === 1 ? 'Rechnung' : 'Rechnungen'} – bitte mahnen` : 'nichts überfällig'}
            icon={AlertTriangle}
            tone={kpi.overdue.n ? 'danger' : 'success'}
            onClick={() => setParam('status', 'overdue')}
          />
          <StatCard label="Zahlungseingang 30 Tage" value={formatEuro(kpi.paid30.sum)} hint={kpi.paid30.n === 1 ? '1 bezahlte Rechnung' : `${kpi.paid30.n} bezahlte Rechnungen`} icon={CheckCircle2} tone="success" onClick={() => setParam('status', 'paid')} />
          <StatCard
            label="Noch nicht abgerechnet"
            value={ordersQ.isLoading ? '…' : formatEuro(unbilledSum)}
            hint={unbilledCount ? `${unbilledCount} Lieferungen bei ${candidates.length} ${candidates.length === 1 ? 'Kunde' : 'Kunden'}` : 'alles abgerechnet'}
            icon={FileText}
            tone="accent"
            onClick={() => setRunOpen(true)}
          />
        </div>
      ) : null}

      {candidates.length ? (
        <AlertBanner icon={FileStack} tone="brand" title={`${unbilledCount} gelieferte ${unbilledCount === 1 ? 'Bestellung' : 'Bestellungen'} auf Rechnung noch nicht abgerechnet`} cta="Rechnungslauf starten" onClick={() => setRunOpen(true)} className="mb-5">
          – {formatEuro(unbilledSum)} bei {candidates.map((c) => c.customer.name).join(', ')}.
        </AlertBanner>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <SegmentedControl
            aria-label="Status"
            value={status}
            onChange={(v) => setParam('status', v === 'alle' ? null : v)}
            options={[
              { value: 'alle', label: `Alle (${kpi.counts.alle})` },
              { value: 'open', label: `Offen (${kpi.counts.open})` },
              { value: 'overdue', label: `Überfällig (${kpi.counts.overdue})` },
              { value: 'paid', label: `Bezahlt (${kpi.counts.paid})` },
            ]}
          />
        </div>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <Select aria-label="Kunde" value={customerId} onChange={(e) => setParam('kunde', e.target.value)} options={[{ value: '', label: 'Alle Kunden' }, ...customerOptions]} containerClassName="sm:w-64" />
          <SearchField value={q} onChange={(v) => setParam('q', v)} placeholder="Rechnungsnummer oder Kunde" className="flex-1 sm:max-w-xs" label="Rechnungen suchen" />
        </div>
      </div>

      {invoicesQ.isLoading ? (
        <TableSkeleton rows={6} />
      ) : invoicesQ.error ? (
        <Card>
          <ErrorState error={invoicesQ.error} onRetry={() => void invoicesQ.refetch()} />
        </Card>
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={invoices.length ? 'Keine Rechnungen gefunden' : 'Noch keine Rechnungen'}
            description={invoices.length ? 'Zu den gewählten Filtern gibt es keine Rechnung.' : 'Starten Sie einen Rechnungslauf, um gelieferte Bestellungen auf Rechnung abzurechnen.'}
            action={
              filtersActive ? (
                <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                  Filter zurücksetzen
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Table className="[&_td:first-child]:pl-4 [&_td]:px-3 [&_th:first-child]:pl-4 [&_th]:px-3">
              <THead>
                <tr>
                  <TH>Rechnung</TH>
                  <TH>Kunde</TH>
                  <TH className="hidden xl:table-cell">Fälligkeit</TH>
                  <TH className="hidden text-right xl:table-cell">Netto</TH>
                  <TH className="text-right">Brutto</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Aktionen</TH>
                </tr>
              </THead>
              <TBody>
                {filtered.map((i) => (
                  <TR key={i.id} className={cn(i.status === 'overdue' && 'bg-red-50/40')}>
                    <TD>
                      <p className="whitespace-nowrap font-semibold text-slate-900">{i.number}</p>
                      <p className="whitespace-nowrap text-xs text-slate-500">
                        {formatDate(i.date, 'short')} · {i.orderIds.length} {i.orderIds.length === 1 ? 'Lieferung' : 'Lieferungen'}
                      </p>
                      <p className={cn('whitespace-nowrap text-xs xl:hidden', i.status === 'overdue' ? 'font-medium text-red-600' : 'text-slate-500')}>{dueText(i, today)}</p>
                    </TD>
                    <TD>
                      <Link to={`/admin/kunden/${encodeURIComponent(i.customerId)}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                        {i.customerName}
                      </Link>
                    </TD>
                    <TD className="hidden whitespace-nowrap xl:table-cell">
                      <p className="text-slate-700">{formatDate(i.dueDate, 'short')}</p>
                      <p className={cn('text-xs', i.status === 'overdue' ? 'font-medium text-red-600' : 'text-slate-500')}>{dueText(i, today)}</p>
                    </TD>
                    <TD className="hidden whitespace-nowrap text-right xl:table-cell">
                      <Money cents={i.net} />
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      <Money cents={i.gross} className="font-semibold text-slate-900" />
                    </TD>
                    <TD>
                      <InvoiceStatusBadge status={i.status} />
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <MarkPaidButton invoice={i} />
                        <PrintInvoiceButton invoice={i} compact />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 text-sm">
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-700" colSpan={2}>
                    Summe · {filtered.length} {filtered.length === 1 ? 'Rechnung' : 'Rechnungen'}
                  </td>
                  <td className="hidden xl:table-cell" />
                  <td className="hidden whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-700 xl:table-cell">{formatEuro(sums.net)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-slate-900">{formatEuro(sums.gross)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {filtered.map((i) => (
              <li key={i.id}>
                <Card padding="sm" className={cn(i.status === 'overdue' && 'border-red-200')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{i.number}</p>
                      <Link to={`/admin/kunden/${encodeURIComponent(i.customerId)}`} className="block truncate text-sm text-brand-700">
                        {i.customerName}
                      </Link>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money cents={i.gross} className="font-bold text-slate-900" />
                      <div className="mt-1">
                        <InvoiceStatusBadge status={i.status} />
                      </div>
                    </div>
                  </div>
                  <p className={cn('mt-2 text-sm', i.status === 'overdue' ? 'font-medium text-red-600' : 'text-slate-500')}>
                    {formatDate(i.date, 'short')} · {dueText(i, today)}
                  </p>
                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <PrintInvoiceButton invoice={i} />
                    <MarkPaidButton invoice={i} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <TableFootnote>
            {formatCount(filtered.length)} {filtered.length === 1 ? 'Rechnung' : 'Rechnungen'} · netto {formatEuro(sums.net)} · MwSt. {formatEuro(sums.vat)} · brutto {formatEuro(sums.gross)}
          </TableFootnote>
        </>
      )}

      <BillingRunModal open={runOpen} onClose={() => setRunOpen(false)} candidates={candidates} />
    </>
  );
}
