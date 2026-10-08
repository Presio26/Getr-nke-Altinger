import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  PackageX,
  PartyPopper,
  Recycle,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  Star,
  Truck,
  XCircle,
} from 'lucide-react';
import type { Customer, DepositType, Product } from '@shared/types';
import { ApiError } from '@shared/api';
import { formatEuro, formatLiters, formatNumber, formatSlot, productLiters } from '@shared/format';
import {
  computePrice,
  useCategories,
  useDepositTypes,
  useMyCustomer,
  useProduct,
  useProducts,
  useSettings,
  useSlots,
  usePrice,
} from '@/api/hooks';
import { useCart, useCartQty } from '@/stores/cart';
import { useSession } from '@/stores/session';
import { FavoriteButton, PriceDisplay, ProductBadges, ProductImage, productTint } from '@/components/product';
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, KeyValue, Notice, QuantityStepper, Section, Skeleton, toast } from '@/components/ui';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { CATEGORY_AFFINITY, MATERIAL_LABEL, PACK_LABEL, isAlcoholFree, packKind, popularity } from './components/catalog';
import { ProductRail } from './components/ProductRail';

// ───────────────────────────── Hilfen ─────────────────────────────

function Rating({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Kundenbewertung ${formatNumber(value)} von 5 Sternen`}>
      <span className="flex" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={16} className={i < full ? 'fill-accent-400 text-accent-500' : 'fill-slate-200 text-slate-300'} />
        ))}
      </span>
      <span className="text-sm font-semibold tabular-nums text-slate-700">{formatNumber(value)}</span>
    </span>
  );
}

function Availability({ product }: { product: Product }) {
  if (product.isRental) {
    return (
      <p className="flex items-center gap-2 text-[15px] font-medium text-slate-700">
        <CalendarDays size={18} aria-hidden className="shrink-0 text-brand-600" />
        {product.stock} Stück im Verleih-Bestand · Verfügbarkeit je Termin
      </p>
    );
  }
  if (product.stock <= 0) {
    return (
      <p className="flex items-center gap-2 text-[15px] font-semibold text-red-700">
        <XCircle size={18} aria-hidden className="shrink-0" /> Derzeit ausverkauft – bald wieder da
      </p>
    );
  }
  const low = product.stock <= product.minStock;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold', low ? 'text-amber-700' : 'text-emerald-700')}>
      {low ? <AlertTriangle size={18} aria-hidden className="shrink-0" /> : <CheckCircle2 size={18} aria-hidden className="shrink-0" />}
      {low ? `Nur noch ${product.stock} vorrätig` : 'Im Markt vorrätig'}
      {product.location ? <span className="font-medium text-slate-500">· {product.location}</span> : null}
    </p>
  );
}

/** Staffelpreis-Tabelle für Geschäftskunden (günstigster Preis aus Rabatt/Staffel/Angebot je Menge) */
function TierTable({ product, customer, qty, depositTypes, onPick }: { product: Product; customer: Customer; qty: number; depositTypes: DepositType[]; onPick: (n: number) => void }) {
  const tiers = [...(product.tierPrices ?? [])].sort((a, b) => a.minQty - b.minQty);
  const steps = [1, ...tiers.map((t) => t.minQty).filter((n) => n > 1)];
  const raw = steps.map((from) => {
    const p = computePrice(product, customer, from, depositTypes);
    return { from, price: p.displayUnit, note: p.note };
  });
  // aufeinanderfolgende Stufen mit gleichem Preis zusammenfassen (z. B. wenn der Kundenrabatt günstiger ist)
  const merged = raw.filter((r, i) => i === 0 || r.price !== raw[i - 1].price);
  const rows = merged.map((r, i) => ({ ...r, to: merged[i + 1] ? merged[i + 1].from - 1 : undefined }));
  const activeIdx = rows.reduce((acc, r, i) => (qty >= r.from ? i : acc), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <caption className="bg-slate-50 px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Staffelpreise (netto je Gebinde)</caption>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.from} className={cn(i === activeIdx && 'bg-brand-50/70')}>
              <td className="px-3 py-2 text-slate-600">
                <button type="button" onClick={() => onPick(r.from)} className="text-left hover:text-brand-700 hover:underline">
                  {r.to ? `${r.from}–${r.to} Stück` : `ab ${r.from} Stück`}
                </button>
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">{r.note ?? 'Listenpreis'}</td>
              <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', i === activeIdx ? 'text-brand-800' : 'text-slate-900')}>{formatEuro(r.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NextSlots() {
  const delivery = useSlots({ type: 'delivery', days: 4 });
  const pickup = useSlots({ type: 'pickup', days: 4 });
  const nextDelivery = delivery.data?.find((s) => s.available);
  const nextPickup = pickup.data?.find((s) => s.available);
  const settings = useSettings();
  const home = settings.zones.find((z) => z.zips.includes(settings.zip));
  const row = (icon: typeof Truck, title: string, text: ReactNode) => {
    const I = icon;
    return (
      <li className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <I size={18} aria-hidden />
        </span>
        <span className="min-w-0 text-sm leading-snug">
          <span className="block font-semibold text-slate-900">{title}</span>
          <span className="text-slate-500">{text}</span>
        </span>
      </li>
    );
  };
  const loading = delivery.isLoading || pickup.isLoading;
  return (
    <ul className="space-y-3">
      {row(
        Truck,
        'Lieferung',
        loading ? (
          <Skeleton className="mt-1 h-3.5 w-40" />
        ) : nextDelivery ? (
          <>
            nächstes Zeitfenster {formatSlot(nextDelivery)}
            {home && home.fee === 0 ? ` · in ${home.name.split(' ')[0]} kostenlos` : ''}
          </>
        ) : (
          'Zeitfenster wählen Sie an der Kasse'
        ),
      )}
      {row(
        ShoppingBag,
        'Click & Collect',
        loading ? <Skeleton className="mt-1 h-3.5 w-40" /> : nextPickup ? <>abholbereit {formatSlot(nextPickup)}</> : 'Abholung zu den Öffnungszeiten',
      )}
      {row(Recycle, 'Leergut', 'Leere Kästen nimmt der Fahrer gleich mit – Pfand wird gutgeschrieben.')}
    </ul>
  );
}

function related(product: Product, all: Product[]): { matching: Product[]; similar: Product[] } {
  const pool = all.filter((p) => p.active && p.id !== product.id);
  const similar = pool
    .filter((p) => p.categoryId === product.categoryId)
    .map((p) => {
      let score = popularity(p) / 20;
      if (p.material === product.material) score += 2;
      if (p.unitCount === product.unitCount) score += 2;
      if (p.brand !== product.brand) score += 1; // Alternativen anderer Marken bevorzugen
      score -= Math.abs(p.priceGross - product.priceGross) / Math.max(500, product.priceGross);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
    .slice(0, 10);
  const cats = CATEGORY_AFFINITY[product.categoryId] ?? [];
  const seen = new Set(similar.slice(0, 4).map((p) => p.id));
  const matching: Product[] = [];
  // gleiche Marke in anderer Kategorie (z. B. Fass zum Kasten, Alkoholfreies zum Weißbier)
  for (const p of pool) if (p.brand === product.brand && p.categoryId !== product.categoryId && !p.isRental) matching.push(p);
  for (const c of cats) {
    const best = pool
      .filter((p) => p.categoryId === c && !matching.includes(p) && !seen.has(p.id))
      .sort((a, b) => popularity(b) - popularity(a))
      .slice(0, 3);
    matching.push(...best);
  }
  return { matching: matching.slice(0, 10), similar };
}

// ───────────────────────────── Seite ─────────────────────────────

export default function ProductPage() {
  const { productId } = useParams();
  const list = useProducts();
  // Unbekannte Artikel direkt an der Sortimentsliste erkennen (kein fehlschlagender Serveraufruf)
  const missing = !!list.data && !!productId && !list.data.some((p) => p.id === productId);
  // auf die Liste nur beim ersten Versuch warten – schlägt sie fehl, den Artikel direkt laden
  const waitForList = list.isLoading && list.failureCount === 0;
  const { data: product, isLoading, isError, error, refetch } = useProduct(waitForList || missing ? null : productId);
  useDocumentTitle(product ? `${product.brand} ${product.name}` : missing ? 'Artikel nicht gefunden' : 'Artikel');

  if ((waitForList || isLoading) && !product) return <ProductSkeleton />;
  if ((isError || missing) && !product) {
    const notFound = missing || (error instanceof ApiError && error.code === 'not_found');
    return (
      <Card className="mx-auto mt-4 max-w-2xl">
        {notFound ? (
          <EmptyState
            icon={PackageX}
            title="Diesen Artikel gibt es nicht (mehr)"
            description="Vielleicht wurde er aus dem Sortiment genommen. Stöbern Sie in unserem Sortiment oder nutzen Sie die Suche."
            action={
              <>
                <ButtonLink to="/sortiment">Zum Sortiment</ButtonLink>
                <ButtonLink to="/angebote" variant="outline">
                  Angebote ansehen
                </ButtonLink>
              </>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}
      </Card>
    );
  }
  if (!product) return null;
  return <ProductView key={product.id} product={product} />;
}

function ProductView({ product }: { product: Product }) {
  const categories = useCategories();
  const depositTypes = useDepositTypes();
  const { data: customer } = useMyCustomer();
  const { data: products } = useProducts();
  const role = useSession((s) => s.user?.role ?? null);
  const inCart = useCartQty(product.id);
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(1), [product.id]);

  const price = usePrice(product, qty);
  const category = categories.find((c) => c.id === product.categoryId);
  const deposit = product.depositTypeId ? depositTypes.find((d) => d.id === product.depositTypeId) : undefined;
  const kind = packKind(product, depositTypes);
  const liters = productLiters(product);
  const rental = !!product.isRental;
  const soldOut = !product.active || (!rental && product.stock <= 0);
  const maxQty = rental ? Math.max(1, product.stock) : 999;
  const isB2B = price.showNet && !!customer;
  // nächste Staffel, die wirklich günstiger ist als der aktuelle Preis (Kundenrabatt kann besser sein als kleine Staffeln)
  const nextTier = useMemo(() => {
    if (!isB2B || !customer) return undefined;
    return [...(product.tierPrices ?? [])]
      .filter((t) => t.minQty > qty)
      .sort((a, b) => a.minQty - b.minQty)
      .map((t) => ({ minQty: t.minQty, priceNet: computePrice(product, customer, t.minQty, depositTypes).displayUnit }))
      .find((t) => t.priceNet < price.displayUnit);
  }, [isB2B, customer, product, qty, depositTypes, price.displayUnit]);
  const lineTotal = price.displayUnit * qty;
  const staff = role === 'admin' || role === 'driver';

  const { matching, similar } = useMemo(() => related(product, products ?? []), [product, products]);

  const addToCart = () => {
    add(product.id, qty);
    toast.success(`${qty} × in den Warenkorb gelegt`, {
      id: 'cart-add',
      description: `${product.brand} ${product.name}`,
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
      duration: 2800,
    });
    setQty(1);
  };

  const details: [ReactNode, ReactNode][] = [
    ['Artikelnummer', <span className="tabular-nums">{product.sku}</span>],
    ['Gebinde', `${product.packaging} · ${PACK_LABEL[kind]}`],
  ];
  if (liters > 0) {
    details.push([
      'Inhalt gesamt',
      product.unitCount > 1 ? `${product.unitCount} × ${formatLiters(product.unitVolumeL)} = ${formatLiters(liters)}` : formatLiters(liters),
    ]);
  }
  details.push(['Material', `${MATERIAL_LABEL[product.material]}${deposit ? (deposit.returnable || /Mehrweg/i.test(deposit.name) ? ' · Mehrweg' : ' · Einweg') : ''}`]);
  if (!rental && product.material !== 'sonstiges') {
    details.push(['Alkoholgehalt', product.alcoholPercent !== undefined && product.alcoholPercent > 0 ? `${formatNumber(product.alcoholPercent)} % vol` : 'alkoholfrei']);
  }
  if (product.origin) details.push(['Herkunft', product.origin]);
  if (!rental) details.push(['Pfandart', deposit ? `${deposit.name} · ${formatEuro(deposit.amount)}` : 'pfandfrei']);
  details.push(['MwSt.', `${product.vatRate} %`]);
  if (product.ean) details.push(['EAN', <span className="tabular-nums">{product.ean}</span>]);
  if (product.location) details.push(['Im Markt', product.location]);

  const ageLimit = !rental && !isAlcoholFree(product) && (product.alcoholPercent ?? 0) > 0.5 ? (product.categoryId === 'spirituosen' ? 18 : 16) : null;

  return (
    <>
      <nav aria-label="Brotkrumen" className="mb-3 flex min-w-0 items-center gap-1 text-sm text-slate-500 sm:mb-5">
        <Link to="/sortiment" className="shrink-0 hover:text-slate-800">
          Sortiment
        </Link>
        {category ? (
          <>
            <ChevronRight size={14} aria-hidden className="shrink-0" />
            <Link to={`/sortiment/${category.id}`} className="shrink-0 hover:text-slate-800">
              {category.name}
            </Link>
          </>
        ) : null}
        <ChevronRight size={14} aria-hidden className="hidden shrink-0 sm:block" />
        <span className="hidden truncate font-medium text-slate-800 sm:block">
          {product.brand} {product.name}
        </span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 xl:gap-14">
        {/* Bild */}
        <div className="lg:sticky lg:top-[8.75rem] lg:self-start">
          <div className="relative overflow-hidden rounded-3xl ring-1 ring-slate-900/5" style={{ background: productTint(product, 0.12) }}>
            <div className="mx-auto aspect-[16/11] max-h-[16rem] w-full sm:aspect-[4/3] sm:max-h-none lg:aspect-square">
              <ProductImage product={product} className="h-full w-full p-4 sm:p-10" />
            </div>
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 sm:left-4 sm:top-4">
              <ProductBadges product={product} isOffer={price.isOffer} max={4} />
            </div>
            <FavoriteButton product={product} className="absolute right-3 top-3 h-11 w-11 sm:right-4 sm:top-4" />
            {soldOut ? (
              <span className="absolute inset-x-0 bottom-0 bg-slate-900/75 py-2 text-center text-sm font-semibold text-white">
                {product.active ? 'Derzeit ausverkauft' : 'Nicht mehr im Sortiment'}
              </span>
            ) : null}
          </div>
        </div>

        {/* Kaufbereich */}
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-brand-700">{product.brand}</p>
          <h1 className="mt-1 text-[1.65rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-[2.1rem]">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px] text-slate-500">
            <span>{product.packaging}</span>
            {product.rating ? <Rating value={product.rating} /> : null}
            {product.origin ? <span>aus {product.origin}</span> : null}
          </div>

          <Card className="mt-5" padding="lg">
            <PriceDisplay product={product} qty={qty} size="lg" />
            {isB2B && customer ? (
              <div className="mt-4">
                {product.tierPrices?.length ? (
                  <TierTable product={product} customer={customer} qty={qty} depositTypes={depositTypes} onPick={(n) => setQty(Math.min(maxQty, n))} />
                ) : price.note ? (
                  <p className="text-sm text-brand-700">{price.note} – bereits berücksichtigt.</p>
                ) : null}
                {nextTier ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent-50 px-3 py-2.5 text-sm text-accent-900 ring-1 ring-inset ring-accent-200">
                    <span>
                      Ab <strong>{nextTier.minQty} Stück</strong> nur {formatEuro(nextTier.priceNet)} netto – noch {nextTier.minQty - qty} mehr.
                    </span>
                    <button type="button" onClick={() => setQty(Math.min(maxQty, nextTier.minQty))} className="min-h-9 font-semibold text-accent-900 underline underline-offset-2">
                      Auf {nextTier.minQty} erhöhen
                    </button>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">Es gilt immer der günstigste Preis aus Ihrem Kundenrabatt, Staffel- und Angebotspreis.</p>
              </div>
            ) : null}

            {rental ? (
              <Notice tone="brand" icon={PartyPopper} className="mt-4" title="Leihartikel für Ihre Veranstaltung">
                Der Preis gilt pro Veranstaltung (Abholung am Vortag, Rückgabe am Folgetag). Das Datum Ihres Festes geben Sie an der Kasse an.{' '}
                <Link to="/fest" className="font-semibold underline underline-offset-2">
                  Verfügbarkeit im Festservice prüfen
                </Link>
              </Notice>
            ) : null}

            <div className="mt-5 border-t border-slate-100 pt-5">
              {soldOut ? (
                <Button variant="outline" size="lg" block disabled icon={XCircle}>
                  {product.active ? 'Derzeit ausverkauft' : 'Nicht mehr erhältlich'}
                </Button>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <QuantityStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} min={1} max={maxQty} size="lg" label={`${product.brand} ${product.name}`} className="justify-between sm:w-auto" />
                  <Button size="lg" icon={ShoppingCart} onClick={addToCart} className="w-full sm:w-auto sm:flex-1">
                    {rental ? 'Vormerken' : 'In den Warenkorb'}
                  </Button>
                </div>
              )}
              {!soldOut ? (
                <p className="mt-3 text-sm text-slate-500">
                  {qty} × {formatEuro(price.displayUnit)} = <span className="font-semibold text-slate-800">{formatEuro(lineTotal)}</span>
                  {isB2B ? ' netto' : ''}
                  {price.depositUnit > 0 ? ` zzgl. ${formatEuro(price.depositUnit * qty)} Pfand` : ''}
                </p>
              ) : null}
              {inCart > 0 ? (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
                  <CheckCircle2 size={16} aria-hidden className="text-emerald-600" />
                  Bereits {inCart} im Warenkorb
                  <Link to="/warenkorb" className="ml-auto font-semibold text-emerald-800 underline underline-offset-2">
                    Zum Warenkorb
                  </Link>
                </p>
              ) : null}
              {staff ? <p className="mt-3 text-xs text-slate-500">Hinweis: Mit einem Mitarbeiterkonto können Sie nicht bestellen.</p> : null}
            </div>
            <div className="mt-5">
              <Availability product={product} />
            </div>
          </Card>

          <Card className="mt-4" padding="md">
            <NextSlots />
          </Card>

          {ageLimit ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-slate-500">
              <ShieldAlert size={17} aria-hidden className="mt-0.5 shrink-0 text-slate-400" />
              Abgabe nur an Personen ab {ageLimit} Jahren (Jugendschutzgesetz). Bei Lieferung kann der Fahrer einen Ausweis verlangen.
            </p>
          ) : null}
        </div>
      </div>

      {/* Details & Beschreibung */}
      <div className="mt-8 grid gap-4 lg:mt-12 lg:grid-cols-2 lg:gap-6">
        <Card padding="lg">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            <Info size={19} aria-hidden className="text-brand-600" /> Produktdetails
          </h2>
          <KeyValue items={details} />
        </Card>
        <Card padding="lg">
          <h2 className="mb-3 text-lg font-bold tracking-tight text-slate-900">Beschreibung</h2>
          <p className="text-[15px] leading-relaxed text-slate-600">{product.description}</p>
          {product.tags.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {product.tags
                .filter((t) => t !== 'bestseller')
                .map((t) => (
                  <Badge key={t} tone="neutral">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Badge>
                ))}
              {product.tags.includes('bestseller') ? <Badge tone="accent">Bestseller</Badge> : null}
            </div>
          ) : null}
          {deposit && !rental ? (
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
              <Recycle size={17} aria-hidden className="mt-0.5 shrink-0 text-emerald-600" />
              <span>
                Pfand je Gebinde: {formatEuro(deposit.amount)} – {deposit.name}.{' '}
                {deposit.returnable
                  ? 'Volle Kästen nehmen wir im Markt oder bei der Lieferung zurück.'
                  : 'Leere Flaschen geben Sie einfach am Leergutautomaten im Markt ab.'}
              </span>
            </p>
          ) : null}
          {rental ? (
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">
              <Clock size={17} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
              Abholung ab dem Vortag Ihrer Veranstaltung, Rückgabe bis zum Folgetag. Gerne liefern und holen wir auch ab.
            </p>
          ) : null}
        </Card>
      </div>

      {matching.length ? (
        <Section title="Passt dazu" subtitle={rental ? 'Getränke und Zubehör für Ihr Fest' : 'Das wird oft zusammen bestellt'}>
          <ProductRail products={matching} label="Passt dazu" />
        </Section>
      ) : null}
      {similar.length ? (
        <Section
          title="Ähnliche Artikel"
          subtitle={category ? `Mehr aus ${category.name}` : undefined}
          action={
            category ? (
              <Link to={`/sortiment/${category.id}`} className="inline-flex h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
                Alle <ChevronRight size={16} aria-hidden />
              </Link>
            ) : null
          }
        >
          <ProductRail products={similar} label="Ähnliche Artikel" />
        </Section>
      ) : null}
    </>
  );
}

function ProductSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-5 h-4 w-48" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
        <Skeleton className="aspect-[4/3] w-full rounded-3xl lg:aspect-square" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-5 h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
