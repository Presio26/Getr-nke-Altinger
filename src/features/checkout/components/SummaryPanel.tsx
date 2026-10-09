import { forwardRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Gift, Lock, Pencil, ShoppingBag, Truck } from 'lucide-react';
import type { Customer, FulfillmentType, Product, Quote, TimeSlot } from '@shared/types';
import { formatEuro, formatSlot } from '@shared/format';
import { Button, Checkbox, Notice, Skeleton } from '@/components/ui';
import { ProductImage } from '@/components/product';
import { cn } from '@/lib/cn';
import { OrderLinesList } from '@/features/orders/components/OrderLinesList';
import { TotalsBlock } from '@/features/orders/components/TotalsBlock';
import { CouponField } from './CouponField';

export interface SummaryPanelProps {
  quote: Quote | undefined;
  /** Neuberechnung läuft */
  updating: boolean;
  products: Map<string, Product>;
  customer: Customer;
  fulfillment: FulfillmentType;
  slot?: TimeSlot;
  itemCount: number;
  couponCode?: string;
  onCoupon: (code: string | undefined) => void;
  couponError?: string | null;
  terms: boolean;
  onTerms: (v: boolean) => void;
  termsError?: string | null;
  placing: boolean;
  onPlace: () => void;
  placeError?: string | null;
  /** zusätzliche Hinweise oberhalb des Buttons (z. B. fehlende Angaben) */
  extra?: ReactNode;
}

/** Bestellzusammenfassung (Desktop: rechts, sticky; Handy: am Ende) mit Bestell-Button */
/** ab dieser Anzahl Positionen zunächst nur als Vorschau (Zusammenfassung bleibt kompakt) */
const MAX_OPEN_LINES = 3;

export const SummaryPanel = forwardRef<HTMLButtonElement, SummaryPanelProps>(function SummaryPanel(p, buttonRef) {
  const q = p.quote;
  const [showAll, setShowAll] = useState(false);
  const collapsible = !!q && q.lines.length > MAX_OPEN_LINES;
  const showNet = p.customer.type === 'b2b';
  const couponIssue = q?.errors.find((e) => e.code === 'coupon') ?? null;
  const couponWarning = q?.warnings.find((e) => e.code === 'coupon') ?? null;
  const errors = (q?.errors ?? []).filter((e) => e.code !== 'coupon');
  const warnings = (q?.warnings ?? []).filter((e) => e.code !== 'coupon' && e.code !== 'slot');
  const freeFrom = q?.zone?.freeFrom ?? 0;
  const progress = freeFrom > 0 && q ? Math.min(100, Math.round((q.totals.itemsGross / freeFrom) * 100)) : 0;

  return (
    <section id="kasse-summe" aria-labelledby="kasse-summe-title" className="scroll-mt-24 rounded-2xl border border-slate-200/70 bg-white shadow-card lg:scroll-mt-40">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div>
          <h2 id="kasse-summe-title" className="text-lg font-bold tracking-tight text-slate-900">
            Ihre Bestellung
          </h2>
          <p className="text-sm text-slate-500">
            {p.itemCount} {p.itemCount === 1 ? 'Artikel' : 'Artikel'}
            {showNet ? ' · Nettopreise' : ''}
          </p>
        </div>
        <Link to="/warenkorb" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <Pencil size={15} aria-hidden />
          Bearbeiten
        </Link>
      </header>

      <div className="px-4 sm:px-5">
        {q ? (
          collapsible && !showAll ? (
            <div className="flex items-center gap-3 py-3.5">
              <ul className="flex shrink-0 -space-x-2" aria-hidden>
                {q.lines.slice(0, 4).map((l) => {
                  const product = p.products.get(l.productId);
                  return (
                    <li key={l.productId} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-slate-200">
                      {product ? <ProductImage product={product} /> : null}
                    </li>
                  );
                })}
                {q.lines.length > 4 ? (
                  <li className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200">+{q.lines.length - 4}</li>
                ) : null}
              </ul>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                aria-expanded={false}
                className="inline-flex min-h-11 min-w-0 items-center gap-1 text-left text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                Alle {q.lines.length} Positionen anzeigen
                <ChevronDown size={16} aria-hidden className="shrink-0" />
              </button>
            </div>
          ) : (
            <>
              <OrderLinesList lines={q.lines} products={p.products} showNet={showNet} compact />
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  aria-expanded
                  className="mb-1 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
                >
                  <ChevronDown size={16} aria-hidden className="rotate-180" />
                  Weniger anzeigen
                </button>
              ) : null}
            </>
          )
        ) : (
          <div className="space-y-3 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-100 px-4 py-4 sm:px-5">
        {p.slot ? (
          <p className="flex items-center gap-2 text-sm text-slate-700">
            {p.fulfillment === 'pickup' ? <ShoppingBag size={16} aria-hidden className="text-brand-700" /> : <Truck size={16} aria-hidden className="text-brand-700" />}
            <span>
              {p.fulfillment === 'pickup' ? 'Abholung' : 'Lieferung'} <span className="font-semibold">{formatSlot(p.slot)}</span>
            </span>
          </p>
        ) : null}

        <CouponField
          applied={q?.coupon}
          code={p.couponCode}
          onApply={(c) => p.onCoupon(c)}
          onRemove={() => p.onCoupon(undefined)}
          error={p.couponError ?? couponIssue?.message ?? null}
          warning={couponWarning?.message ?? null}
          checking={!!p.couponCode && p.updating && !q?.coupon}
        />

        {q ? (
          <div className={cn('transition-opacity', p.updating && 'opacity-60')} aria-busy={p.updating}>
            <TotalsBlock totals={q.totals} customerType={q.customerType} fulfillment={p.fulfillment} couponCode={q.coupon?.code} zoneName={q.zone?.name} />
          </div>
        ) : (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="mt-3 h-7 w-full" />
          </div>
        )}

        {q && p.fulfillment === 'delivery' && q.missingForFreeDelivery > 0 && freeFrom > 0 ? (
          <div className="rounded-xl bg-slate-50 px-3.5 py-3">
            <p className="text-[13px] text-slate-600">
              Noch <span className="font-semibold text-slate-900">{formatEuro(q.missingForFreeDelivery)}</span> bis zur kostenlosen Lieferung
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div className="h-full rounded-full bg-accent-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {q && q.customerType === 'b2c' && q.loyaltyPointsEarned > 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm text-accent-900 ring-1 ring-inset ring-accent-200/70">
            <Gift size={16} aria-hidden className="shrink-0 text-accent-600" />
            <span>
              Sie sammeln <strong className="font-semibold">+{q.loyaltyPointsEarned} Treuepunkte</strong>
              <span className="text-accent-800/80"> (Stand: {p.customer.loyaltyPoints.toLocaleString('de-DE')})</span>
            </span>
          </p>
        ) : null}

        {errors.length ? (
          <Notice tone="danger" title={errors.length === 1 ? 'Bitte prüfen Sie Ihre Bestellung' : `Bitte prüfen Sie ${errors.length} Punkte`}>
            <ul className={cn(errors.length > 1 && 'list-disc space-y-1 pl-4')}>
              {errors.map((e, i) => (
                <li key={`${e.code}-${i}`}>{e.message}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {warnings.length ? (
          <Notice tone="warning" icon={AlertTriangle}>
            <ul className={cn(warnings.length > 1 && 'list-disc space-y-1 pl-4')}>
              {warnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{w.message}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {p.extra}

        <div id="kasse-agb" className="scroll-mt-40">
          <Checkbox
            checked={p.terms}
            onChange={(e) => p.onTerms(e.target.checked)}
            label={
              <span className="font-normal text-slate-700">
                Ich akzeptiere die{' '}
                <Link to="/impressum" target="_blank" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                  AGB
                </Link>{' '}
                und habe die{' '}
                <Link to="/impressum" target="_blank" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                  Widerrufsbelehrung
                </Link>{' '}
                sowie die{' '}
                <Link to="/datenschutz" target="_blank" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                  Datenschutzhinweise
                </Link>{' '}
                zur Kenntnis genommen.
              </span>
            }
            aria-invalid={p.termsError ? true : undefined}
          />
          {p.termsError ? (
            <p className="ml-8 text-sm font-medium text-red-600" role="alert">
              {p.termsError}
            </p>
          ) : null}
        </div>

        {p.placeError ? (
          <Notice tone="danger" title="Die Bestellung konnte nicht abgeschlossen werden">
            {p.placeError}
          </Notice>
        ) : null}

        <Button ref={buttonRef} size="lg" block icon={Lock} loading={p.placing} onClick={p.onPlace} className="h-13">
          Zahlungspflichtig bestellen
        </Button>
        <p className="text-center text-xs leading-relaxed text-slate-500">
          {q ? (
            <>
              Gesamtbetrag <span className="font-semibold tabular-nums text-slate-700">{formatEuro(q.totals.total)}</span>
              {p.fulfillment === 'delivery' ? ' · Leergut-Gutschrift wird bei Lieferung verrechnet' : ' · Leergut-Gutschrift bei Abholung'}
            </>
          ) : (
            'Preise werden berechnet …'
          )}
        </p>
      </div>
    </section>
  );
});
