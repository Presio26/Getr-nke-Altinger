import { useState, type ReactNode } from 'react';
import { CheckCircle2, MapPin, ShoppingBag, Truck } from 'lucide-react';
import type { DeliveryZone } from '@shared/types';
import { formatEuro } from '@shared/format';
import { useMyCustomer, useSettings } from '@/api/hooks';
import { cn } from '@/lib/cn';
import { ZipCheck } from '../ZipCheck';

/**
 * Fortschritt bis Mindestbestellwert bzw. kostenloser Lieferung.
 * Zone aus dem Quote/der Standardadresse des Kunden; ohne Adresse (Gäste) ein Garching-Hinweis mit PLZ-Prüfung.
 */
export function DeliveryProgress({
  fulfillment,
  zone,
  itemsGross,
  outsideZone,
}: {
  fulfillment: 'delivery' | 'pickup';
  zone?: DeliveryZone;
  /** Warenwert brutto ohne Pfand */
  itemsGross: number;
  /** Adresse des Kunden liegt außerhalb der Liefergebiete */
  outsideZone?: string;
}) {
  const settings = useSettings();
  const { data: customer } = useMyCustomer();
  const [zipOpen, setZipOpen] = useState(false);
  const home = settings.zones.find((z) => z.zips.includes(settings.zip));

  if (fulfillment === 'pickup') {
    return (
      <Banner tone="success" icon={ShoppingBag} title="Click & Collect – ohne Mindestbestellwert">
        Wir stellen alles zusammen; Ihre Bestellung liegt {settings.pickupHoldHours} Stunden im Markt für Sie bereit.
      </Banner>
    );
  }

  if (!zone) {
    if (outsideZone) {
      return (
        <Banner tone="warning" icon={MapPin} title="Ihre Adresse liegt außerhalb unseres Liefergebiets">
          {outsideZone} Wählen Sie an der Kasse eine andere Adresse oder holen Sie im Markt ab.
        </Banner>
      );
    }
    return (
      <div className="rounded-2xl bg-brand-50/70 p-3.5 ring-1 ring-inset ring-brand-100">
        <div className="flex gap-3">
          <Truck size={20} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
          <div className="min-w-0 text-sm leading-relaxed text-brand-950">
            <p className="font-semibold">{home && home.fee === 0 ? `In ${home.name} liefern wir kostenlos` : 'Lieferung in Garching & Umgebung'}</p>
            <p className="mt-0.5 text-brand-900/80">
              {home ? `Ab ${formatEuro(home.minOrder)} Warenwert. ` : ''}Für andere Orte wird die Liefergebühr an der Kasse anhand Ihrer Adresse berechnet.
            </p>
            {!zipOpen ? (
              <button type="button" onClick={() => setZipOpen(true)} className="mt-1 min-h-9 font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
                Liefergebiet für Ihre PLZ prüfen
              </button>
            ) : null}
          </div>
        </div>
        {zipOpen ? <ZipCheck compact className="mt-3" /> : null}
      </div>
    );
  }

  const b2b = customer?.b2b;
  const freeForCustomer = !!b2b?.freeDelivery && b2b.status === 'active';
  const missingMin = Math.max(0, zone.minOrder - itemsGross);
  const hasFee = zone.fee > 0 && !freeForCustomer;
  const target = hasFee ? Math.max(zone.freeFrom, zone.minOrder) : zone.minOrder;
  const missingFree = hasFee ? Math.max(0, zone.freeFrom - itemsGross) : 0;
  const pct = target > 0 ? Math.min(100, Math.round((itemsGross / target) * 100)) : 100;
  const minMarker = hasFee && zone.minOrder < target ? Math.round((zone.minOrder / target) * 100) : null;
  const done = missingMin === 0 && missingFree === 0;

  let title: string;
  let text: string;
  if (missingMin > 0) {
    title = `Noch ${formatEuro(missingMin)} bis zum Mindestbestellwert`;
    text = `Für ${zone.name} liefern wir ab ${formatEuro(zone.minOrder)} Warenwert${hasFee ? `, ab ${formatEuro(zone.freeFrom)} kostenlos` : ' – und zwar kostenlos'}.`;
  } else if (missingFree > 0) {
    title = `Noch ${formatEuro(missingFree)} bis zur kostenlosen Lieferung`;
    text = `Aktuell ${formatEuro(zone.fee)} Liefergebühr für ${zone.name}.`;
  } else {
    title = 'Kostenlose Lieferung';
    text = freeForCustomer ? 'Laut Ihren Konditionen liefern wir immer frei Haus.' : `Der Mindestbestellwert für ${zone.name} ist erreicht.`;
  }

  return (
    <div className={cn('rounded-2xl p-3.5 ring-1 ring-inset', done ? 'bg-emerald-50/80 ring-emerald-200' : 'bg-slate-50 ring-slate-200')}>
      <div className="flex items-start gap-3">
        {done ? (
          <CheckCircle2 size={20} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
        ) : (
          <Truck size={20} aria-hidden className={cn('mt-0.5 shrink-0', missingMin > 0 ? 'text-amber-600' : 'text-brand-600')} />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold', done ? 'text-emerald-900' : 'text-slate-900')}>{title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{text}</p>
        </div>
      </div>
      <div
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200"
        role="progressbar"
        aria-label="Fortschritt bis zur kostenlosen Lieferung"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', done ? 'bg-emerald-500' : missingMin > 0 ? 'bg-amber-400' : 'bg-brand-600')}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
        {minMarker !== null ? <span className="absolute inset-y-0 w-0.5 bg-slate-400/70" style={{ left: `${minMarker}%` }} aria-hidden /> : null}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-medium tabular-nums text-slate-500">
        <span>{formatEuro(itemsGross)}</span>
        {minMarker !== null ? <span>Mindestwert {formatEuro(zone.minOrder)}</span> : null}
        <span>{hasFee ? `frei ab ${formatEuro(target)}` : `Mindestwert ${formatEuro(target)}`}</span>
      </div>
    </div>
  );
}

function Banner({ tone, icon: Icon, title, children }: { tone: 'success' | 'warning'; icon: typeof Truck; title: string; children: ReactNode }) {
  return (
    <div className={cn('flex gap-3 rounded-2xl p-3.5 ring-1 ring-inset', tone === 'success' ? 'bg-emerald-50/80 ring-emerald-200' : 'bg-amber-50 ring-amber-200')}>
      <Icon size={20} aria-hidden className={cn('mt-0.5 shrink-0', tone === 'success' ? 'text-emerald-600' : 'text-amber-600')} />
      <div className="min-w-0 text-sm">
        <p className={cn('font-semibold', tone === 'success' ? 'text-emerald-900' : 'text-amber-950')}>{title}</p>
        <p className={cn('mt-0.5 leading-snug', tone === 'success' ? 'text-emerald-900/80' : 'text-amber-900/85')}>{children}</p>
      </div>
    </div>
  );
}
