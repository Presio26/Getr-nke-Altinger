import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgePercent, Info, LogIn, PartyPopper, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';
import { formatEuro } from '@shared/format';
import { useMyCustomer, useProductMap, useProducts } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { useSession } from '@/stores/session';
import { Button, ButtonLink, Card, ConfirmModal, EmptyState, Notice, PageHeader, Section, Spinner } from '@/components/ui';
import { CartLine } from './components/cart/CartLine';
import { CartSummary, blockingReasons, useCheckoutTarget } from './components/cart/CartSummary';
import { EmptiesReturn } from './components/cart/EmptiesReturn';
import { useCartQuote } from './components/cart/useCartQuote';
import { ProductRail } from './components/ProductRail';
import { ReorderCard, useLastOrder } from './components/ReorderCard';
import { hasActiveOffer } from './components/offers';
import { popularity } from './components/catalog';

// ───────────────────────────── Leerer Warenkorb ─────────────────────────────

function EmptyCart() {
  const role = useSession((s) => s.user?.role ?? null);
  const isCustomer = role === 'customer' || role === 'business';
  const { data: products, isLoading } = useProducts();
  const { data: customer } = useMyCustomer();
  const { order } = useLastOrder();
  const empties = useCart((s) => s.emptiesReturn);
  const setCart = useCart((s) => s.set);

  const favorites = useMemo(() => {
    const ids = new Set(customer?.favorites ?? []);
    return (products ?? []).filter((p) => ids.has(p.id) && p.active);
  }, [products, customer]);
  const offers = useMemo(() => (products ?? []).filter((p) => hasActiveOffer(p)), [products]);
  const bestsellers = useMemo(
    () =>
      (products ?? [])
        .filter((p) => p.active && !p.isRental && p.tags.includes('bestseller') && !hasActiveOffer(p))
        .sort((a, b) => popularity(b) - popularity(a)),
    [products],
  );

  return (
    <>
      <Card padding="none">
        <EmptyState
          icon={ShoppingCart}
          title="Ihr Warenkorb ist leer"
          description="Stöbern Sie in unserem Sortiment oder legen Sie Ihre letzte Bestellung mit einem Klick wieder in den Warenkorb."
          action={
            <>
              <ButtonLink to="/sortiment" iconRight={ArrowRight}>
                Sortiment entdecken
              </ButtonLink>
              <ButtonLink to="/angebote" variant="outline" icon={BadgePercent}>
                Angebote der Woche
              </ButtonLink>
              {!role ? (
                <ButtonLink to={`/login?next=${encodeURIComponent('/warenkorb')}`} variant="ghost" icon={LogIn}>
                  Anmelden
                </ButtonLink>
              ) : null}
            </>
          }
          className="py-14"
        />
        {empties.length ? (
          <div className="border-t border-slate-100 px-5 py-3 text-center text-sm text-slate-500">
            Sie haben Leergut zur Rückgabe vorgemerkt – es wird mit Ihrer nächsten Bestellung verrechnet.{' '}
            <button type="button" onClick={() => setCart({ emptiesReturn: [] })} className="font-semibold text-brand-700 hover:text-brand-800">
              Verwerfen
            </button>
          </div>
        ) : null}
      </Card>

      {isCustomer && order ? (
        <Section title="Nochmal bestellen" subtitle="Ihre letzte Bestellung – mit einem Klick wieder im Warenkorb.">
          <ReorderCard order={order} />
        </Section>
      ) : null}
      {favorites.length ? (
        <Section
          title="Ihre Favoriten"
          action={
            <Link to="/konto/favoriten" className="inline-flex h-11 items-center text-sm font-semibold text-brand-700 hover:text-brand-800">
              Alle Favoriten
            </Link>
          }
        >
          <ProductRail products={favorites} label="Ihre Favoriten" />
        </Section>
      ) : null}
      <Section title="Angebote der Woche">
        <ProductRail products={offers} loading={isLoading} label="Angebote der Woche" />
      </Section>
      <Section title="Beliebt in Garching">
        <ProductRail products={bestsellers} loading={isLoading} label="Beliebt in Garching" />
      </Section>
    </>
  );
}

// ───────────────────────────── Sticky-Leiste (Mobil) ─────────────────────────────

function MobileCheckoutBar({ total, loading, disabled }: { total: number | undefined; loading: boolean; disabled: boolean }) {
  const target = useCheckoutTarget();
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-[45] border-t border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-bar backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{total !== undefined && total < 0 ? 'Auszahlung' : 'Gesamt inkl. Pfand'}</p>
          <p className="flex items-center gap-2 text-xl font-bold tracking-tight tabular-nums text-slate-900">
            {total !== undefined ? formatEuro(Math.abs(total)) : '–'}
            {loading ? <Spinner size={14} /> : null}
          </p>
        </div>
        <ButtonLink to={target.to} size="lg" disabled={disabled || target.staff} iconRight={target.guest ? undefined : ArrowRight} icon={target.guest ? LogIn : undefined} className="h-12 px-5">
          {target.guest ? 'Anmelden' : 'Zur Kasse'}
        </ButtonLink>
      </div>
    </div>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

export default function CartPage() {
  const items = useCart((s) => s.items);
  const fulfillment = useCart((s) => s.fulfillment);
  const clear = useCart((s) => s.clear);
  const products = useProductMap();
  const { isLoading: productsLoading, isError: productsError, refetch: refetchProducts } = useProducts();
  const state = useCartQuote();
  const [confirmClear, setConfirmClear] = useState(false);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const hasRental = items.some((i) => products.get(i.productId)?.isRental);
  const reasons = blockingReasons(state);

  if (!items.length) {
    return (
      <>
        <PageHeader title="Warenkorb" />
        <EmptyCart />
      </>
    );
  }

  const errorsFor = (productId: string) => {
    const p = products.get(productId);
    if (!p) return [];
    const name = `${p.brand} ${p.name}`.trim();
    return state.lineErrors.filter((e) => e.message.includes(`„${name}“`));
  };

  return (
    <>
      <PageHeader
        title="Warenkorb"
        subtitle={`${items.length} Artikel · ${count} Gebinde`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem] xl:gap-8">
        <div className="min-w-0 space-y-4">
          {productsError ? (
            <Notice
              tone="danger"
              title="Das Sortiment konnte nicht geladen werden"
              action={
                <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => void refetchProducts()}>
                  Erneut laden
                </Button>
              }
            >
              Ihr Warenkorb bleibt erhalten. Bitte prüfen Sie Ihre Verbindung.
            </Notice>
          ) : null}
          <Card padding="none">
            <ul className="divide-y divide-slate-100">
              {items.map((i) => (
                <CartLine
                  key={i.productId}
                  productId={i.productId}
                  qty={i.qty}
                  product={products.get(i.productId)}
                  line={state.lineFor(i.productId, i.qty)}
                  showNet={state.showNet}
                  errors={errorsFor(i.productId)}
                  loading={productsLoading || productsError}
                />
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
              <Link to="/sortiment" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
                <ArrowRight size={16} aria-hidden className="rotate-180" /> Weiter einkaufen
              </Link>
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={16} aria-hidden /> Warenkorb leeren
              </button>
            </div>
          </Card>

          {hasRental ? (
            <Notice tone="brand" icon={PartyPopper} title="Leihartikel im Warenkorb">
              Das Datum Ihrer Veranstaltung geben Sie an der Kasse an – wir prüfen dann die Verfügbarkeit. Abholung am Vortag, Rückgabe am Folgetag.{' '}
              <Link to="/fest" className="font-semibold underline underline-offset-2">
                Zum Festservice
              </Link>
            </Notice>
          ) : null}

          {state.notes.map((n) => (
            <Notice key={n.code + n.message} tone="info" icon={Info}>
              {n.message}
            </Notice>
          ))}

          <EmptiesReturn fulfillment={fulfillment} />
        </div>

        <aside className="lg:sticky lg:top-[8.75rem]" aria-label="Zusammenfassung">
          <CartSummary state={state} count={count} hasRental={hasRental} />
        </aside>
      </div>

      {/* Platz für die mobile Kassen-Leiste */}
      <div className="h-20 lg:hidden" aria-hidden />
      <MobileCheckoutBar total={state.quote?.totals.total} loading={state.fetching || state.loading} disabled={reasons.length > 0} />

      <ConfirmModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clear();
          setConfirmClear(false);
        }}
        tone="danger"
        title="Warenkorb leeren?"
        message="Alle Artikel, das vorgemerkte Leergut und der Gutschein werden entfernt."
        confirmLabel="Leeren"
      />
    </>
  );
}

