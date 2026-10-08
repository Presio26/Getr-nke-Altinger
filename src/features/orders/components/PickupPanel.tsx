import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, ChevronDown, Hourglass, PackageCheck, ShoppingBag } from 'lucide-react';
import type { Order, StoreSettings } from '@shared/types';
import { formatDate, formatDateTime, formatSlot } from '@shared/format';
import { dayString, timeString, weekdayOf } from '@shared/time';
import { useSettings } from '@/api/hooks';
import { Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { pickupQrContent } from '../lib/links';

function useQrDataUrl(content: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!content) {
      setUrl(null);
      return;
    }
    QRCode.toDataURL(content, { width: 560, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0d1f38', light: '#ffffff' } })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [content]);
  return url;
}

function pickedUpAt(order: Order): string {
  for (let i = order.statusHistory.length - 1; i >= 0; i--) {
    if (order.statusHistory[i].status === 'picked_up') return order.statusHistory[i].at;
  }
  return order.updatedAt;
}

/** „Mo., 12.10., 16:00 Uhr (Ladenschluss)“ – Ladenschluss kenntlich machen, wenn die Reservierung dann endet */
function holdText(holdUntil: string, settings: StoreSettings): string {
  const d = new Date(holdUntil);
  const time = timeString(d);
  const hours = settings.openingHours?.[weekdayOf(dayString(d))];
  return `${formatDate(holdUntil, 'medium')}, ${time} Uhr${hours && hours.close === time ? ' (Ladenschluss)' : ''}`;
}

/** Click & Collect: großer QR-Code, Abholcode, Reservierung, Markt-Infos (nach der Abholung eingeklappt) */
export function PickupPanel({ order }: { order: Order }) {
  const settings = useSettings();
  const code = order.pickupCode ?? null;
  const ready = order.status === 'ready';
  const done = order.status === 'picked_up';
  const cancelled = order.status === 'cancelled';
  const usable = !done && !cancelled;
  const [showCode, setShowCode] = useState(false);
  const expanded = usable || showCode;
  const qr = useQrDataUrl(code && expanded ? pickupQrContent(order.id, code) : null);

  return (
    <Card padding="none" className="overflow-hidden">
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3.5 sm:px-5',
          ready ? 'bg-emerald-600 text-white' : done ? 'bg-slate-100 text-slate-700' : cancelled ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-900',
        )}
        role="status"
      >
        {ready ? <PackageCheck size={22} aria-hidden /> : done ? <CheckCircle2 size={22} aria-hidden /> : <Hourglass size={22} aria-hidden />}
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight">
            {ready ? 'Abholbereit – Ihre Bestellung wartet auf Sie!' : done ? 'Abgeholt – vielen Dank!' : cancelled ? 'Reservierung storniert' : 'Wird für Sie vorbereitet'}
          </p>
          <p className={cn('text-sm', ready ? 'text-white/85' : 'opacity-80')}>
            {ready
              ? 'Zeigen Sie den QR-Code oder Abholcode an der Kasse vor.'
              : done
                ? `Abgeholt am ${formatDateTime(pickedUpAt(order))} Uhr`
                : cancelled
                  ? 'Der Abholcode ist nicht mehr gültig.'
                  : 'Wir benachrichtigen Sie, sobald alles an der Abholtheke bereitsteht.'}
          </p>
        </div>
        {!usable && code ? (
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            aria-expanded={showCode}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-brand-700 hover:bg-white/70"
          >
            <span className="hidden sm:inline">{showCode ? 'Abholcode ausblenden' : 'Abholcode anzeigen'}</span>
            <span className="sm:hidden">{showCode ? 'Ausblenden' : 'Abholcode'}</span>
            <ChevronDown size={16} aria-hidden className={cn('transition-transform', showCode && 'rotate-180')} />
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <div className="mx-auto flex flex-col items-center">
            <div
              className={cn(
                'relative rounded-3xl bg-white p-3 shadow-raised ring-1 ring-slate-200',
                !usable && 'opacity-35 grayscale',
              )}
            >
              {qr ? (
                <img src={qr} alt={`QR-Code für Bestellung ${order.number}`} className="h-56 w-56 sm:h-60 sm:w-60" width={240} height={240} />
              ) : (
                <Skeleton className="h-56 w-56 rounded-2xl sm:h-60 sm:w-60" />
              )}
              {ready ? (
                <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md ring-4 ring-white">
                  <ShoppingBag size={17} aria-hidden />
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Abholcode</p>
            <p
              className={cn('mt-1 font-mono text-[2.1rem] font-bold leading-none tracking-[0.18em] text-slate-900 tabular-nums', !usable && 'text-slate-400 line-through')}
              aria-label={code ? `Abholcode ${code.split('').join(' ')}` : undefined}
            >
              {code ?? '––––––'}
            </p>
          </div>

          <div className="min-w-0 space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-3.5 py-3">
                <dt className="text-[13px] font-medium text-slate-500">Abholfenster</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{formatSlot(order.slot)}</dd>
              </div>
              {order.holdUntil ? (
                <div className={cn('rounded-xl px-3.5 py-3', ready ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'bg-slate-50')}>
                  <dt className="text-[13px] font-medium text-slate-500">Reserviert bis</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">{holdText(order.holdUntil, settings)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-sm leading-relaxed text-slate-600">
              Bitte kommen Sie im gewählten Zeitfenster zur <strong className="font-semibold text-slate-800">Abholtheke neben der Kasse</strong>.
              {order.paymentStatus === 'paid' ? ' Ihre Bestellung ist bereits bezahlt.' : ' Bezahlt wird bequem vor Ort.'}
              {order.emptiesReturn.length ? ' Ihr Leergut nehmen wir direkt an der Leergutannahme entgegen.' : ''}
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
