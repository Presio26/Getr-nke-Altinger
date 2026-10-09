import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileStack, PartyPopper, Printer } from 'lucide-react';
import type { Customer, Invoice, Order } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { Button, Checkbox, EmptyState, Modal, Spinner, errorMessage, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { isBillable } from '../lib';
import { invoicePrintPath } from './invoiceUi';

export interface BillingCandidate {
  customer: Customer;
  orders: Order[];
  amount: number;
  oldest: string;
}

/** B2B-Kunden mit gelieferten, noch nicht abgerechneten Rechnungs-/SEPA-Bestellungen */
export function billingCandidates(customers: Customer[], orders: Order[]): BillingCandidate[] {
  const byCustomer = new Map<string, Order[]>();
  for (const o of orders) {
    if (!isBillable(o)) continue;
    const list = byCustomer.get(o.customerId) ?? [];
    list.push(o);
    byCustomer.set(o.customerId, list);
  }
  const out: BillingCandidate[] = [];
  for (const c of customers) {
    if (c.type !== 'b2b' || !c.b2b) continue;
    const list = byCustomer.get(c.id);
    if (!list?.length) continue;
    out.push({
      customer: c,
      orders: list,
      amount: list.reduce((s, o) => s + o.totals.total, 0),
      oldest: list.reduce((m, o) => (o.slot.date < m ? o.slot.date : m), list[0].slot.date),
    });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

type Result = { customer: Customer; invoice?: Invoice; error?: string };

/** Rechnungslauf: für alle gewählten Kunden adminCreateInvoice aufrufen und Ergebnis anzeigen */
export function BillingRunModal({ open, onClose, candidates }: { open: boolean; onClose: () => void; candidates: BillingCandidate[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'select' | 'running' | 'done'>('select');
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPhase('select');
    setResults([]);
    setProgress(0);
    setSelected(new Set(candidates.map((c) => c.customer.id)));
    // nur beim Öffnen vorbelegen
  }, [open]);

  const chosen = useMemo(() => candidates.filter((c) => selected.has(c.customer.id)), [candidates, selected]);
  const total = chosen.reduce((s, c) => s + c.amount, 0);

  const run = async () => {
    setPhase('running');
    const out: Result[] = [];
    for (const c of chosen) {
      try {
        const invoice = await api.adminCreateInvoice(c.customer.id);
        out.push({ customer: c.customer, invoice });
      } catch (err) {
        out.push({ customer: c.customer, error: errorMessage(err) });
      }
      setProgress(out.length);
      setResults([...out]);
    }
    await qc.invalidateQueries({ queryKey: qk.admin });
    setPhase('done');
    const ok = out.filter((r) => r.invoice).length;
    if (ok) toast.success(ok === 1 ? '1 Rechnung erstellt' : `${ok} Rechnungen erstellt`, { description: 'Die Kunden wurden benachrichtigt.' });
    if (out.length - ok) toast.error(`${out.length - ok} Rechnung(en) konnten nicht erstellt werden.`);
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const created = results.filter((r) => r.invoice);
  const createdSum = created.reduce((s, r) => s + (r.invoice?.gross ?? 0), 0);

  return (
    <Modal
      open={open}
      onClose={phase === 'running' ? () => {} : onClose}
      size="lg"
      title="Rechnungslauf"
      description={
        phase === 'done'
          ? 'Ergebnis des Rechnungslaufs'
          : 'Fasst je Geschäftskunde alle gelieferten, noch nicht abgerechneten Bestellungen auf Rechnung/SEPA zu einer Rechnung zusammen.'
      }
      footer={
        phase === 'done' || !candidates.length ? (
          <Button onClick={onClose}>Schließen</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={phase === 'running'}>
              Abbrechen
            </Button>
            <Button icon={FileStack} onClick={() => void run()} loading={phase === 'running'} disabled={!chosen.length}>
              {chosen.length === 1 ? '1 Rechnung erstellen' : `${chosen.length} Rechnungen erstellen`}
            </Button>
          </>
        )
      }
    >
      {!candidates.length && phase === 'select' ? (
        <EmptyState icon={PartyPopper} title="Alles abgerechnet" description="Es gibt keine gelieferten Rechnungs-Bestellungen, die noch nicht abgerechnet sind." />
      ) : phase === 'select' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <button
              type="button"
              className="font-semibold text-brand-700 hover:underline"
              onClick={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.customer.id)))}
            >
              {selected.size === candidates.length ? 'Keine auswählen' : 'Alle auswählen'}
            </button>
            <span className="text-slate-500">
              Summe: <strong className="tabular-nums text-slate-900">{formatEuro(total)}</strong>
            </span>
          </div>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.customer.id} className={cn('rounded-2xl border px-4 py-1', selected.has(c.customer.id) ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200')}>
                <Checkbox
                  checked={selected.has(c.customer.id)}
                  onChange={() => toggle(c.customer.id)}
                  label={
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span>{c.customer.name}</span>
                      <span className="tabular-nums">{formatEuro(c.amount)}</span>
                    </span>
                  }
                  description={`${c.orders.length} ${c.orders.length === 1 ? 'Lieferung' : 'Lieferungen'} seit ${formatDate(c.oldest, 'short')} · ${c.orders.map((o) => o.number).join(', ')} · Zahlungsziel ${c.customer.b2b?.paymentTermsDays ?? 14} Tage`}
                  containerClassName="[&>span:last-child]:flex-1"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          {phase === 'running' ? (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <Spinner size={18} />
              Rechnung {Math.min(progress + 1, chosen.length)} von {chosen.length} wird erstellt …
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
              <p className="font-semibold">
                {created.length === 1 ? '1 Rechnung' : `${created.length} Rechnungen`} über {formatEuro(createdSum)} erstellt
              </p>
              <p className="mt-0.5 opacity-90">Die Kunden wurden in der App benachrichtigt.</p>
            </div>
          )}
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {results.map((r) => (
              <li key={r.customer.id} className="flex items-center gap-3 px-4 py-3">
                {r.invoice ? <CheckCircle2 size={20} aria-hidden className="shrink-0 text-emerald-600" /> : <AlertTriangle size={20} aria-hidden className="shrink-0 text-red-600" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{r.customer.name}</p>
                  <p className={cn('text-sm', r.invoice ? 'text-slate-500' : 'text-red-700')}>
                    {r.invoice ? `${r.invoice.number} · fällig ${formatDate(r.invoice.dueDate, 'short')}` : r.error}
                  </p>
                </div>
                {r.invoice ? (
                  <>
                    <span className="font-semibold tabular-nums text-slate-900">{formatEuro(r.invoice.gross)}</span>
                    <Link
                      to={invoicePrintPath(r.invoice)}
                      onClick={onClose}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label={`Druckansicht ${r.invoice.number}`}
                      title="Druckansicht"
                    >
                      <Printer size={17} aria-hidden />
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
