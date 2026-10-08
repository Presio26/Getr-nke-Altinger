import { useMemo } from 'react';
import { CalendarDays, CalendarCheck, CheckCircle2, Plus, ShoppingCart } from 'lucide-react';
import type { Product } from '@shared/types';
import type { RentalAvailability } from '@shared/api';
import { formatDate, formatEuro } from '@shared/format';
import { addDays, todayString } from '@shared/time';
import { usePrice, useProducts } from '@/api/hooks';
import { useCart, useCartQty } from '@/stores/cart';
import { ProductImage, productTint } from '@/components/product';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, Input, Notice, QuantityStepper, Skeleton, toast } from '@/components/ui';
import { isValidEventDate, useRentalAvailability } from '../lib/useRentalAvailability';

function AvailabilityBadge({ info, valid, failed }: { info?: RentalAvailability; valid: boolean; failed?: boolean }) {
  if (!valid) return <Badge tone="neutral">Datum wählen</Badge>;
  if (!info) return <Badge tone="neutral">{failed ? 'auf Anfrage' : 'wird geprüft …'}</Badge>;
  if (info.available <= 0) return <Badge tone="danger">ausgebucht</Badge>;
  if (info.available <= Math.max(1, Math.floor(info.total * 0.25))) return <Badge tone="warning">nur noch {info.available} frei</Badge>;
  return (
    <Badge tone="success" icon={CheckCircle2}>
      {info.available} von {info.total} frei
    </Badge>
  );
}

function RentalCard({ product, info, eventDate, valid, failed }: { product: Product; info?: RentalAvailability; eventDate: string; valid: boolean; failed?: boolean }) {
  const price = usePrice(product);
  const qty = useCartQty(product.id);
  const setQty = useCart((s) => s.setQty);
  const available = info?.available ?? 0;
  const soldOut = valid && !!info && available <= 0;

  const ensureDate = () => {
    const cart = useCart.getState();
    if (cart.eventDate !== eventDate) cart.set({ eventDate });
  };

  const add = () => {
    if (!valid) {
      toast.error('Bitte wählen Sie zuerst das Datum Ihres Festes.');
      document.getElementById('rental-date')?.focus();
      return;
    }
    ensureDate();
    useCart.getState().add(product.id, 1);
    toast.success('Für Ihr Fest vorgemerkt', {
      id: 'rental-add',
      description: `${product.name} · ${formatDate(eventDate, 'medium')}`,
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
      duration: 2600,
    });
  };

  return (
    <Card padding="none" className="flex overflow-hidden sm:flex-col">
      <div className="relative w-28 shrink-0 overflow-hidden sm:aspect-[16/10] sm:w-auto" style={{ background: productTint(product, 0.1) }}>
        <ProductImage product={product} className="absolute inset-0 p-2 sm:p-4" />
        <span className="absolute left-3 top-3 hidden sm:block">
          <AvailabilityBadge info={info} valid={valid} failed={failed} />
        </span>
        {soldOut ? <span className="absolute inset-0 bg-white/50" aria-hidden /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
        <span className="mb-1 sm:hidden">
          <AvailabilityBadge info={info} valid={valid} failed={failed} />
        </span>
        <h3 className="text-[15px] font-semibold leading-snug text-slate-900">{product.name}</h3>
        <p className="mt-0.5 text-[13px] text-slate-500">{product.packaging}</p>
        <p className="mt-2 hidden text-sm leading-relaxed text-slate-600 sm:line-clamp-3">{product.description}</p>
        <div className="flex-1" />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-2 sm:mt-4 sm:gap-3">
          <div>
            <p className="text-lg font-bold tabular-nums text-slate-900 sm:text-xl">{formatEuro(price.displayUnit)}</p>
            <p className="text-xs text-slate-500">pro Fest{price.showNet ? ', netto' : ', inkl. MwSt.'}</p>
          </div>
          {qty > 0 ? (
            <QuantityStepper
              value={qty}
              onChange={(n) => {
                ensureDate();
                setQty(product.id, n);
              }}
              min={0}
              max={valid && info ? Math.max(qty, available) : 999}
              size="sm"
              removeAtMin
              label={product.name}
            />
          ) : (
            <Button size="sm" icon={soldOut ? undefined : Plus} onClick={add} disabled={soldOut} aria-label={`${product.name} hinzufügen`}>
              {soldOut ? 'Ausgebucht' : 'Hinzufügen'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export interface RentalCatalogProps {
  eventDate: string;
  onEventDateChange: (date: string) => void;
}

/** Leihartikel mit Verfügbarkeit am Fest-Datum */
export function RentalCatalog({ eventDate, onEventDateChange }: RentalCatalogProps) {
  const products = useProducts();
  const availability = useRentalAvailability(eventDate);
  const cartDate = useCart((s) => s.eventDate);
  const cartItems = useCart((s) => s.items);
  const tomorrow = addDays(todayString(), 1);
  const valid = isValidEventDate(eventDate);

  const rentals = useMemo(() => (products.data ?? []).filter((p) => p.isRental && p.active).sort((a, b) => b.stock - a.stock || a.priceGross - b.priceGross), [products.data]);
  const rentalCount = cartItems.filter((i) => rentals.some((r) => r.id === i.productId)).reduce((s, i) => s + i.qty, 0);
  const freeTotal = rentals.reduce((s, p) => s + (availability.map.get(p.id)?.available ?? 0), 0);

  return (
    <div>
      <Card padding="md" className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end">
        <Input
          id="rental-date"
          type="date"
          label="Datum Ihres Festes"
          icon={CalendarDays}
          min={tomorrow}
          value={eventDate}
          onChange={(e) => onEventDateChange(e.target.value)}
          error={eventDate && !valid ? 'Bitte ein Datum ab morgen wählen.' : undefined}
          containerClassName="sm:w-72"
        />
        <div className="min-w-0 flex-1 sm:pb-2.5">
          {valid ? (
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <CalendarCheck size={18} aria-hidden className="mt-px shrink-0 text-emerald-600" />
              <span>
                Verfügbarkeit am <strong className="text-slate-900">{formatDate(eventDate, 'long')}</strong>
                {availability.data ? ` – ${freeTotal} Leihartikel frei.` : ' wird geprüft …'} Abholung am Vortag, Rückgabe am Tag danach.
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Wählen Sie das Datum, um die Verfügbarkeit zu sehen.</p>
          )}
        </div>
        {rentalCount ? (
          <ButtonLink to="/warenkorb" variant="secondary" icon={ShoppingCart} className="shrink-0">
            {rentalCount} im Warenkorb
          </ButtonLink>
        ) : null}
      </Card>

      {cartDate && valid && cartDate !== eventDate && rentalCount > 0 ? (
        <Notice
          tone="warning"
          className="mb-5"
          title={`Ihr Warenkorb ist für den ${formatDate(cartDate, 'short')} vorgemerkt`}
          action={
            <Button size="sm" variant="outline" onClick={() => useCart.getState().set({ eventDate })}>
              Auf {formatDate(eventDate, 'medium')} ändern
            </Button>
          }
        >
          Alle Leihartikel einer Bestellung gelten für ein Fest-Datum.
        </Notice>
      ) : null}

      {products.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : !rentals.length ? (
        <EmptyState title="Derzeit keine Leihartikel" description="Bitte fragen Sie im Markt nach – wir helfen gerne weiter." />
      ) : (
        <>
          {availability.isError ? (
            <Notice
              tone="warning"
              className="mb-4"
              action={
                <Button size="sm" variant="outline" onClick={() => void availability.refetch()}>
                  Erneut prüfen
                </Button>
              }
            >
              Die Verfügbarkeit konnte gerade nicht geprüft werden. Sie können trotzdem vormerken – wir bestätigen die Reservierung mit Ihrer Bestellung.
            </Notice>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rentals.map((p) => (
              <RentalCard key={p.id} product={p} info={availability.map.get(p.id)} eventDate={eventDate} valid={valid} failed={availability.isError} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
