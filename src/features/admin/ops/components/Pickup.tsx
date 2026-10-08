/**
 * Click & Collect: Abhol-Dialog (Kunde, Positionen, Leergut, zu zahlender Betrag, Aktionen)
 * und QR-Scanner per BarcodeDetector-API (nur, wenn der Browser sie unterstützt).
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, CreditCard, PackageCheck, Phone, Receipt, ShoppingBag, XCircle } from 'lucide-react';
import type { Order } from '@shared/types';
import { PAYMENT_METHOD_LABEL, formatDate, formatDateTime, formatEuro, formatTime } from '@shared/format';
import { todayString } from '@shared/time';
import { Button, ButtonLink, Modal, Notice, OrderStatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useOrderStatus } from '../api';
import { orderCrates, relDayInline } from '../model';
import { B2BTag } from './OrderBits';
import { EmptiesList, OrderLinesList, OrderTotals } from './OrderLines';

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
  const [target, setTarget] = useState<'ready' | 'picked_up' | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  useEffect(() => {
    setJustDone(null);
  }, [order?.id]);
  if (!order) return null;
  const pay = paymentInfo(order);
  const today = todayString();
  const final = order.status === 'picked_up' || order.status === 'cancelled';
  const canReady = ['pending', 'confirmed', 'picking'].includes(order.status);
  const canPickup = ['pending', 'confirmed', 'picking', 'ready'].includes(order.status) && order.fulfillment === 'pickup';
  const expired = !!order.holdUntil && Date.parse(order.holdUntil) < Date.now() && !final;
  const PayIcon = pay.icon;

  const run = (to: 'ready' | 'picked_up') => {
    setTarget(to);
    mutation.mutate(
      { order, to },
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
          <div className={cn('rounded-2xl p-4 ring-1 ring-inset', pay.due ? 'bg-brand-900 text-white ring-brand-900' : 'bg-emerald-50 text-emerald-900 ring-emerald-200')}>
            <p className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', pay.due ? 'text-white/70' : 'text-emerald-700')}>
              <PayIcon size={14} aria-hidden />
              {pay.title}
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{formatEuro(Math.abs(order.totals.total))}</p>
            <p className={cn('mt-0.5 text-sm', pay.due ? 'text-white/80' : 'text-emerald-800')}>
              {pay.text}
              {order.totals.depositRefund ? ` · inkl. ${formatEuro(order.totals.depositRefund)} Leergut-Gutschrift` : ''}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-900">
            Positionen <span className="font-normal text-slate-500">· {orderCrates(order)} Gebinde</span>
          </p>
          <OrderLinesList order={order} compact />
        </div>
        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div>
            <EmptiesList lines={order.emptiesReturn} title="Leergut annehmen" />
            {!order.emptiesReturn.length ? <p className="text-sm text-slate-500">Kein Leergut angemeldet.</p> : null}
          </div>
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

// ───────────────────────────── QR-Scanner ─────────────────────────────

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function QrScannerModal({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReady(false);
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    (async () => {
      if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
        setError('Dieser Browser unterstützt das Scannen mit der Kamera nicht. Bitte geben Sie den Code ein.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        const detector = new Ctor({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const value = codes.find((c) => c.rawValue)?.rawValue;
            if (value) {
              resultRef.current(value);
              return;
            }
          } catch {
            // einzelne Erkennungsfehler ignorieren
          }
          timer = window.setTimeout(tick, 220);
        };
        void tick();
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Der Zugriff auf die Kamera wurde nicht erlaubt. Bitte erlauben Sie ihn in den Browser-Einstellungen oder geben Sie den Code ein.'
            : 'Die Kamera konnte nicht gestartet werden. Bitte geben Sie den Code ein.',
        );
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="QR-Code scannen" description="Halten Sie den QR-Code aus der App des Kunden vor die Kamera." size="md">
      {error ? (
        <Notice tone="warning">{error}</Notice>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-slate-900">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-4 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.45)]" aria-hidden />
          {!ready ? <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white/80">Kamera wird gestartet …</p> : null}
        </div>
      )}
    </Modal>
  );
}
