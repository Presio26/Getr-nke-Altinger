import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgePercent, Clock, Info, ShoppingCart, Sparkles, Tag, TimerReset } from 'lucide-react';
import type { Product } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { todayString } from '@shared/time';
import { useCategories, useMyCustomer, useProducts, usePrice } from '@/api/hooks';
import { useCart, useCartQty } from '@/stores/cart';
import { ProductImage, productTint } from '@/components/product';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, QuantityStepper, Skeleton, toast } from '@/components/ui';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { CategoryIcon } from './components/CategoryIcon';
import { hasActiveOffer, offerDaysLeft, offerRemainingText } from './components/offers';

function savingsPct(p: Product): number {
  return p.offer ? (p.priceGross - p.offer.priceGross) / p.priceGross : 0;
}

/** Angebotskarte: Ersparnis, Gültigkeit und Warenkorb-Steuerung */
function OfferCard({ product, today }: { product: Product; today: string }) {
  const price = usePrice(product, 1);
  const qty = useCartQty(product.id);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const href = `/produkt/${product.id}`;
  const label = `${product.brand} ${product.name}`;
  const saving = Math.max(0, price.displayRegular - price.displayUnit);
  const pct = price.displayRegular > 0 ? Math.round((saving / price.displayRegular) * 100) : 0;
  const validUntil = product.offer?.validUntil ?? today;
  const daysLeft = offerDaysLeft(validUntil, today);
  const soldOut = product.stock <= 0;

  const onAdd = () => {
    add(product.id, 1);
    toast.success('In den Warenkorb gelegt', { id: 'cart-add', description: label, href: '/warenkorb', actionLabel: 'Zum Warenkorb', duration: 2600 });
  };

  return (
    <Card padding="none" className="flex h-full gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4">
      <Link to={href} aria-label={label} tabIndex={-1} className="relative aspect-[4/5] w-[7.5rem] shrink-0 self-start overflow-hidden rounded-xl sm:aspect-auto sm:w-40 sm:self-stretch" style={{ background: productTint(product, 0.1) }}>
        <ProductImage product={product} className="absolute inset-0 p-2 sm:p-3" />
        {pct > 0 ? (
          <span className="absolute left-1.5 top-1.5 flex h-12 w-12 -rotate-6 flex-col items-center justify-center rounded-full bg-accent-500 text-brand-950 shadow-sm ring-2 ring-white sm:h-14 sm:w-14">
            <span className="text-[15px] font-extrabold leading-none tabular-nums sm:text-base">−{pct}%</span>
          </span>
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent" icon={Tag}>
            {product.offer?.label ?? 'Angebot'}
          </Badge>
          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', daysLeft <= 1 ? 'text-red-600' : 'text-slate-500')}>
            <Clock size={13} aria-hidden /> {offerRemainingText(validUntil, today)}
          </span>
        </div>
        <p className="mt-2 truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{product.brand}</p>
        <Link to={href} className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 hover:text-brand-700">
          {product.name}
        </Link>
        <p className="truncate text-[13px] text-slate-500">{product.packaging}</p>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className={cn('text-xl font-bold tracking-tight tabular-nums', price.isOffer ? 'text-red-600' : 'text-brand-700')}>{formatEuro(price.displayUnit)}</span>
          {saving > 0 ? (
            <s className="text-sm tabular-nums text-slate-400">
              <span className="sr-only">statt </span>
              {formatEuro(price.displayRegular)}
            </s>
          ) : null}
          {price.showNet ? <span className="text-xs font-semibold uppercase text-slate-500">netto</span> : null}
        </div>
        {saving > 0 ? <p className="text-[13px] font-semibold text-emerald-700">Sie sparen {formatEuro(saving)}</p> : null}
        <p className="text-xs text-slate-500">
          {price.depositUnit > 0 ? `zzgl. ${formatEuro(price.depositUnit)} Pfand` : 'pfandfrei'}
          {price.basePriceText ? ` · ${price.basePriceText}` : ''}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">gültig bis {formatDate(validUntil, 'medium')}</p>

        <div className="mt-auto pt-3">
          {soldOut ? (
            <Button variant="outline" size="sm" disabled block>
              Ausverkauft
            </Button>
          ) : qty > 0 ? (
            <QuantityStepper value={qty} onChange={(n) => setQty(product.id, n)} size="sm" removeAtMin label={label} />
          ) : (
            <Button size="sm" icon={ShoppingCart} onClick={onAdd} aria-label={`${label} in den Warenkorb`}>
              In den Warenkorb
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function OffersPage() {
  const { data: products, isLoading, isError, error, refetch } = useProducts();
  const { data: customer } = useMyCustomer();
  const categories = useCategories();
  const now = useNow(60_000);
  const today = todayString(now);
  const [cat, setCat] = useState<string>('alle');

  const offers = useMemo(
    () => (products ?? []).filter((p) => hasActiveOffer(p, today)).sort((a, b) => savingsPct(b) - savingsPct(a) || a.name.localeCompare(b.name, 'de')),
    [products, today],
  );
  const offerCats = categories.filter((c) => offers.some((o) => o.categoryId === c.id)).sort((a, b) => a.sort - b.sort);
  const shown = cat === 'alle' ? offers : offers.filter((o) => o.categoryId === cat);
  const maxPct = offers.length ? Math.round(Math.max(...offers.map(savingsPct)) * 100) : 0;
  const lastDay = offers.reduce<string | null>((max, o) => (o.offer && (!max || o.offer.validUntil > max) ? o.offer.validUntil : max), null);
  const firstEnd = offers.reduce<string | null>((min, o) => (o.offer && (!min || o.offer.validUntil < min) ? o.offer.validUntil : min), null);
  const isB2B = customer?.type === 'b2b';

  return (
    <>
      <PageHeader
        title="Angebote der Woche"
        icon={BadgePercent}
        subtitle={lastDay ? `Gültig bis ${formatDate(lastDay, 'long')} – nur solange der Vorrat reicht.` : 'Jede Woche neue Aktionen aus unserem Sortiment.'}
      />

      {isError ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent-400 via-accent-500 to-accent-600 p-5 text-brand-950 shadow-card sm:p-7">
            <Sparkles aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white/25" />
            <div className="relative grid grid-cols-3 gap-3 sm:gap-6">
              <Stat label="Artikel" value={isLoading ? '…' : String(offers.length)} />
              <Stat label="Ersparnis" value={isLoading ? '…' : `bis zu ${maxPct} %`} />
              <Stat label="Aktionsende" value={isLoading ? '…' : firstEnd ? `${offerRemainingText(firstEnd, today)}` : '—'} icon={TimerReset} />
            </div>
          </div>

          {isB2B ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
              <Info size={17} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
              Als Geschäftskunde sehen Sie Nettopreise. Es gilt automatisch der günstigste Preis aus Angebot, Kundenrabatt und Staffel.
            </p>
          ) : null}

          {offerCats.length > 1 ? (
            <div className="-mx-4 mt-6 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0" role="group" aria-label="Nach Kategorie filtern">
              <div className="flex gap-2">
                <FilterChip active={cat === 'alle'} onClick={() => setCat('alle')} label={`Alle (${offers.length})`} />
                {offerCats.map((c) => (
                  <FilterChip
                    key={c.id}
                    active={cat === c.id}
                    onClick={() => setCat(c.id)}
                    label={`${c.name} (${offers.filter((o) => o.categoryId === c.id).length})`}
                    icon={c.icon}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            {isLoading ? (
              <ul className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-52 w-full rounded-2xl" />
                  </li>
                ))}
              </ul>
            ) : !offers.length ? (
              <Card>
                <EmptyState
                  icon={BadgePercent}
                  title="Gerade keine Angebote"
                  description="Unsere neuen Wochenangebote sind gleich wieder da. Stöbern Sie solange im Sortiment."
                  action={<ButtonLink to="/sortiment">Zum Sortiment</ButtonLink>}
                />
              </Card>
            ) : (
              <ul className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shown.map((p) => (
                  <li key={p.id}>
                    <OfferCard product={p} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-8 text-center text-sm text-slate-500">
            Alle Preise inkl. MwSt. zzgl. Pfand. Abgabe nur in haushaltsüblichen Mengen.{' '}
            <Link to="/sortiment" className="font-semibold text-brand-700 hover:text-brand-800">
              Gesamtes Sortiment ansehen
            </Link>
          </p>
        </>
      )}
    </>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Clock }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-950/70 sm:text-xs sm:tracking-[0.14em]">
        {Icon ? <Icon size={14} aria-hidden className="hidden sm:block" /> : null}
        {label}
      </p>
      <p className="mt-1 text-base font-extrabold leading-tight tracking-tight tabular-nums sm:text-3xl">{value}</p>
    </div>
  );
}

function FilterChip({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors',
        active ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
      )}
    >
      {icon ? <CategoryIcon name={icon} size={16} /> : null}
      {label}
    </button>
  );
}
