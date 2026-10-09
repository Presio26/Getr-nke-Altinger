import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, Info, Package, Plus, Recycle, Save, Search, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CheckoutItem, Customer, PaymentMethod, Product, Subscription, SubscriptionInput, SubscriptionInterval } from '@shared/types';
import { formatDate, formatEuro, INTERVAL_LABEL, PAYMENT_METHOD_LABEL, WEEKDAY_LABEL, WEEKDAY_SHORT } from '@shared/format';
import { addDays, todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useApiMutation, useDepositTypes, usePrice, useProducts, useSettings } from '@/api/hooks';
import { cn } from '@/lib/cn';
import { ProductImage, productTint, useTouchStepperSize } from '@/components/product';
import { Button, Input, Modal, Notice, QuantityStepper, Skeleton, Switch } from '@/components/ui';
import { ChipGroup } from './ChipGroup';
import { AddressFormModal } from './AddressFormModal';
import {
  allowedPaymentMethods,
  defaultPaymentMethod,
  deliveryWeekdays,
  estimateItems,
  nextWeekdayDate,
  PAYMENT_HINT,
  windowsFor,
  windowEnd,
} from '../lib/helpers';

export type SubscriptionVariant = 'b2c' | 'b2b';

const INTERVALS: SubscriptionInterval[] = ['weekly', 'biweekly', 'monthly'];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function matches(p: Product, terms: string[]): boolean {
  const hay = `${p.brand} ${p.name} ${p.packaging} ${p.categoryId}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function FieldTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-semibold text-slate-800">{children}</h3>
      {aside ? <span className="text-xs text-slate-500">{aside}</span> : null}
    </div>
  );
}

function PickRow({ product, qty, onAdd }: { product: Product; qty: number; onAdd: () => void }) {
  const price = usePrice(product);
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: productTint(product) }}>
        <ProductImage product={product} className="absolute inset-0 p-0.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">
          {product.brand} {product.name}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {product.packaging} · {formatEuro(price.displayUnit)}
          {price.showNet ? ' netto' : ''}
        </span>
      </span>
      <Button
        size="sm"
        variant={qty ? 'secondary' : 'outline'}
        icon={qty ? Check : Plus}
        onClick={onAdd}
        aria-label={`${product.brand} ${product.name} hinzufügen`}
        className="px-2.5"
      >
        {qty ? `${qty}×` : 'Hinzufügen'}
      </Button>
    </li>
  );
}

function SelectedRow({ product, qty, onChange }: { product: Product; qty: number; onChange: (n: number) => void }) {
  const stepper = useTouchStepperSize();
  const price = usePrice(product, qty);
  const line = price.showNet ? price.price.lineNet : price.price.lineGross;
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: productTint(product) }}>
        <ProductImage product={product} className="absolute inset-0 p-0.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
          {product.brand} {product.name}
        </span>
        <span className="block truncate text-xs text-slate-500">{product.packaging}</span>
        <span className="block text-xs font-semibold tabular-nums text-slate-700">
          {formatEuro(line)}
          {price.showNet ? ' netto' : ''}
        </span>
      </span>
      <QuantityStepper value={qty} onChange={onChange} min={0} max={99} size={stepper} removeAtMin label={`${product.brand} ${product.name}`} />
    </li>
  );
}

export interface SubscriptionEditorProps {
  variant: SubscriptionVariant;
  customer: Customer;
  subscription?: Subscription | null;
  /** neue Vorlage, z. B. aus dem Warenkorb */
  prefill?: CheckoutItem[];
  onClose: () => void;
}

/** Abo / Dauerauftrag anlegen oder bearbeiten */
export function SubscriptionEditor({ variant, customer, subscription, prefill, onClose }: SubscriptionEditorProps) {
  const settings = useSettings();
  const depositTypes = useDepositTypes();
  const products = useProducts();
  const qc = useQueryClient();
  const b2b = variant === 'b2b';
  const one = b2b ? 'Dauerauftrag' : 'Abo';

  const productMap = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const weekdays = deliveryWeekdays(settings);
  const today = todayString();

  const [name, setName] = useState(subscription?.name ?? (prefill?.length ? (b2b ? 'Dauerauftrag aus Warenkorb' : 'Mein Warenkorb-Abo') : ''));
  const [items, setItems] = useState<CheckoutItem[]>(() => (subscription?.items ?? prefill ?? []).map((i) => ({ ...i })));
  const [interval, setRhythm] = useState<SubscriptionInterval>(subscription?.interval ?? (b2b ? 'weekly' : 'biweekly'));
  const [weekday, setWeekday] = useState<number>(() => {
    if (subscription) return subscription.weekday;
    const preferred = b2b ? 1 : 5;
    return weekdays.includes(preferred) ? preferred : weekdays[0] ?? 1;
  });
  const [slotStart, setSlotStart] = useState<string>(() => {
    if (subscription) return subscription.slotStart;
    const list = windowsFor(settings, weekday);
    const preferred = b2b ? '08:00' : '16:00';
    return list.find((w) => w.start === preferred)?.start ?? list[0]?.start ?? '08:00';
  });
  const [addressId, setAddressId] = useState(subscription?.addressId ?? customer.defaultAddressId ?? customer.addresses[0]?.id ?? '');
  const payments = allowedPaymentMethods(customer);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    const p = subscription?.paymentMethod ?? defaultPaymentMethod(customer, variant);
    return payments.includes(p) ? p : payments[0];
  });
  const [autoEmpties, setAutoEmpties] = useState(subscription?.autoEmptiesReturn ?? true);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<{ items?: string; address?: string }>({});
  const [addingAddress, setAddingAddress] = useState(false);

  // neu angelegte Adresse automatisch auswählen
  useEffect(() => {
    if (!addressId && customer.addresses.length) setAddressId(customer.defaultAddressId ?? customer.addresses[0].id);
  }, [addressId, customer.addresses, customer.defaultAddressId]);

  // Artikel, die es nicht (mehr) gibt oder Leihartikel sind, aus der Vorlage entfernen
  const validItems = items.filter((i) => {
    const p = productMap.get(i.productId);
    return !products.data || (p && p.active && !p.isRental);
  });
  const droppedCount = products.data ? items.length - validItems.length : 0;

  const windows = windowsFor(settings, weekday);
  const changeWeekday = (d: number) => {
    setWeekday(d);
    const list = windowsFor(settings, d);
    if (!list.some((w) => w.start === slotStart)) setSlotStart(list[0]?.start ?? slotStart);
  };

  const setQty = (productId: string, qty: number) => {
    setItems((prev) => (qty <= 0 ? prev.filter((i) => i.productId !== productId) : prev.map((i) => (i.productId === productId ? { ...i, qty } : i))));
  };
  const addProduct = (productId: string) => {
    setErrors((e) => ({ ...e, items: undefined }));
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) return prev.map((i) => (i.productId === productId ? { ...i, qty: Math.min(99, i.qty + 1) } : i));
      return [...prev, { productId, qty: 1 }];
    });
  };

  const candidates = useMemo(() => {
    const list = (products.data ?? []).filter((p) => p.active && !p.isRental);
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) return list.filter((p) => matches(p, terms)).slice(0, 8);
    const fav = new Set(customer.favorites);
    return list
      .filter((p) => fav.has(p.id) || p.tags.includes('bestseller'))
      .sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)))
      .slice(0, 6);
  }, [products.data, query, customer.favorites]);

  const estimate = estimateItems(validItems, productMap, customer, depositTypes);
  const firstDate =
    subscription && subscription.weekday === weekday && subscription.nextDate >= addDays(today, 1) ? subscription.nextDate : nextWeekdayDate(weekday, today);
  const end = windowEnd(settings, weekday, slotStart);

  const save = useApiMutation((input: SubscriptionInput) => api.saveSubscription(input), {
    invalidate: [qk.subscriptions],
    success: (s) => (subscription ? `${one} „${s.name}“ gespeichert.` : `${one} „${s.name}“ angelegt – erste Lieferung am ${formatDate(s.nextDate, 'long')}`),
    onSuccess: (s) => {
      qc.setQueryData<Subscription[]>(qk.subscriptions, (list) => {
        if (!list) return list;
        const i = list.findIndex((x) => x.id === s.id);
        if (i === -1) return [...list, s];
        const next = list.slice();
        next[i] = s;
        return next;
      });
      onClose();
    },
  });

  const submit = () => {
    const next: typeof errors = {};
    if (!validItems.length) next.items = 'Bitte wählen Sie mindestens einen Artikel.';
    if (!addressId) next.address = 'Bitte legen Sie zuerst eine Lieferadresse an.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const input: SubscriptionInput = {
      name: name.trim() || autoName,
      items: validItems,
      interval,
      weekday,
      slotStart,
      addressId,
      paymentMethod,
      active: subscription?.active ?? true,
      autoEmptiesReturn: autoEmpties,
    };
    if (subscription) input.id = subscription.id;
    save.mutate(input);
  };

  const firstProduct = validItems[0] ? productMap.get(validItems[0].productId) : undefined;
  const autoName = firstProduct
    ? `${firstProduct.brand} ${firstProduct.name}${validItems.length > 1 ? ` + ${validItems.length - 1}` : ''} ${INTERVAL_LABEL[interval]}`.slice(0, 80)
    : b2b
      ? 'Dauerauftrag'
      : 'Mein Abo';

  const selected = validItems.map((i) => ({ item: i, product: productMap.get(i.productId) })).filter((x): x is { item: CheckoutItem; product: Product } => !!x.product);

  return (
    <Modal
      open
      onClose={save.isPending ? () => {} : onClose}
      size="xl"
      title={subscription ? `${one} bearbeiten` : b2b ? 'Neuer Dauerauftrag' : 'Neues Abo'}
      description={b2b ? 'Wiederkehrende Lieferung für Ihren Betrieb – automatisch eingeplant.' : 'Ihre Getränke automatisch im Wunschrhythmus – jederzeit pausierbar.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button icon={Save} onClick={submit} loading={save.isPending}>
            {subscription ? 'Änderungen speichern' : `${one} anlegen`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8">
        {/* ── Artikel ── */}
        <div className="min-w-0 space-y-5">
          <Input
            label="Bezeichnung"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={firstProduct ? autoName : b2b ? 'z. B. Wochenbestellung Montag' : 'z. B. Wasser alle 2 Wochen'}
            maxLength={80}
          />

          <div>
            <FieldTitle aside={selected.length ? `${estimate.count} Gebinde` : undefined}>Artikel je Lieferung</FieldTitle>
            {droppedCount > 0 ? (
              <Notice tone="warning" className="mb-3">
                {droppedCount === 1 ? 'Ein Artikel kann' : `${droppedCount} Artikel können`} nicht abonniert werden (Leihartikel oder nicht mehr erhältlich) und
                {droppedCount === 1 ? ' wurde' : ' wurden'} weggelassen.
              </Notice>
            ) : null}
            {products.isLoading ? (
              <Skeleton className="h-20 rounded-2xl" />
            ) : selected.length ? (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3">
                {selected.map(({ item, product }) => (
                  <SelectedRow key={item.productId} product={product} qty={item.qty} onChange={(n) => setQty(item.productId, n)} />
                ))}
              </ul>
            ) : (
              <div className={cn('flex items-center gap-3 rounded-2xl border border-dashed px-4 py-5 text-sm', errors.items ? 'border-red-300 bg-red-50/50 text-red-700' : 'border-slate-300 text-slate-500')}>
                <Package size={20} aria-hidden className="shrink-0" />
                {errors.items ?? 'Noch keine Artikel – suchen Sie unten nach Getränken.'}
              </div>
            )}
          </div>

          <div>
            <Input
              label="Artikel hinzufügen"
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen, z. B. Wasser, Spezi, Augustiner …"
              autoComplete="off"
              suffix={
                query ? (
                  <button type="button" onClick={() => setQuery('')} aria-label="Suche leeren" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <X size={16} aria-hidden />
                  </button>
                ) : null
              }
            />
            <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{query.trim() ? 'Suchergebnisse' : 'Favoriten & Beliebtes'}</p>
            {products.isLoading ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : candidates.length ? (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {candidates.map((p) => (
                  <PickRow key={p.id} product={p} qty={items.find((i) => i.productId === p.id)?.qty ?? 0} onAdd={() => addProduct(p.id)} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">Keine passenden Artikel gefunden.</p>
            )}
          </div>
        </div>

        {/* ── Termin & Zahlung ── */}
        <div className="min-w-0 space-y-5">
          <div>
            <FieldTitle>Rhythmus</FieldTitle>
            <ChipGroup aria-label="Rhythmus" value={interval} onChange={setRhythm} columns={3} size="sm" options={INTERVALS.map((v) => ({ value: v, label: capitalize(INTERVAL_LABEL[v]) }))} />
          </div>
          <div>
            <FieldTitle aside={WEEKDAY_LABEL[weekday]}>Liefertag</FieldTitle>
            <ChipGroup aria-label="Liefertag" value={weekday} onChange={changeWeekday} columns={6} options={weekdays.map((d) => ({ value: d, label: WEEKDAY_SHORT[d] }))} />
          </div>
          <div>
            <FieldTitle>Lieferfenster</FieldTitle>
            <ChipGroup
              aria-label="Lieferfenster"
              value={slotStart}
              onChange={setSlotStart}
              columns={3}
              size="sm"
              options={windows.map((w) => ({ value: w.start, label: `${w.start}–${w.end}` }))}
            />
          </div>
          <div>
            <FieldTitle aside={<Link to="/konto/adressen" className="font-semibold text-brand-700 hover:text-brand-800">Adressen verwalten</Link>}>Lieferadresse</FieldTitle>
            {customer.addresses.length ? (
              <div role="radiogroup" aria-label="Lieferadresse" className="space-y-2">
                {customer.addresses.map((a) => {
                  const active = a.id === addressId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAddressId(a.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        active ? 'border-brand-600 bg-brand-50/60 shadow-[0_0_0_1px_var(--color-brand-600)]' : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', active ? 'border-brand-700' : 'border-slate-300')}>
                        {active ? <span className="h-2.5 w-2.5 rounded-full bg-brand-700" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{a.label}</span>
                        <span className="block truncate text-sm text-slate-500">
                          {a.street}, {a.zip} {a.city}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Notice
                tone="warning"
                title="Keine Lieferadresse"
                action={
                  <Button size="sm" variant="outline" icon={Plus} onClick={() => setAddingAddress(true)}>
                    Anlegen
                  </Button>
                }
              >
                {errors.address ?? 'Bitte legen Sie zuerst eine Adresse an.'}
              </Notice>
            )}
          </div>
          <div>
            <FieldTitle aside={PAYMENT_HINT[paymentMethod]}>Zahlart</FieldTitle>
            <ChipGroup aria-label="Zahlart" value={paymentMethod} onChange={setPaymentMethod} columns={2} size="sm" options={payments.map((p) => ({ value: p, label: PAYMENT_METHOD_LABEL[p] }))} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
            <Switch
              checked={autoEmpties}
              onChange={setAutoEmpties}
              label={
                <span className="inline-flex items-center gap-2">
                  <Recycle size={17} aria-hidden className="text-emerald-600" /> Leergut automatisch mitgeben
                </span>
              }
              description="Der Fahrer nimmt bei jeder Lieferung so viele leere Kästen mit, wie er bringt – das Pfand wird direkt verrechnet."
            />
          </div>

          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-300">
              <CalendarClock size={15} aria-hidden /> {subscription?.active === false ? 'Nächster Termin (nach Fortsetzen)' : 'Erste Lieferung'}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold">{formatDate(firstDate, 'long')}</p>
            <p className="text-sm text-white/70">
              {slotStart}–{end} Uhr · danach {INTERVAL_LABEL[interval]}
            </p>
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
              <span className="text-sm text-white/70">je Lieferung ca.</span>
              <span className="text-right">
                <span className="block text-xl font-bold tabular-nums">{formatEuro(estimate.goods)}</span>
                <span className="block text-xs text-white/60">
                  {estimate.showNet ? 'netto zzgl. MwSt.' : 'inkl. MwSt.'}
                  {estimate.deposit ? ` · zzgl. ${formatEuro(estimate.deposit)} Pfand` : ''}
                </span>
              </span>
            </div>
          </div>
          <p className="flex gap-2 text-xs leading-relaxed text-slate-500">
            <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
            Preise gelten am Liefertag (Angebote und Staffelpreise werden automatisch berücksichtigt). Sie erhalten vor jeder Lieferung eine Benachrichtigung.
          </p>
        </div>
      </div>
      {addingAddress ? <AddressFormModal customer={customer} open onClose={() => setAddingAddress(false)} /> : null}
    </Modal>
  );
}
