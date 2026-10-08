/**
 * Click & Collect: Abhol-Dialog (Kunde, Positionen, tatsächlich angenommenes Leergut,
 * zu zahlender Betrag, Aktionen). Der QR-Scanner liegt in `QrScanner.tsx`.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, CreditCard, PackageCheck, Phone, Receipt, Recycle, ShoppingBag, XCircle } from 'lucide-react';
import type { Order } from '@shared/types';
import { PAYMENT_METHOD_LABEL, formatDate, formatDateTime, formatEuro, formatTime } from '@shared/format';
import { todayString } from '@shared/time';
import { useDepositTypes } from '@/api/hooks';
import { Button, ButtonLink, Modal, Notice, OrderStatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useOrderStatus } from '../api';
import { orderCrates, relDayInline } from '../model';
import { B2BTag } from './OrderBits';
import { EmptiesList, OrderLinesList, OrderTotals } from './OrderLines';
import { EmptiesEditor, emptiesRefund, emptiesToLines, linesToEmpties, type EmptiesValue } from './EmptiesEditor';

export { QrScannerModal } from './QrScanner';

// ───────────────────────────── Zahlung ─────────────────────────────

export function paymentInfo(order: Order): { due: boolean; title: string; text: string; icon: typeof Banknote } {
  const m = order.paymentMethod;
  if (order.paymentStatus === 'paid') return { due: false, title: 'Bereits bezahlt', text: PAYMENT_METHOD_LABEL[m], icon: CheckCircle2 };
  if (m === 'invoice' || m === 'sepa' || order.paymentStatus === 'invoiced')
    return { due: false, title: m === 'sepa' ? 'Per Lastschrift' : 'Auf Rechnung', text: 'Nichts zu kassieren', icon: Receipt };
  if (order.totals.total < 0) return { due: true, title: 'Auszuzahlen', text: 'Leergut-Guthaben bar auszahlen', icon: Banknote };
  return { due: true, title: 'Zu kassieren', text: m === 'ec' ? 'EC-/Girocard' : m === 'cash' ? 'Bar' : PAYMENT_METHOD_LABEL[m], icon: m === 'ec' || m === 'card' ? CreditCard : Banknote };
}

// ───────────────────────────── Abhol-Dialog ─────────────────────────────

export function PickupModal({ order, onClose, onNext }: { order: Order | null; onClose: () => void; onNext?: () => void }) {
  const mutation = useOrderStatus();
  const depositTypes = useDepositTypes();
  const [target, setTarget] = useState<'ready' | 'picked_up' | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [empties, setEmpties] = useState<EmptiesValue>({});
  const orderId = order?.id;
  useEffect(() => {
    setJustDone(null);
    setEmpties(order ? linesToEmpties(order.emptiesReturn) : {});
    // nur beim Wechsel der Bestellung vorbelegen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  const primaryIds = useMemo(
    () => (order ? [...order.emptiesReturn.map((l) => l.depositTypeId), ...order.lines.map((l) => l.depositTypeId).filter((x): x is string => !!x)] : []),
    [order],
  );
  if (!order) return null;
  const pay = paymentInfo(order);
  const today = todayString();
  const final = order.status === 'picked_up' || order.status === 'cancelled';
  const canReady = ['pending', 'confirmed', 'picking'].includes(order.status);
  const canPickup = ['pending', 'confirmed', 'picking', 'ready'].includes(order.status) && order.fulfillment === 'pickup';
  const expired = !!order.holdUntil && Date.parse(order.holdUntil) < Date.now() && !final;

  // tatsächlich angenommenes Leergut → angepasster Betrag (wie im Core: Gutschrift nach Rücknahme)
  const announced = linesToEmpties(order.emptiesReturn);
  const refund = emptiesRefund(empties, depositTypes);
  const emptiesChanged = emptiesToLines(empties).map((l) => `${l.depositTypeId}:${l.qty}`).sort().join('|') !== order.emptiesReturn.filter((l) => l.qty > 0).map((l) => `${l.depositTypeId}:${l.qty}`).sort().join('|');
  const amount = order.totals.total - (refund - order.totals.depositRefund);
  const canEditEmpties = !final && order.fulfillment === 'pickup' && justDone !== 'picked_up';
  const shownAmount = canEditEmpties && emptiesChanged ? amount : order.totals.total;
  const shownRefund = canEditEmpties && emptiesChanged ? refund : order.totals.depositRefund;
  const shownPay = canEditEmpties && emptiesChanged ? paymentInfo({ ...order, totals: { ...order.totals, total: amount } }) : pay;
  const PayIcon = shownPay.icon;
  const doneLines = justDone === 'picked_up' ? emptiesToLines(empties) : order.proof?.emptiesCollected ?? order.emptiesReturn;

  const run = (to: 'ready' | 'picked_up') => {
    setTarget(to);
    mutation.mutate(
      { order, to, ...(to === 'picked_up' ? { emptiesCollected: emptiesToLines(empties) } : {}) },
      {
        onSuccess: () => setJustDone(to),
        onSettled: () => setTarget(null),
      },
    );
  };

  return (
    <Modal
      open
      onClose={mutation.isPending ? () => {} : onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Abholung {order.number}
          <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
        </span>
      }
      description={`${formatDate(order.slot.date, 'relative')} · ${order.slot.start}–${order.slot.end} Uhr · Abholcode ${order.pickupCode ?? '–'}`}
      footer={
        <>
          <ButtonLink to={`/admin/bestellungen/${order.id}`} variant="ghost" iconRight={ArrowRight} className="sm:mr-auto">
            Alle Details
          </ButtonLink>
          {final || justDone === 'picked_up' ? (
            <Button variant="outline" onClick={onNext ?? onClose}>
              {onNext ? 'Nächsten Code prüfen' : 'Schließen'}
            </Button>
          ) : (
            <>
              {canReady ? (
                <Button variant="outline" icon={PackageCheck} loading={target === 'ready'} disabled={mutation.isPending} onClick={() => run('ready')}>
                  Bereitgestellt
                </Button>
              ) : null}
              {canPickup ? (
                <Button variant="success" icon={ShoppingBag} loading={target === 'picked_up'} disabled={mutation.isPending} onClick={() => run('picked_up')}>
                  Abgeholt
                </Button>
              ) : null}
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {justDone === 'picked_up' || order.status === 'picked_up' ? (
          <Notice tone="success" icon={CheckCircle2} title="Übergeben – vielen Dank!">
            {order.status === 'picked_up'
              ? `Abgeholt am ${formatDateTime(order.statusHistory[order.statusHistory.length - 1]?.at ?? order.updatedAt)} Uhr. Leergut und Treuepunkte wurden verbucht.`
              : 'Die Abholung wurde verbucht.'}
          </Notice>
        ) : justDone === 'ready' ? (
          <Notice tone="success" icon={PackageCheck} title="Bereitgestellt">
            Der Kunde wurde benachrichtigt, dass seine Bestellung abholbereit ist.
          </Notice>
        ) : null}
        {order.status === 'cancelled' ? (
          <Notice tone="danger" icon={XCircle} title="Diese Reservierung wurde storniert">
            Bitte keine Ware herausgeben.
          </Notice>
        ) : null}
        {order.fulfillment !== 'pickup' ? (
          <Notice tone="warning" title="Keine Abholung">
            Diese Bestellung wird geliefert.
          </Notice>
        ) : null}
        {expired ? (
          <Notice tone="warning" icon={AlertTriangle} title="Reservierung abgelaufen">
            Reserviert bis {formatDateTime(order.holdUntil as string)} Uhr – bitte Bestand prüfen, die Ware kann trotzdem übergeben werden.
          </Notice>
        ) : null}
        {!final && order.slot.date !== today ? (
          <Notice tone="info" title={`Abholung geplant für ${formatDate(order.slot.date, 'long')}`}>
            Fenster {order.slot.start}–{order.slot.end} Uhr. Eine frühere Übergabe ist möglich, wenn die Ware bereitsteht.
          </Notice>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kunde</p>
            <p className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-slate-900">
              <span className="truncate">{order.customerName}</span>
              <B2BTag type={order.customerType} />
            </p>
            {order.customerPhone ? (
              <a href={`tel:${order.customerPhone.replace(/\s+/g, '')}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-brand-700">
                <Phone size={14} aria-hidden /> {order.customerPhone}
              </a>
            ) : null}
            {order.reference ? <p className="mt-1 text-sm text-slate-500">Referenz: {order.reference}</p> : null}
            {order.notes ? <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">{order.notes}</p> : null}
          </div>
          <div className={cn('rounded-2xl p-4 ring-1 ring-inset', shownPay.due ? 'bg-brand-900 text-white ring-brand-900' : 'bg-emerald-50 text-emerald-900 ring-emerald-200')}>
            <p className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', shownPay.due ? 'text-white/70' : 'text-emerald-700')}>
              <PayIcon size={14} aria-hidden />
              {shownPay.title}
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{formatEuro(Math.abs(shownAmount))}</p>
            <p className={cn('mt-0.5 text-sm', shownPay.due ? 'text-white/80' : 'text-emerald-800')}>
              {shownPay.text}
              {shownRefund ? ` · inkl. ${formatEuro(shownRefund)} Leergut-Gutschrift` : ''}
            </p>
            {canEditEmpties && emptiesChanged ? (
              <p className={cn('mt-1.5 text-xs font-semibold', shownPay.due ? 'text-accent-300' : 'text-emerald-700')}>
                Angepasst an das angenommene Leergut (vorher {formatEuro(Math.abs(order.totals.total))})
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-900">
            Positionen <span className="font-normal text-slate-500">· {orderCrates(order)} Gebinde</span>
          </p>
          <OrderLinesList order={order} compact />
        </div>
        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {canEditEmpties ? (
            <div className="rounded-xl bg-emerald-50/60 p-3 ring-1 ring-inset ring-emerald-100">
              <p className="mb-0.5 flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                <Recycle size={15} aria-hidden />
                Leergut annehmen
              </p>
              <p className="mb-2 text-xs text-emerald-900/80">
                {order.emptiesReturn.length ? 'Vorbelegt mit der Anmeldung – bitte die tatsächlich gebrachten Mengen erfassen.' : 'Kein Leergut angemeldet. Bringt der Kunde doch welches mit, hier erfassen.'}
              </p>
              <EmptiesEditor value={empties} onChange={setEmpties} depositTypes={depositTypes} primaryIds={primaryIds} announced={announced} disabled={mutation.isPending} />
            </div>
          ) : (
            <div>
              <EmptiesList lines={doneLines} title={justDone === 'picked_up' || order.proof ? 'Leergut angenommen' : 'Leergut angemeldet'} />
              {!doneLines.length ? <p className="text-sm text-slate-500">Kein Leergut.</p> : null}
            </div>
          )}
          <OrderTotals order={order} />
        </div>
        {order.holdUntil && !final && !expired ? (
          <p className="text-xs text-slate-500">
            Reserviert bis {relDayInline(order.holdUntil)} {formatTime(order.holdUntil)} Uhr.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

