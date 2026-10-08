/**
 * Telefonbestellung durch den Markt: Kunde suchen, Artikel schnell erfassen (mit Vorschlägen aus
 * früheren Bestellungen), Lieferung/Abholung, Zeitfenster, Leergut, Zahlart und Hinweis.
 * Preise und Summen kommen live aus `api.adminQuote` (inkl. B2B-Konditionen),
 * angelegt wird mit `api.adminPlaceOrder` (Herkunft „phone“).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  History,
  MapPin,
  Phone,
  Plus,
  Recycle,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import type { CheckoutInput, CheckoutItem, Customer, FulfillmentType, Order, PaymentMethod, Product, Quote, TimeSlot } from '@shared/types';
import { PAYMENT_METHOD_LABEL, PRICE_GROUP_LABEL, formatDate, formatEuro, formatSlot } from '@shared/format';
import { todayString } from '@shared/time';
import { priceProduct } from '@shared/core/pricing';
import { api } from '@/api/client';
import { qk, useApiMutation, useDepositTypes, useProducts, useSettings, useSlots } from '@/api/hooks';
import { useDebouncedValue } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { Badge, Button, Checkbox, Drawer, Input, Notice, QuantityStepper, SegmentedControl, Select, Skeleton, Spinner, Textarea, toast } from '@/components/ui';
import { ProductImage } from '@/components/product';
import { matchesSearch, normalizeSearch, useAdminCustomer, useAdminCustomers } from '../../master/lib';
import { CustomerTypeBadges, defaultAddress } from '../../master/customers/customerUi';
import { EmptiesEditor } from './EmptiesEditor';

const MAX_QTY = 999;
/** Online-Zahlarten ergeben am Telefon keinen Sinn */
const PHONE_METHODS: PaymentMethod[] = ['cash', 'ec', 'invoice', 'sepa'];

export interface PhoneOrderDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Kunde vorauswählen (z. B. aus der Kundendetailseite) */
  initialCustomerId?: string | null;
  onCreated: (order: Order) => void;
}

// ───────────────────────────── Hilfen ─────────────────────────────

function digits(s: string | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

function customerMatches(c: Customer, q: string): boolean {
  const query = q.trim();
  if (!query) return false;
  const d = digits(query);
  if (d.length >= 3 && (digits(c.phone).includes(d) || digits(c.b2b?.customerNumber).includes(d))) return true;
  return matchesSearch(
    [c.name, c.contactName, c.email, c.phone, c.b2b?.customerNumber, c.b2b?.companyName, ...c.addresses.flatMap((a) => [a.street, a.zip, a.city, a.name])],
    query,
  );
}

/** "3 hell" → { qty: 3, text: "hell" }; "hell 3" ebenso */
function parseQuickEntry(raw: string): { qty: number; text: string } {
  const s = raw.trim();
  const lead = /^(\d{1,3})\s*[x×*]?\s+(.+)$/i.exec(s);
  if (lead) return { qty: Math.max(1, Number(lead[1])), text: lead[2] };
  const trail = /^(.+?)\s+[x×*]?\s*(\d{1,3})$/i.exec(s);
  if (trail && !/^\d+$/.test(trail[1])) return { qty: Math.max(1, Number(trail[2])), text: trail[1] };
  return { qty: 1, text: s };
}

function productMatches(p: Product, text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\d{6,14}$/.test(t)) return p.ean === t || p.sku.replace(/\D/g, '').includes(t);
  return matchesSearch([p.brand, p.name, p.sku, p.ean, p.packaging, p.categoryId], t);
}

/** Summenzeilen: Geschäftskunden netto (+ MwSt.), Privatkunden brutto */
function summaryRows(t: Quote['totals'], fulfillment: FulfillmentType, showNet: boolean): [string, number][] {
  const n = showNet ? t.netParts : undefined;
  const rows: [string, number][] = [[n ? 'Warenwert netto' : 'Warenwert', n ? n.items : t.itemsGross]];
  const discount = n ? n.discount : t.discount;
  const deposit = n ? n.deposit : t.deposit;
  const refund = n ? n.depositRefund : t.depositRefund;
  const carry = n ? n.carryFee : t.carryFee;
  if (discount) rows.push(['Gutschein', -discount]);
  if (deposit) rows.push([n ? 'Pfand netto' : 'Pfand', deposit]);
  if (refund) rows.push([n ? 'Leergut-Gutschrift netto' : 'Leergut-Gutschrift', -refund]);
  if (fulfillment === 'delivery') rows.push([n ? 'Liefergebühr netto' : 'Liefergebühr', n ? n.deliveryFee : t.deliveryFee]);
  if (carry) rows.push([n ? 'Tragservice netto' : 'Tragservice', carry]);
  if (n) rows.push(['zzgl. MwSt.', t.vat]);
  return rows;
}

function Section({ step, title, icon: Icon, action, children, className }: { step: number; title: ReactNode; icon: typeof Phone; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white" aria-hidden>
          {step}
        </span>
        <h3 className="flex min-w-0 flex-1 items-center gap-1.5 text-[15px] font-bold text-slate-900">
          <Icon size={16} aria-hidden className="shrink-0 text-slate-400" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ───────────────────────────── Kunde ─────────────────────────────

function CustomerPicker({ customers, loading, onPick, autoFocus }: { customers: Customer[]; loading: boolean; onPick: (c: Customer) => void; autoFocus: boolean }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    // Treffer im Namen vor Treffern in Adresse/Telefon, Namensanfang zuerst
    const needle = normalizeSearch(q.trim());
    const rank = (c: Customer) => {
      const name = normalizeSearch(`${c.name} ${c.contactName}`);
      if (name.startsWith(needle) || name.split(/\s+/).some((w) => w.startsWith(needle))) return 0;
      return name.includes(needle) ? 1 : 2;
    };
    return customers
      .filter((c) => customerMatches(c, q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'de'))
      .slice(0, 8);
  }, [customers, q]);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results[0]) {
      e.preventDefault();
      onPick(results[0]);
    }
  };
  return (
    <div>
      <Input
        icon={Search}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        placeholder="Name, Ort, Telefon oder Kundennummer"
        aria-label="Kunde suchen"
        autoFocus={autoFocus}
        autoComplete="off"
        hint={!q ? 'Tipp: die letzten Ziffern der Telefonnummer genügen.' : undefined}
      />
      {loading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : q.trim() ? (
        results.length ? (
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200" aria-label="Gefundene Kunden">
            {results.map((c, i) => {
              const a = defaultAddress(c);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className={cn('flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-brand-50/60', i === 0 && 'bg-slate-50/80')}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <UserRound size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        <CustomerTypeBadges customer={c} showSegment={false} />
                      </span>
                      <span className="block text-sm text-slate-500">
                        {[a ? `${a.street}, ${a.zip} ${a.city}` : null, c.phone, c.b2b ? `Kd.-Nr. ${c.b2b.customerNumber}` : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {i === 0 ? <kbd className="mt-1 hidden shrink-0 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-500 sm:block">Enter</kbd> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
            Kein Kunde gefunden. Neue Kunden registrieren sich im Shop oder werden über den Geschäftskunden-Antrag angelegt.
          </p>
        )
      ) : null}
    </div>
  );
}

function CustomerSummary({ customer, onChange }: { customer: Customer; onChange: () => void }) {
  const b = customer.b2b;
  const a = defaultAddress(customer);
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-bold text-slate-900">{customer.name}</span>
            <CustomerTypeBadges customer={customer} />
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            {[customer.contactName !== customer.name ? customer.contactName : null, b ? `Kd.-Nr. ${b.customerNumber}` : null, a ? `${a.street}, ${a.zip} ${a.city}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {customer.phone ? (
            <a href={`tel:${customer.phone.replace(/\s+/g, '')}`} className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
              <Phone size={13} aria-hidden /> {customer.phone}
            </a>
          ) : null}
        </div>
        <Button size="sm" variant="ghost" onClick={onChange}>
          Ändern
        </Button>
      </div>
      {b && b.status === 'active' ? (
        <p className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="brand">Preisgruppe {PRICE_GROUP_LABEL[b.priceGroup]}</Badge>
          {b.discountPercent ? <Badge tone="success">{b.discountPercent.toLocaleString('de-DE')} % Rabatt</Badge> : null}
          {b.allowInvoice ? <Badge tone="neutral">Rechnung · {b.paymentTermsDays} Tage</Badge> : null}
          {b.freeDelivery ? <Badge tone="neutral">frei Haus</Badge> : null}
        </p>
      ) : null}
      {b?.status === 'pending' ? (
        <Notice tone="warning" className="mt-3">
          Geschäftskunden-Antrag noch offen – es gelten Privatkundenpreise, kein Kauf auf Rechnung.
        </Notice>
      ) : b?.status === 'blocked' ? (
        <Notice tone="danger" className="mt-3">
          Konto gesperrt – keine Geschäftskundenkonditionen, kein Kauf auf Rechnung.
        </Notice>
      ) : null}
      {customer.internalNote ? <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">Notiz: {customer.internalNote}</p> : null}
    </div>
  );
}

// ───────────────────────────── Zeitfenster ─────────────────────────────

function SlotPicker({ slots, loading, value, onChange }: { slots: TimeSlot[] | undefined; loading: boolean; value?: string; onChange: (id: string) => void }) {
  const days = useMemo(() => {
    const map = new Map<string, TimeSlot[]>();
    for (const s of slots ?? []) map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return [...map.entries()].map(([date, list]) => ({ date, list, free: list.filter((s) => s.available).length }));
  }, [slots]);
  const chosen = slots?.find((s) => s.id === value);
  const [day, setDay] = useState<string | undefined>(undefined);
  const activeDay = day ?? chosen?.date ?? days.find((d) => d.free)?.date ?? days[0]?.date;
  const current = days.find((d) => d.date === activeDay);
  if (loading) return <Skeleton className="h-28 w-full" />;
  if (!days.length) return <p className="text-sm text-slate-500">Keine Zeitfenster gefunden.</p>;
  return (
    <div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none" role="tablist" aria-label="Tag">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={d.date === activeDay}
            onClick={() => setDay(d.date)}
            className={cn(
              'flex min-h-11 shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-1 text-center text-xs transition-colors',
              d.date === activeDay ? 'border-brand-600 bg-brand-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
              !d.free && d.date !== activeDay && 'opacity-60',
            )}
          >
            <span className="font-semibold">{formatDate(d.date, 'relative')}</span>
            <span className={d.date === activeDay ? 'text-white/80' : 'text-slate-500'}>{d.free ? `${d.free} frei` : 'voll'}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(current?.list ?? []).map((s) => {
          const selected = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!s.available}
              onClick={() => onChange(s.id)}
              title={s.reason}
              aria-pressed={selected}
              className={cn(
                'min-h-11 rounded-xl border px-2 py-1.5 text-center text-sm font-semibold tabular-nums transition-colors',
                selected ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-500/30' : 'border-slate-200 bg-white text-slate-800 hover:border-brand-300',
                !s.available && 'cursor-not-allowed border-dashed bg-slate-50 text-slate-400 hover:border-slate-200',
              )}
            >
              {s.start}–{s.end}
              <span className="block text-[11px] font-normal">{s.available ? `${Math.max(0, s.capacity - s.booked)} frei` : s.reason ?? 'nicht verfügbar'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── Drawer ─────────────────────────────

export function PhoneOrderDrawer({ open, onClose, initialCustomerId, onCreated }: PhoneOrderDrawerProps) {
  const customersQ = useAdminCustomers();
  const { data: allProducts } = useProducts();
  const depositTypes = useDepositTypes();
  const settings = useSettings();

  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId ?? null);
  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [productQ, setProductQ] = useState('');
  const [fulfillment, setFulfillment] = useState<FulfillmentType>('delivery');
  const [addressId, setAddressId] = useState<string>('');
  const [slotId, setSlotId] = useState<string | undefined>(undefined);
  const [empties, setEmpties] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [carry, setCarry] = useState(false);
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [tried, setTried] = useState(false);
  const productInputRef = useRef<HTMLInputElement>(null);

  // Beim Öffnen frisch beginnen (ggf. mit vorgewähltem Kunden)
  useEffect(() => {
    if (!open) return;
    setCustomerId(initialCustomerId ?? null);
    setItems([]);
    setProductQ('');
    setSlotId(undefined);
    setEmpties({});
    setCarry(false);
    setNotes('');
    setReference('');
    setCostCenter('');
    setTried(false);
  }, [open, initialCustomerId]);

  const customer = useMemo(() => (customersQ.data ?? []).find((c) => c.id === customerId) ?? null, [customersQ.data, customerId]);
  const detailQ = useAdminCustomer(open && customerId ? customerId : undefined);

  // Standardwerte je Kunde
  useEffect(() => {
    if (!customer) return;
    const a = defaultAddress(customer);
    setAddressId(a?.id ?? '');
    setFulfillment(a ? 'delivery' : 'pickup');
    setPayment(customer.b2b?.status === 'active' && customer.b2b.allowInvoice ? 'invoice' : 'cash');
    setCostCenter('');
    setSlotId(undefined);
    window.setTimeout(() => productInputRef.current?.focus(), 60);
    // nur beim Kundenwechsel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const productMap = useMemo(() => new Map((allProducts ?? []).map((p) => [p.id, p])), [allProducts]);
  const orderable = useMemo(() => (allProducts ?? []).filter((p) => p.active && !p.isRental), [allProducts]);
  const now = useMemo(() => new Date(), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vorschläge: zuletzt bestellte Artikel des Kunden
  const recent = useMemo(() => {
    const orders = (detailQ.data?.orders ?? []).filter((o) => o.status !== 'cancelled').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const map = new Map<string, { productId: string; qty: number; times: number; last: string }>();
    for (const o of orders) {
      for (const l of o.lines) {
        if (l.isRental || !productMap.get(l.productId)?.active) continue;
        const hit = map.get(l.productId);
        if (hit) hit.times += 1;
        else map.set(l.productId, { productId: l.productId, qty: l.qty, times: 1, last: o.createdAt });
      }
    }
    return { list: [...map.values()].sort((a, b) => b.times - a.times || b.last.localeCompare(a.last)).slice(0, 8), last: orders[0] };
  }, [detailQ.data, productMap]);

  const quick = parseQuickEntry(productQ);
  const productResults = useMemo(() => (quick.text ? orderable.filter((p) => productMatches(p, quick.text)).slice(0, 8) : []), [orderable, quick.text]);

  const addItem = (productId: string, qty = 1) => {
    setItems((prev) => {
      const hit = prev.find((i) => i.productId === productId);
      if (hit) return prev.map((i) => (i.productId === productId ? { ...i, qty: Math.min(MAX_QTY, i.qty + qty) } : i));
      return [...prev, { productId, qty: Math.min(MAX_QTY, qty) }];
    });
  };
  const setQty = (productId: string, qty: number) =>
    setItems((prev) => (qty <= 0 ? prev.filter((i) => i.productId !== productId) : prev.map((i) => (i.productId === productId ? { ...i, qty: Math.min(MAX_QTY, qty) } : i))));

  const pick = (p: Product) => {
    addItem(p.id, quick.qty);
    setProductQ('');
    productInputRef.current?.focus();
  };
  const onProductKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (productResults[0]) pick(productResults[0]);
    } else if (e.key === 'Escape' && productQ) {
      e.stopPropagation();
      setProductQ('');
    }
  };

  const slotsQ = useSlots({ type: fulfillment, from: todayString(), days: 7 }, open && !!customer);
  useEffect(() => {
    // gewähltes Fenster passt nicht mehr (Lieferart gewechselt, ausgebucht)
    if (slotId && slotsQ.data && !slotsQ.data.some((s) => s.id === slotId && s.available)) setSlotId(undefined);
  }, [slotsQ.data, slotId]);

  const emptiesLines = useMemo(() => Object.entries(empties).filter(([, q]) => q > 0).map(([depositTypeId, qty]) => ({ depositTypeId, qty })), [empties]);
  const input: CheckoutInput | null = useMemo(() => {
    if (!customer || !items.length) return null;
    return {
      items,
      fulfillment,
      addressId: fulfillment === 'delivery' && addressId ? addressId : undefined,
      slotId,
      emptiesReturn: emptiesLines,
      carryService: fulfillment === 'delivery' && carry,
      paymentMethod: payment,
      notes: notes.trim() || undefined,
      reference: reference.trim() || undefined,
      costCenter: costCenter || undefined,
    };
  }, [customer, items, fulfillment, addressId, slotId, emptiesLines, carry, payment, notes, reference, costCenter]);
  const debounced = useDebouncedValue(input, 250);
  const quoteQ = useQuery({
    queryKey: ['phoneOrderQuote', customerId, debounced],
    queryFn: () => api.adminQuote(customerId as string, debounced as CheckoutInput),
    enabled: open && !!customerId && !!debounced && debounced.items.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const quote = input && quoteQ.data ? quoteQ.data : null;
  const quoteStale = quoteQ.isFetching || input !== debounced;
  const showNet = quote ? quote.customerType === 'b2b' : customer?.type === 'b2b' && customer.b2b?.status === 'active';
  const lineById = new Map((quote?.lines ?? []).map((l) => [l.productId, l]));

  const methods = (quote?.paymentMethods ?? PHONE_METHODS).filter((m) => PHONE_METHODS.includes(m));
  useEffect(() => {
    if (quote && methods.length && !methods.includes(payment)) setPayment(methods[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.paymentMethods?.join('|')]);

  const place = useApiMutation((vars: { customerId: string; input: CheckoutInput }) => api.adminPlaceOrder(vars.customerId, vars.input), {
    invalidate: [qk.admin],
    onSuccess: (order) => {
      toast.success(`Telefonbestellung ${order.number} angelegt`, {
        description: `${order.customerName} · ${formatSlot(order.slot)}`,
      });
      onCreated(order);
    },
  });

  const problems: string[] = [];
  if (!customer) problems.push('Bitte wählen Sie einen Kunden.');
  if (!items.length) problems.push('Bitte erfassen Sie mindestens einen Artikel.');
  if (fulfillment === 'delivery' && customer && !addressId) problems.push('Bitte wählen Sie eine Lieferadresse.');
  if (!slotId) problems.push(fulfillment === 'delivery' ? 'Bitte wählen Sie ein Lieferfenster.' : 'Bitte wählen Sie ein Abholfenster.');
  const quoteErrors = (quote?.errors ?? []).filter((e) => !(e.code === 'slot' && !slotId));
  const canSubmit = !problems.length && !!quote && !quoteErrors.length && !quoteStale && !place.isPending;

  // Klick während die Preise noch neu berechnet werden (z. B. direkt nach dem Hinweis-Tippen): nicht verschlucken,
  // sondern nach der Berechnung automatisch anlegen
  const [submitWhenReady, setSubmitWhenReady] = useState(false);
  const submit = () => {
    setTried(true);
    if (!input || !customer) return;
    if (canSubmit) place.mutate({ customerId: customer.id, input });
    else if (quoteStale && !problems.length && !place.isPending) setSubmitWhenReady(true);
  };
  useEffect(() => {
    if (!submitWhenReady || quoteStale) return;
    setSubmitWhenReady(false);
    if (canSubmit && input && customer) place.mutate({ customerId: customer.id, input });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitWhenReady, quoteStale, canSubmit]);

  const balance = customer?.depositBalance ?? {};
  const itemCount = items.reduce((s, i) => s + i.qty, 0);

  const footer = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">
          {itemCount ? `${itemCount} ${itemCount === 1 ? 'Gebinde' : 'Gebinde'} · ` : ''}
          {quote ? (quote.totals.total < 0 ? 'Auszahlung' : 'Gesamt inkl. MwSt. und Pfand') : 'Gesamt'}
        </p>
        <p className="flex items-center gap-2 text-xl font-bold tabular-nums text-slate-900">
          {quote ? formatEuro(Math.abs(quote.totals.total)) : '–'}
          {quoteStale && input ? <Spinner size={14} label="Preise werden berechnet" /> : null}
        </p>
      </div>
      <div className="flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
        <Button variant="outline" onClick={onClose} disabled={place.isPending}>
          Abbrechen
        </Button>
        <Button icon={Check} onClick={submit} loading={place.isPending || submitWhenReady} disabled={tried && !canSubmit && !place.isPending && !submitWhenReady}>
          Bestellung anlegen
        </Button>
      </div>
      {tried && (problems.length || quoteErrors.length) ? (
        <p className="w-full text-sm font-medium text-red-600" role="alert">
          {[...problems, ...quoteErrors.map((e) => e.message)][0]}
        </p>
      ) : null}
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={place.isPending ? () => {} : onClose}
      title={
        <span className="flex items-center gap-2">
          <Phone size={20} aria-hidden className="text-brand-700" /> Telefonbestellung
        </span>
      }
      width="min(76rem, 100vw)"
      bodyClassName="!p-0"
      footer={footer}
    >
      <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_25rem]">
        {/* Links: Kunde + Artikel */}
        <div className="min-w-0 space-y-7 px-5 py-5">
          <Section step={1} title="Kunde" icon={UserRound}>
            {customer ? (
              <CustomerSummary customer={customer} onChange={() => setCustomerId(null)} />
            ) : (
              <CustomerPicker customers={customersQ.data ?? []} loading={customersQ.isLoading} onPick={(c) => setCustomerId(c.id)} autoFocus={open && !initialCustomerId} />
            )}
          </Section>

          <Section
            step={2}
            title="Artikel"
            icon={ShoppingBag}
            action={items.length ? <span className="text-sm font-medium text-slate-500">{items.length} Positionen</span> : undefined}
            className={cn(!customer && 'pointer-events-none opacity-50')}
          >
            <div className="relative">
              <Input
                ref={productInputRef}
                icon={Search}
                type="search"
                value={productQ}
                onChange={(e) => setProductQ(e.target.value)}
                onKeyDown={onProductKey}
                placeholder="Artikel suchen – z. B. „3 augustiner hell“ + Enter"
                aria-label="Artikel suchen"
                autoComplete="off"
                disabled={!customer}
              />
              {productQ.trim() ? (
                <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-raised" aria-label="Gefundene Artikel">
                  {productResults.length ? (
                    productResults.map((p, i) => {
                      const price = priceProduct(p, customer, quick.qty, now, depositTypes);
                      return (
                        <li key={p.id}>
                          <button type="button" onClick={() => pick(p)} className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-brand-50/60', i === 0 && 'bg-slate-50/80')}>
                            <ProductImage product={p} size={36} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900">
                                {p.brand} {p.name}
                              </span>
                              <span className="block text-xs text-slate-500">
                                {p.packaging} · Art.-Nr. {p.sku}
                                {p.stock <= 0 ? <span className="font-semibold text-red-600"> · nicht auf Lager</span> : p.stock < 10 ? ` · noch ${p.stock}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-right text-sm">
                              <span className="block font-semibold tabular-nums text-slate-900">{formatEuro(showNet ? price.unitNet : price.unitGross)}</span>
                              <span className="block text-[11px] text-slate-500">{showNet ? 'netto' : 'brutto'}{price.priceNote ? ` · ${price.priceNote}` : ''}</span>
                            </span>
                            <span className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-brand-700 px-2 text-xs font-semibold text-white">
                              <Plus size={14} aria-hidden />
                              {quick.qty}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  ) : (
                    <li className="px-3 py-3 text-sm text-slate-500">Kein Artikel gefunden. Suchen Sie nach Marke, Name oder Artikelnummer.</li>
                  )}
                </ul>
              ) : null}
            </div>

            {customer && (recent.list.length || detailQ.isLoading) ? (
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <History size={13} aria-hidden /> Zuletzt bestellt
                  </p>
                  {recent.last ? (
                    <button
                      type="button"
                      onClick={() => {
                        for (const l of recent.last?.lines ?? []) if (!l.isRental && productMap.get(l.productId)?.active) addItem(l.productId, l.qty);
                      }}
                      className="min-h-8 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      Letzte Bestellung übernehmen ({recent.last.number} · {formatDate(recent.last.createdAt, 'short')})
                    </button>
                  ) : null}
                </div>
                {detailQ.isLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {recent.list.map((r) => {
                      const p = productMap.get(r.productId);
                      if (!p) return null;
                      const inCart = items.some((i) => i.productId === r.productId);
                      return (
                        <button
                          key={r.productId}
                          type="button"
                          onClick={() => addItem(r.productId, r.qty)}
                          title={`${r.times}× bestellt – zuletzt ${r.qty} Stück`}
                          className={cn(
                            'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
                            inCart ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50',
                          )}
                        >
                          {inCart ? <Check size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
                          {r.qty} × {p.brand} {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {items.length ? (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {items.map((it) => {
                  const p = productMap.get(it.productId);
                  const line = lineById.get(it.productId);
                  const fallback = p ? priceProduct(p, customer, it.qty, now, depositTypes) : null;
                  const unit = line ? (showNet ? line.unitNet : line.unitGross) : fallback ? (showNet ? fallback.unitNet : fallback.unitGross) : 0;
                  const total = line ? (showNet ? line.lineNet : line.lineGross) : unit * it.qty;
                  const note = line?.priceNote ?? fallback?.priceNote;
                  return (
                    <li key={it.productId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap">
                      {p ? <ProductImage product={p} size={40} className="shrink-0" /> : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-slate-900">{p ? `${p.brand} ${p.name}` : it.productId}</p>
                        <p className="text-xs text-slate-500">
                          {p?.packaging} · je <span className="tabular-nums">{formatEuro(unit)}</span>
                          {showNet ? ' netto' : ''}
                          {line?.depositUnit ? ` + ${formatEuro(line.depositUnit)} Pfand` : ''}
                          {note ? <span className="ml-1 font-medium text-emerald-700">· {note}</span> : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 max-sm:w-full max-sm:justify-between max-sm:pl-[3.25rem]">
                        <QuantityStepper value={it.qty} onChange={(n) => setQty(it.productId, n)} min={0} max={MAX_QTY} size="sm" removeAtMin label={`Menge ${p?.name ?? ''}`} />
                        <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{formatEuro(total)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : customer ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-center text-sm text-slate-500">
                Noch keine Artikel. Suchen Sie oben oder übernehmen Sie Artikel aus früheren Bestellungen.
              </p>
            ) : null}
          </Section>
        </div>

        {/* Rechts: Lieferung, Zeitfenster, Leergut, Zahlung, Summe */}
        <div className={cn('min-w-0 space-y-7 border-t border-slate-200 bg-slate-50/70 px-5 py-5 lg:border-l lg:border-t-0', !customer && 'pointer-events-none opacity-50')}>
          <Section step={3} title="Lieferung & Zeitfenster" icon={CalendarClock}>
            <SegmentedControl
              block
              aria-label="Lieferart"
              value={fulfillment}
              onChange={(v) => setFulfillment(v as FulfillmentType)}
              options={[
                { value: 'delivery', label: 'Lieferung', icon: Truck },
                { value: 'pickup', label: 'Abholung', icon: ShoppingBag },
              ]}
            />
            {fulfillment === 'delivery' && customer ? (
              customer.addresses.length ? (
                <>
                  <Select
                    label="Lieferadresse"
                    value={addressId}
                    onChange={(e) => setAddressId(e.target.value)}
                    options={customer.addresses.map((a) => ({ value: a.id, label: `${a.label}: ${a.street}, ${a.zip} ${a.city}` }))}
                  />
                  {(() => {
                    const a = customer.addresses.find((x) => x.id === addressId);
                    return a?.notes || a?.floor !== undefined ? (
                      <p className="flex items-start gap-1.5 text-xs text-slate-500">
                        <MapPin size={13} aria-hidden className="mt-px shrink-0" />
                        {[a.floor !== undefined ? (a.floor === 0 ? 'Erdgeschoss' : `${a.floor}. Stock${a.hasElevator ? ' mit Aufzug' : ''}`) : null, a.notes].filter(Boolean).join(' · ')}
                      </p>
                    ) : null;
                  })()}
                  <Checkbox
                    label={`Tragservice bis in die Wohnung (${formatEuro(settings.carryServiceFee)})`}
                    checked={carry}
                    onChange={(e) => setCarry(e.target.checked)}
                  />
                </>
              ) : (
                <Notice tone="warning" icon={MapPin}>
                  Für diesen Kunden ist keine Lieferadresse hinterlegt. Wählen Sie Abholung oder ergänzen Sie die Adresse im Kundenkonto.
                </Notice>
              )
            ) : null}
            {customer ? (
              <SlotPicker slots={slotsQ.data} loading={slotsQ.isLoading} value={slotId} onChange={setSlotId} />
            ) : (
              <p className="text-sm text-slate-500">Zeitfenster erscheinen, sobald ein Kunde gewählt ist.</p>
            )}
          </Section>

          <Section step={4} title="Leergut-Rückgabe" icon={Recycle}>
            <EmptiesEditor
              value={empties}
              onChange={setEmpties}
              depositTypes={depositTypes}
              balance={balance}
              primaryIds={items.map((i) => productMap.get(i.productId)?.depositTypeId).filter((x): x is string => !!x)}
            />
          </Section>

          <Section step={5} title="Zahlung & Hinweis" icon={Phone}>
            <Select
              label="Zahlart"
              value={payment}
              onChange={(e) => setPayment(e.target.value as PaymentMethod)}
              options={methods.map((m) => ({ value: m, label: m === 'cash' || m === 'ec' ? `${PAYMENT_METHOD_LABEL[m]} bei ${fulfillment === 'delivery' ? 'Lieferung' : 'Abholung'}` : PAYMENT_METHOD_LABEL[m] }))}
            />
            {customer?.type === 'b2b' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Input label="Bestellreferenz" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder="optional" />
                {customer.b2b?.costCenters.length ? (
                  <Select
                    label="Kostenstelle"
                    value={costCenter}
                    onChange={(e) => setCostCenter(e.target.value)}
                    options={[{ value: '', label: 'keine' }, ...customer.b2b.costCenters.map((c) => ({ value: c, label: c }))]}
                  />
                ) : null}
              </div>
            ) : null}
            <Textarea label="Hinweis für Markt und Fahrer" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="z. B. bitte vorher anrufen" />
          </Section>

          <section aria-label="Summe" className="rounded-2xl border border-slate-200 bg-white p-4">
            {!quote ? (
              <p className="text-sm text-slate-500">{quoteQ.isFetching ? 'Preise werden berechnet …' : 'Summen erscheinen, sobald Kunde und Artikel erfasst sind.'}</p>
            ) : (
              <dl className={cn('space-y-1.5 text-sm transition-opacity', quoteStale && 'opacity-60')}>
                {summaryRows(quote.totals, fulfillment, showNet).map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className={cn('font-medium tabular-nums', value < 0 ? 'text-emerald-700' : 'text-slate-800')}>
                      {label.startsWith('Liefergebühr') && value === 0 ? 'kostenlos' : formatEuro(value)}
                    </dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
                  <dt className="font-bold text-slate-900">{quote.totals.total < 0 ? 'Auszahlung' : 'Gesamt'}</dt>
                  <dd className="text-lg font-bold tabular-nums text-slate-900">{formatEuro(Math.abs(quote.totals.total))}</dd>
                </div>
                {!(showNet && quote.totals.netParts) ? (
                  <div className="flex items-baseline justify-between gap-3 text-xs text-slate-400">
                    <dt>enthaltene MwSt.</dt>
                    <dd className="tabular-nums">{formatEuro(quote.totals.vat)}</dd>
                  </div>
                ) : null}
              </dl>
            )}
            {quote && (quoteErrors.length || quote.warnings.length) ? (
              <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                {quoteErrors.map((m) => (
                  <li key={`e-${m.code}-${m.message}`} className="flex items-start gap-1.5 font-medium text-red-700">
                    <X size={15} aria-hidden className="mt-0.5 shrink-0" />
                    {m.message}
                  </li>
                ))}
                {quote.warnings.map((m) => (
                  <li key={`w-${m.code}-${m.message}`} className="flex items-start gap-1.5 text-amber-800">
                    <AlertTriangle size={15} aria-hidden className="mt-0.5 shrink-0" />
                    {m.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {quoteQ.error ? (
              <Notice tone="danger" className="mt-3">
                {quoteQ.error instanceof Error ? quoteQ.error.message : 'Die Preise konnten nicht berechnet werden.'}
              </Notice>
            ) : null}
          </section>
        </div>
      </div>
    </Drawer>
  );
}
