import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarCheck,
  CalendarClock,
  CreditCard,
  MapPin,
  Pause,
  Pencil,
  Play,
  Plus,
  Recycle,
  Repeat,
  ShoppingCart,
  Trash2,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CheckoutItem, Customer, Order, Product, Subscription, SubscriptionInput } from '@shared/types';
import { formatDate, formatEuro, INTERVAL_LABEL, PAYMENT_METHOD_LABEL, WEEKDAY_LABEL } from '@shared/format';
import { diffDays, todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useApiMutation, useDepositTypes, useMyCustomer, useMyOrders, useMySubscriptions, useProducts, useSettings } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { cn } from '@/lib/cn';
import { ProductImage, productTint } from '@/components/product';
import { Badge, Button, Card, ConfirmModal, EmptyState, ErrorState, IconButton, PageHeader, Skeleton, toast } from '@/components/ui';
import { SubscriptionEditor, type SubscriptionVariant } from './SubscriptionEditor';
import { estimateItems, windowEnd } from '../lib/helpers';

const WORDING = {
  b2c: {
    title: 'Meine Abos',
    subtitle: 'Getränke automatisch im Wunschrhythmus – ohne Mindestlaufzeit, jederzeit pausierbar.',
    one: 'Abo',
    the: 'das Abo',
    newLabel: 'Neues Abo',
    back: '/konto',
    emptyTitle: 'Noch kein Getränke-Abo',
    emptyText: 'Wasser, Bier oder Spezi regelmäßig vor die Tür: Sie wählen Rhythmus, Liefertag und Zeitfenster – wir planen jede Lieferung automatisch ein.',
    nextLabel: 'Nächste Abo-Lieferung',
    steps: [
      { icon: ShoppingCart, title: 'Getränke wählen', text: 'Aus dem ganzen Sortiment – oder direkt aus Ihrem Warenkorb.' },
      { icon: CalendarClock, title: 'Rhythmus festlegen', text: 'Wöchentlich, alle 2 oder alle 4 Wochen, mit festem Lieferfenster.' },
      { icon: Truck, title: 'Automatisch beliefert', text: 'Wir planen jede Lieferung ein und nehmen auf Wunsch das Leergut mit.' },
    ],
  },
  b2b: {
    title: 'Daueraufträge',
    subtitle: 'Wiederkehrende Lieferungen für Ihren Betrieb – automatisch eingeplant und bequem per Rechnung.',
    one: 'Dauerauftrag',
    the: 'den Dauerauftrag',
    newLabel: 'Neuer Dauerauftrag',
    back: '/business',
    emptyTitle: 'Noch kein Dauerauftrag',
    emptyText: 'Legen Sie Ihre Standardbestellung einmal an – wir liefern sie zuverlässig zum gewünschten Termin, inklusive Leergut-Rücknahme.',
    nextLabel: 'Nächste Lieferung',
    steps: [
      { icon: ShoppingCart, title: 'Standardbestellung anlegen', text: 'Artikel und Mengen einmal erfassen – zu Ihren Konditionen.' },
      { icon: CalendarClock, title: 'Termin festlegen', text: 'Liefertag und Zeitfenster passend zu Ihren Anlieferzeiten.' },
      { icon: Truck, title: 'Zuverlässig beliefert', text: 'Automatisch eingeplant, Leergut-Tausch und Abrechnung per Rechnung.' },
    ],
  },
} as const;

function toInput(s: Subscription, patch: Partial<SubscriptionInput> = {}): SubscriptionInput {
  return {
    id: s.id,
    name: s.name,
    items: s.items,
    interval: s.interval,
    weekday: s.weekday,
    slotStart: s.slotStart,
    addressId: s.addressId,
    paymentMethod: s.paymentMethod,
    active: s.active,
    autoEmptiesReturn: s.autoEmptiesReturn,
    ...patch,
  };
}

function Meta({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon size={15} aria-hidden className="shrink-0 text-slate-400" />
      <span className="truncate">{children}</span>
    </span>
  );
}

interface CardProps {
  sub: Subscription;
  customer: Customer;
  products: Map<string, Product>;
  lastOrder?: Order;
  variant: SubscriptionVariant;
  toggling: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SubscriptionCard({ sub, customer, products, lastOrder, variant, toggling, onToggle, onEdit, onDelete }: CardProps) {
  const settings = useSettings();
  const depositTypes = useDepositTypes();
  const address = customer.addresses.find((a) => a.id === sub.addressId);
  const estimate = estimateItems(sub.items, products, customer, depositTypes);
  const end = windowEnd(settings, sub.weekday, sub.slotStart);
  const days = diffDays(todayString(), sub.nextDate);
  const shown = sub.items.slice(0, 4);
  const more = sub.items.length - shown.length;

  return (
    <Card padding="none" className={cn('overflow-hidden', !sub.active && 'bg-slate-50/80')}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', sub.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200/70 text-slate-500')}>
          <Repeat size={21} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={cn('text-base font-bold leading-snug', sub.active ? 'text-slate-900' : 'text-slate-600')}>{sub.name}</h3>
            {sub.active ? <Badge tone="success">Aktiv</Badge> : <Badge tone="neutral" icon={Pause}>Pausiert</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {INTERVAL_LABEL[sub.interval].replace(/^./, (c) => c.toUpperCase())} · {WEEKDAY_LABEL[sub.weekday]} · {sub.slotStart}–{end} Uhr
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <p className="text-lg font-bold tabular-nums text-slate-900">{formatEuro(estimate.goods)}</p>
          <p className="text-xs text-slate-500">
            je Lieferung{estimate.showNet ? ' netto' : ''}
            {estimate.deposit ? <> + {formatEuro(estimate.deposit)} Pfand</> : null}
          </p>
        </div>
      </div>

      <div className={cn('mx-4 flex items-center gap-3 rounded-xl px-3.5 py-2.5 sm:mx-5', sub.active ? 'bg-brand-50/70 text-brand-900' : 'bg-slate-100 text-slate-600')}>
        <CalendarCheck size={18} aria-hidden className={cn('shrink-0', sub.active ? 'text-brand-600' : 'text-slate-400')} />
        {sub.active ? (
          <p className="min-w-0 text-sm">
            <span className="font-semibold">Nächste Lieferung: {formatDate(sub.nextDate, 'long')}</span>
            <span className="text-brand-800/70"> · {days <= 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`}</span>
          </p>
        ) : (
          <p className="text-sm">Pausiert – bis zum Fortsetzen werden keine Lieferungen eingeplant.</p>
        )}
      </div>

      <ul className="grid gap-x-4 gap-y-2.5 px-4 pt-4 sm:grid-cols-2 sm:px-5">
        {shown.map((item) => {
          const p = products.get(item.productId);
          return (
            <li key={item.productId} className="flex min-w-0 items-center gap-3">
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100" style={p ? { background: productTint(p) } : undefined}>
                {p ? <ProductImage product={p} className="absolute inset-0 p-0.5" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  <span className="tabular-nums text-brand-700">{item.qty}×</span> {p ? `${p.brand} ${p.name}` : 'Artikel nicht mehr verfügbar'}
                </span>
                <span className="block truncate text-xs text-slate-500">{p?.packaging}</span>
              </span>
            </li>
          );
        })}
        {more > 0 ? <li className="self-center text-sm font-medium text-slate-500">+ {more} weitere Artikel</li> : null}
      </ul>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 px-4 text-sm text-slate-600 sm:px-5">
        <Meta icon={MapPin}>{address ? `${address.label}: ${address.street}` : 'Adresse fehlt'}</Meta>
        <Meta icon={CreditCard}>{PAYMENT_METHOD_LABEL[sub.paymentMethod]}</Meta>
        <Meta icon={Recycle}>{sub.autoEmptiesReturn ? 'Leergut wird mitgenommen' : 'ohne Leergut-Rücknahme'}</Meta>
        {lastOrder ? (
          <Meta icon={Truck}>
            Zuletzt:{' '}
            <Link to={`/bestellung/${lastOrder.id}`} className="font-semibold text-brand-700 hover:text-brand-800">
              {lastOrder.number}
            </Link>{' '}
            vom {formatDate(lastOrder.slot.date, 'short')}
          </Meta>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:hidden">
        <span className="text-sm text-slate-500">je Lieferung{estimate.showNet ? ' (netto)' : ''}</span>
        <span className="text-base font-bold tabular-nums text-slate-900">{formatEuro(estimate.goods)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:mt-4 sm:px-5">
        <Button size="sm" variant={sub.active ? 'outline' : 'success'} icon={sub.active ? Pause : Play} onClick={onToggle} loading={toggling}>
          {sub.active ? 'Pausieren' : 'Fortsetzen'}
        </Button>
        <Button size="sm" variant="outline" icon={Pencil} onClick={onEdit}>
          Bearbeiten
        </Button>
        <IconButton
          size="sm"
          icon={Trash2}
          onClick={onDelete}
          className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700"
          label={`${variant === 'b2b' ? 'Dauerauftrag' : 'Abo'} „${sub.name}“ löschen`}
        />
      </div>
    </Card>
  );
}

function HowItWorks({ variant }: { variant: SubscriptionVariant }) {
  const w = WORDING[variant];
  return (
    <Card padding="lg">
      <h2 className="text-base font-bold text-slate-900">So funktioniert{variant === 'b2b' ? '’s' : ' Ihr Abo'}</h2>
      <ol className="mt-4 space-y-4">
        {w.steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <s.icon size={19} aria-hidden />
              <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white ring-2 ring-white">{i + 1}</span>
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{s.title}</span>
              <span className="block text-sm leading-snug text-slate-500">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
        Ändern, pausieren oder löschen Sie {w.the} jederzeit – bis zum Bestellschluss am Vortag gilt die neue Einstellung bereits für die nächste Lieferung.
      </p>
    </Card>
  );
}

function FromCartCard({ variant, onCreate }: { variant: SubscriptionVariant; onCreate: () => void }) {
  const items = useCart((s) => s.items);
  const products = useProducts();
  const usable = items.filter((i) => {
    const p = products.data?.find((x) => x.id === i.productId);
    return p && !p.isRental;
  });
  if (!usable.length) return null;
  const count = usable.reduce((s, i) => s + i.qty, 0);
  return (
    <Card padding="lg" className="border-accent-200 bg-accent-50/60">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-800">
          <ShoppingCart size={19} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Aus Ihrem Warenkorb</p>
          <p className="mt-0.5 text-sm text-slate-600">
            {count} Gebinde im Warenkorb – als {variant === 'b2b' ? 'Dauerauftrag' : 'Abo'} regelmäßig liefern lassen?
          </p>
          <Button size="sm" variant="accent" icon={Repeat} onClick={onCreate} className="mt-3">
            {variant === 'b2b' ? 'Dauerauftrag anlegen' : 'Abo anlegen'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

type EditorState = { mode: 'new'; prefill?: CheckoutItem[] } | { mode: 'edit'; sub: Subscription } | null;

/** Abos (B2C) bzw. Daueraufträge (B2B) – gleiche Logik, unterschiedliches Wording */
export function SubscriptionsView({ variant }: { variant: SubscriptionVariant }) {
  const w = WORDING[variant];
  const customer = useMyCustomer();
  const subs = useMySubscriptions();
  const products = useProducts();
  const orders = useMyOrders();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleting, setDeleting] = useState<Subscription | null>(null);

  const productMap = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const orderMap = useMemo(() => new Map((orders.data ?? []).map((o) => [o.id, o])), [orders.data]);

  const openFromCart = () => {
    const all = useCart.getState().items.filter((i) => i.qty > 0);
    const cartItems = all.filter((i) => !productMap.get(i.productId)?.isRental);
    if (cartItems.length && cartItems.length < all.length) {
      toast.info('Leihartikel wurden nicht übernommen', { description: 'Leihartikel gelten pro Fest und können nicht abonniert werden.', id: 'sub-rentals' });
    }
    if (!cartItems.length) {
      toast.info('Ihr Warenkorb ist leer.', { description: 'Legen Sie zuerst Getränke in den Warenkorb oder wählen Sie die Artikel direkt im Formular.' });
      setEditor({ mode: 'new' });
      return;
    }
    setEditor({ mode: 'new', prefill: cartItems.map((i) => ({ ...i })) });
  };

  // ?neu=warenkorb öffnet den Editor mit den Artikeln aus dem Warenkorb, ?neu=1 leer
  const neu = params.get('neu');
  const ready = !!customer.data && !!products.data;
  useEffect(() => {
    if (!neu || !ready) return;
    if (neu === 'warenkorb') openFromCart();
    else setEditor({ mode: 'new' });
    const next = new URLSearchParams(params);
    next.delete('neu');
    setParams(next, { replace: true });
    // nur einmal je URL-Parameter auslösen, sobald Kunde und Sortiment geladen sind
  }, [neu, ready]);

  const toggle = useApiMutation((s: Subscription) => api.saveSubscription(toInput(s, { active: !s.active })), {
    invalidate: [qk.subscriptions],
    success: (s) => (s.active ? `„${s.name}“ läuft wieder – nächste Lieferung am ${formatDate(s.nextDate, 'long')}` : `„${s.name}“ ist pausiert.`),
  });
  const remove = useApiMutation((s: Subscription) => api.deleteSubscription(s.id), {
    success: (_r, s) => `${w.one} „${s.name}“ wurde gelöscht.`,
    onSuccess: async (_r, s) => {
      qc.setQueryData<Subscription[]>(qk.subscriptions, (list) => list?.filter((x) => x.id !== s.id));
      setDeleting(null);
      await qc.invalidateQueries({ queryKey: qk.subscriptions });
    },
    onError: () => setDeleting(null),
  });

  const list = subs.data ?? [];
  const sorted = useMemo(
    () => [...list].sort((a, b) => Number(b.active) - Number(a.active) || a.nextDate.localeCompare(b.nextDate) || a.name.localeCompare(b.name)),
    [list],
  );
  const next = sorted.find((s) => s.active);
  const loading = customer.isLoading || subs.isLoading;
  const error = customer.error ?? subs.error;
  const settings = useSettings();
  const cartCount = useCart((s) => s.items.length);

  return (
    <>
      <PageHeader
        title={w.title}
        subtitle={w.subtitle}
        back={w.back}
        actions={
          list.length ? (
            <Button icon={Plus} onClick={() => setEditor({ mode: 'new' })} disabled={!customer.data} className="w-full sm:w-auto">
              {w.newLabel}
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" aria-busy>
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
          <Skeleton className="hidden h-72 rounded-2xl lg:block" />
        </div>
      ) : error || !customer.data ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void customer.refetch();
            void subs.refetch();
          }}
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-4">
            {next ? (
              <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-700 to-brand-800 p-4 text-white shadow-raised sm:p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-accent-300 ring-1 ring-white/10">
                  <CalendarClock size={24} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-300">{w.nextLabel}</p>
                  <p className="mt-0.5 text-lg font-bold leading-snug">
                    {formatDate(next.nextDate, 'long')}, {next.slotStart}–{windowEnd(settings, next.weekday, next.slotStart)} Uhr
                  </p>
                  <p className="truncate text-sm text-white/75">„{next.name}“</p>
                </div>
              </div>
            ) : null}

            {sorted.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Repeat}
                  title={w.emptyTitle}
                  description={w.emptyText}
                  action={
                    <>
                      <Button icon={Plus} onClick={() => setEditor({ mode: 'new' })}>
                        {variant === 'b2b' ? 'Dauerauftrag anlegen' : 'Abo anlegen'}
                      </Button>
                      {cartCount ? (
                        <Button variant="outline" icon={ShoppingCart} onClick={openFromCart}>
                          Aus Warenkorb übernehmen
                        </Button>
                      ) : null}
                    </>
                  }
                />
              </Card>
            ) : (
              sorted.map((s) => (
                <SubscriptionCard
                  key={s.id}
                  sub={s}
                  customer={customer.data!}
                  products={productMap}
                  lastOrder={s.lastOrderId ? orderMap.get(s.lastOrderId) : undefined}
                  variant={variant}
                  toggling={toggle.isPending && toggle.variables?.id === s.id}
                  onToggle={() => toggle.mutate(s)}
                  onEdit={() => setEditor({ mode: 'edit', sub: s })}
                  onDelete={() => setDeleting(s)}
                />
              ))
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-36">
            <FromCartCard variant={variant} onCreate={openFromCart} />
            <HowItWorks variant={variant} />
          </aside>
        </div>
      )}

      {editor && customer.data ? (
        <SubscriptionEditor
          key={editor.mode === 'edit' ? editor.sub.id : 'new'}
          variant={variant}
          customer={customer.data}
          subscription={editor.mode === 'edit' ? editor.sub : null}
          prefill={editor.mode === 'new' ? editor.prefill : undefined}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        title={`${w.one} löschen?`}
        message={
          deleting ? (
            <>
              „{deleting.name}“ wird dauerhaft gelöscht. Bereits eingeplante Lieferungen bleiben bestehen.
              {deleting.active ? ` Tipp: Mit „Pausieren“ können Sie ${w.the} später einfach fortsetzen.` : ''}
            </>
          ) : null
        }
        confirmLabel="Löschen"
        tone="danger"
        loading={remove.isPending}
      />
    </>
  );
}
