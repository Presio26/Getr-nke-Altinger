import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, LayoutGrid, Lock, ShieldCheck, ShoppingBag, ShoppingCart, Truck } from 'lucide-react';
import type { CheckoutInput, FulfillmentType, PaymentMethod } from '@shared/types';
import { ApiError } from '@shared/api';
import { api } from '@/api/client';
import { qk, useDepositTypes, useMyCustomer, useProductMap, useQuote, useSettings, useSlots } from '@/api/hooks';
import { formatDate } from '@shared/format';
import { todayString } from '@shared/time';
import { cartToCheckoutInput, useCart } from '@/stores/cart';
import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, RadioCards, Skeleton, errorMessage, toast } from '@/components/ui';
import { StoreInfo } from '@/features/orders/components/StoreInfo';
import { StepCard, scrollToSection } from './components/StepCard';
import { AddressStep, NEW_ADDRESS } from './components/AddressStep';
import { SlotStep, firstAvailableDay } from './components/SlotStep';
import { OptionsStep } from './components/OptionsStep';
import { PaymentStep } from './components/PaymentStep';
import { SummaryPanel } from './components/SummaryPanel';
import { MobileOrderBar } from './components/MobileOrderBar';
import { draftToInput, emptyDraft, validateDraft, ZIP_RE, type AddressDraft, type AddressErrors } from './lib/address';

const FALLBACK_METHODS: PaymentMethod[] = ['cash', 'ec', 'paypal', 'card'];

interface Issues {
  address?: AddressErrors;
  addressMissing?: string;
  slot?: string;
  eventDate?: string;
  terms?: string;
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]" aria-busy>
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton className="h-6 w-48" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-5 h-48 w-full" />
        <Skeleton className="mt-5 h-12 w-full" />
      </Card>
    </div>
  );
}

/** Kasse: Lieferart, Adresse, Zeitfenster, Optionen, Zahlung, Zusammenfassung */
export default function CheckoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cart = useCart();
  const settings = useSettings();
  const depositTypes = useDepositTypes();
  const products = useProductMap();
  const customerQuery = useMyCustomer();
  const customer = customerQuery.data;

  const [addressMode, setAddressMode] = useState<'saved' | 'new'>('saved');
  const [draft, setDraft] = useState<AddressDraft>(() => emptyDraft(null));
  const draftInit = useRef(false);
  const [terms, setTerms] = useState(false);
  const [issues, setIssues] = useState<Issues>({});
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const placedRef = useRef(false);
  const [summaryButton, setSummaryButton] = useState<HTMLButtonElement | null>(null);
  const [summaryButtonVisible, setSummaryButtonVisible] = useState(false);

  const delivery = cart.fulfillment === 'delivery';
  const isNewAddress = delivery && addressMode === 'new';

  // ── Kunde geladen: Name vorbelegen, Adresse prüfen (muss zum Kunden gehören) ──
  useEffect(() => {
    if (!customer) return;
    if (!draftInit.current) {
      draftInit.current = true;
      setDraft(emptyDraft(customer));
    }
    const ids = customer.addresses.map((a) => a.id);
    if (!ids.length) {
      setAddressMode('new');
      if (cart.addressId) cart.set({ addressId: undefined });
      return;
    }
    if (!cart.addressId || !ids.includes(cart.addressId)) {
      const def = customer.defaultAddressId && ids.includes(customer.defaultAddressId) ? customer.defaultAddressId : ids[0];
      cart.set({ addressId: def });
    }
  }, [customer, cart.addressId]);

  const savedAddress = useMemo(
    () => (customer && cart.addressId ? customer.addresses.find((a) => a.id === cart.addressId) : undefined),
    [customer, cart.addressId],
  );
  const draftZipValid = ZIP_RE.test(draft.zip);

  // ── Eingaben für die Preisberechnung (neue Adresse: nur die PLZ ist preisrelevant) ──
  const baseInput = useMemo(() => {
    const input = cartToCheckoutInput(cart);
    if (isNewAddress) {
      delete input.addressId;
      if (draftZipValid) input.address = { label: 'Neue Adresse', name: '', street: '', zip: draft.zip, city: '' };
    } else if (delivery && cart.addressId && !savedAddress) {
      // Adresse (noch) nicht beim Kunden bekannt → nicht senden
      delete input.addressId;
    }
    return input;
  }, [cart, isNewAddress, draftZipValid, draft.zip, savedAddress, delivery]);
  const quoteEnabled = !!customer && cart.items.length > 0;
  const quoteQuery = useQuote(customer ? baseInput : null, quoteEnabled);
  const quote = quoteQuery.data;
  const quoteSettled = !!quote && !quoteQuery.isPlaceholderData && !quoteQuery.isFetching;

  // ── Zeitfenster ──
  const slotsQuery = useSlots({ type: cart.fulfillment, days: 7 }, !!customer);
  const slots = slotsQuery.data;
  const selectedSlot = slots?.find((s) => s.id === cart.slotId);

  useEffect(() => {
    if (!cart.slotId) return;
    if (!cart.slotId.startsWith(`${cart.fulfillment}|`)) {
      cart.set({ slotId: undefined });
      return;
    }
    if (!slots) return;
    const s = slots.find((x) => x.id === cart.slotId);
    if (!s || !s.available) {
      cart.set({ slotId: undefined });
      setSlotNotice(
        s?.reason === 'Ausgebucht'
          ? 'Ihr zuvor gewähltes Zeitfenster ist inzwischen ausgebucht.'
          : 'Ihr zuvor gewähltes Zeitfenster ist nicht mehr verfügbar (Bestellschluss überschritten).',
      );
    }
  }, [slots, cart.slotId, cart.fulfillment]);

  const shownDay = day ?? selectedSlot?.date ?? firstAvailableDay(slots) ?? slots?.[0]?.date ?? '';

  // ── Heute kein freies Fenster mehr (z. B. abends): nächstes freies Fenster vorschlagen und vormerken ──
  const [autoSlot, setAutoSlot] = useState<{ slotId: string; text: string } | null>(null);
  const autoSlotFor = useRef<string | null>(null);
  useEffect(() => {
    if (!slots || cart.slotId || autoSlotFor.current === cart.fulfillment) return;
    const own = slots.filter((s) => s.type === cart.fulfillment);
    if (!own.length) return;
    autoSlotFor.current = cart.fulfillment;
    const today = todayString();
    if (own.some((s) => s.date === today && s.available)) return;
    const next = own.find((s) => s.available);
    if (!next) return;
    const when = `${formatDate(next.date, 'relative')} ${next.start}–${next.end} Uhr`;
    cart.set({ slotId: next.id });
    setDay(next.date);
    setSlotNotice(null);
    setAutoSlot({
      slotId: next.id,
      text: `Heute ist keine ${cart.fulfillment === 'pickup' ? 'Abholung' : 'Lieferung'} mehr möglich – nächster freier Termin: ${when}.`,
    });
  }, [slots, cart.slotId, cart.fulfillment]);
  const autoSlotInfo = autoSlot && autoSlot.slotId === cart.slotId ? autoSlot.text : null;

  // ── Zahlart: nur erlaubte; Geschäftskunden mit Rechnungskauf standardmäßig „Rechnung“ ──
  const paymentDefaulted = useRef(false);
  useEffect(() => {
    if (!quote) return;
    if (!paymentDefaulted.current && customer?.type === 'b2b') {
      paymentDefaulted.current = true;
      if (cart.paymentMethod === 'cash' && quote.paymentMethods.includes('invoice')) {
        cart.set({ paymentMethod: 'invoice' });
        return;
      }
    }
    if (quote.paymentMethods.length && !quote.paymentMethods.includes(cart.paymentMethod)) {
      cart.set({ paymentMethod: quote.paymentMethods[0] });
    }
  }, [quote?.paymentMethods, cart.paymentMethod, customer?.type]);

  // ── Gutschein: ungültige Codes wieder entfernen und Meldung am Feld zeigen ──
  useEffect(() => {
    if (!quoteSettled || !cart.couponCode) return;
    const err = quote?.errors.find((e) => e.code === 'coupon');
    if (err) {
      setCouponError(err.message);
      cart.set({ couponCode: undefined });
    }
  }, [quoteSettled, quote, cart.couponCode]);

  // ── Mobile Leiste ausblenden, solange der Button der Zusammenfassung sichtbar ist ──
  useEffect(() => {
    if (!summaryButton || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setSummaryButtonVisible(entry.isIntersecting), { rootMargin: '0px 0px -60px 0px' });
    io.observe(summaryButton);
    return () => io.disconnect();
  }, [summaryButton]);

  const hasRental = useMemo(() => cart.items.some((i) => products.get(i.productId)?.isRental), [cart.items, products]);
  const hasEventItems = useMemo(
    () => cart.items.some((i) => {
      const p = products.get(i.productId);
      return !!p && (p.isRental || p.material === 'fass');
    }),
    [cart.items, products],
  );
  // Festangaben zurücksetzen, wenn keine Fest-Artikel (mehr) im Warenkorb sind
  useEffect(() => {
    if (products.size && !hasEventItems && (cart.eventDate || cart.commission)) cart.set({ eventDate: undefined, commission: false });
  }, [hasEventItems, products.size]);

  const itemCount = cart.items.reduce((s, i) => s + i.qty, 0);

  const setFulfillment = useCallback(
    (v: FulfillmentType) => {
      if (v === cart.fulfillment) return;
      cart.set({ fulfillment: v, slotId: undefined, ...(v === 'pickup' ? { carryService: false } : {}) });
      setDay(null);
      setSlotNotice(null);
      setIssues((i) => ({ ...i, slot: undefined, address: undefined, addressMissing: undefined }));
    },
    [cart],
  );

  // ── Bestellen ──
  const validate = (): { section: string; issues: Issues } | null => {
    const next: Issues = {};
    const sections: string[] = [];
    const flag = (s: string) => sections.push(s);
    if (delivery) {
      if (isNewAddress) {
        const errs = validateDraft(draft);
        if (Object.keys(errs).length) {
          next.address = errs;
          flag('kasse-adresse');
        }
      } else if (!savedAddress) {
        next.addressMissing = 'Bitte wählen Sie eine Lieferadresse.';
        flag('kasse-adresse');
      }
      if (quote?.errors.some((e) => e.code === 'zone' || e.code === 'address')) flag('kasse-adresse');
    }
    if (!cart.slotId) {
      next.slot = delivery ? 'Bitte wählen Sie ein Lieferfenster.' : 'Bitte wählen Sie ein Abholfenster.';
      flag('kasse-zeitfenster');
    }
    if (quote?.errors.some((e) => e.code === 'empties')) flag('kasse-optionen');
    const rentalErr = quote?.errors.find((e) => e.code === 'rental_date');
    if (rentalErr) {
      next.eventDate = rentalErr.message;
      flag('kasse-optionen');
    }
    if (quote?.errors.length) flag('kasse-summe');
    if (!terms) {
      next.terms = 'Bitte bestätigen Sie die AGB und die Widerrufsbelehrung.';
      flag('kasse-agb');
    }
    if (!sections.length) return null;
    return { section: sections[0], issues: next };
  };

  const place = async () => {
    if (placing) return;
    setPlaceError(null);
    const problem = validate();
    setIssues(problem?.issues ?? {});
    if (problem) {
      scrollToSection(problem.section);
      return;
    }
    if (!quote) {
      toast.info('Die Preise werden gerade berechnet – einen Moment bitte.');
      return;
    }
    const input: CheckoutInput = cartToCheckoutInput(cart);
    if (isNewAddress) {
      delete input.addressId;
      input.address = draftToInput(draft);
    }
    setPlacing(true);
    try {
      const order = await api.placeOrder(input);
      placedRef.current = true;
      qc.setQueryData(qk.order(order.id), order);
      void qc.invalidateQueries({ queryKey: qk.orders });
      void qc.invalidateQueries({ queryKey: qk.customer });
      void qc.invalidateQueries({ queryKey: ['slots'] });
      if (isNewAddress && order.address?.id) cart.set({ addressId: order.address.id });
      navigate(`/bestellung/${order.id}?neu=1`, { replace: true });
      cart.clear();
    } catch (err) {
      const msg = errorMessage(err);
      const details = err instanceof ApiError ? (err.details as { slotId?: string } | undefined) : undefined;
      if (err instanceof ApiError && err.code === 'conflict' && (details?.slotId || /Zeitfenster|Bestellschluss/.test(msg))) {
        cart.set({ slotId: undefined });
        setSlotNotice(msg);
        void slotsQuery.refetch();
        scrollToSection('kasse-zeitfenster');
        toast.error('Zeitfenster nicht mehr verfügbar', { description: 'Bitte wählen Sie ein anderes Zeitfenster.' });
      } else {
        setPlaceError(msg);
        toast.error(msg);
        void quoteQuery.refetch();
        scrollToSection('kasse-summe');
      }
    } finally {
      setPlacing(false);
    }
  };

  // ── Zustände ──
  if (!cart.items.length && !placedRef.current) {
    return (
      <>
        <PageHeader title="Kasse" back="/warenkorb" />
        <Card padding="none">
          <EmptyState
            icon={ShoppingCart}
            title="Ihr Warenkorb ist leer"
            description="Legen Sie zuerst Getränke in den Warenkorb – danach wählen Sie hier Lieferung oder Abholung, Zeitfenster und Zahlart."
            action={
              <>
                <ButtonLink to="/sortiment" icon={LayoutGrid}>
                  Zum Sortiment
                </ButtonLink>
                <ButtonLink to="/warenkorb" variant="ghost" icon={ArrowLeft}>
                  Zum Warenkorb
                </ButtonLink>
              </>
            }
          />
        </Card>
      </>
    );
  }

  const header = (
    <PageHeader
      title="Kasse"
      back="/warenkorb"
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Nur noch wenige Angaben – dann ist Ihre Bestellung unterwegs.</span>
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-emerald-700">
            <ShieldCheck size={15} aria-hidden />
            Sichere Bestellung
          </span>
        </span>
      }
    />
  );

  if (customerQuery.isLoading || !customer) {
    return (
      <>
        {header}
        {customerQuery.error ? (
          <Card>
            <ErrorState error={customerQuery.error} onRetry={() => void customerQuery.refetch()} />
          </Card>
        ) : (
          <CheckoutSkeleton />
        )}
      </>
    );
  }

  const methods = quote?.paymentMethods ?? FALLBACK_METHODS;
  const addressValue = isNewAddress ? NEW_ADDRESS : (cart.addressId ?? '');
  const addressComplete = delivery && (isNewAddress ? Object.keys(validateDraft(draft)).length === 0 : !!savedAddress) && !quote?.errors.some((e) => e.code === 'zone');
  let step = 1;
  const nextStep = () => ++step;

  const total = quote?.totals.total;
  const barHint = quote && quote.totals.deposit > 0 ? 'inkl. Pfand' : undefined;

  return (
    <>
      {header}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:gap-8">
        <div className="min-w-0 space-y-5">
          {/* 1 · Lieferart */}
          <StepCard id="kasse-lieferart" step={step} title="Lieferung oder Abholung?" complete>
            <RadioCards
              name="kasse-lieferart"
              aria-label="Lieferart wählen"
              value={cart.fulfillment}
              onChange={(v) => setFulfillment(v as FulfillmentType)}
              columns={2}
              options={[
                {
                  value: 'delivery',
                  icon: Truck,
                  title: 'Lieferung',
                  description: 'Bis an die Haustür – auf Wunsch mit Tragservice und Leergut-Mitnahme.',
                },
                {
                  value: 'pickup',
                  icon: ShoppingBag,
                  title: 'Abholung im Markt',
                  description: 'Click & Collect: Wir stellen alles bereit, Sie holen ohne Wartezeit ab.',
                  aside: <span className="text-[13px] font-semibold text-emerald-700">kostenlos</span>,
                },
              ]}
            />
            {!delivery ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <StoreInfo />
              </div>
            ) : null}
          </StepCard>

          {/* 2 · Adresse */}
          {delivery ? (
            <StepCard
              id="kasse-adresse"
              step={nextStep()}
              title="Lieferadresse"
              subtitle={isNewAddress ? 'Neue Adresse – wird nach der Bestellung in Ihrem Konto gespeichert.' : 'Wohin dürfen wir liefern?'}
              complete={addressComplete}
              invalid={!!issues.address || !!issues.addressMissing}
            >
              <AddressStep
                customer={customer}
                value={addressValue}
                onChange={(v) => {
                  setIssues((i) => ({ ...i, address: undefined, addressMissing: undefined }));
                  if (v === NEW_ADDRESS) setAddressMode('new');
                  else {
                    setAddressMode('saved');
                    cart.set({ addressId: v });
                  }
                }}
                draft={draft}
                onDraft={(patch) => {
                  setDraft((d) => ({ ...d, ...patch }));
                  if (issues.address) {
                    setIssues((i) => {
                      if (!i.address) return i;
                      const rest = { ...i.address };
                      for (const k of Object.keys(patch)) delete rest[k as keyof AddressErrors];
                      return { ...i, address: rest };
                    });
                  }
                }}
                errors={issues.address ?? {}}
                quote={quote}
                zipKnown={isNewAddress ? draftZipValid : !!savedAddress}
                onSwitchToPickup={() => {
                  setFulfillment('pickup');
                  scrollToSection('kasse-lieferart');
                }}
              />
              {issues.addressMissing ? <p className="mt-3 text-sm font-medium text-red-600">{issues.addressMissing}</p> : null}
            </StepCard>
          ) : null}

          {/* 3 · Zeitfenster */}
          <StepCard
            id="kasse-zeitfenster"
            step={nextStep()}
            title={delivery ? 'Lieferfenster wählen' : 'Abholfenster wählen'}
            subtitle={delivery ? 'Wir liefern Mo–Fr von 8 bis 20 Uhr, samstags bis 14 Uhr.' : 'Holen Sie Ihre Bestellung bequem zu Ihrer Wunschzeit ab.'}
            complete={!!selectedSlot}
            invalid={!!issues.slot}
          >
            <SlotStep
              type={cart.fulfillment}
              slots={slots}
              loading={slotsQuery.isLoading}
              error={slotsQuery.error}
              onRetry={() => void slotsQuery.refetch()}
              day={shownDay}
              onDay={setDay}
              value={cart.slotId}
              onChange={(id) => {
                cart.set({ slotId: id });
                setSlotNotice(null);
                setIssues((i) => ({ ...i, slot: undefined }));
              }}
              settings={settings}
              error2={issues.slot}
              notice={slotNotice}
              suggestion={autoSlotInfo}
            />
          </StepCard>

          {/* 4 · Optionen */}
          <StepCard
            id="kasse-optionen"
            step={nextStep()}
            title="Service & Hinweise"
            subtitle="Alles optional – außer dem Festdatum bei Leihartikeln."
            invalid={!!issues.eventDate || !!quote?.errors.some((e) => e.code === 'empties')}
          >
            <OptionsStep
              fulfillment={cart.fulfillment}
              customer={customer}
              settings={settings}
              depositTypes={depositTypes}
              address={isNewAddress ? { floor: draft.floor === '' ? undefined : Number(draft.floor), hasElevator: draft.hasElevator } : savedAddress}
              carryService={cart.carryService}
              onCarry={(v) => cart.set({ carryService: v })}
              empties={cart.emptiesReturn}
              onEmpties={(lines) => cart.set({ emptiesReturn: lines })}
              emptiesErrors={quote?.errors.filter((e) => e.code === 'empties').map((e) => e.message)}
              hasEventItems={hasEventItems}
              hasRental={hasRental}
              eventDate={cart.eventDate}
              onEventDate={(v) => {
                cart.set({ eventDate: v });
                setIssues((i) => ({ ...i, eventDate: undefined }));
              }}
              eventDateError={issues.eventDate}
              commission={cart.commission}
              onCommission={(v) => cart.set({ commission: v })}
              notes={cart.notes ?? ''}
              onNotes={(v) => cart.set({ notes: v })}
              reference={cart.reference ?? ''}
              onReference={(v) => cart.set({ reference: v })}
              costCenter={cart.costCenter ?? ''}
              onCostCenter={(v) => cart.set({ costCenter: v || undefined })}
            />
          </StepCard>

          {/* 5 · Zahlung */}
          <StepCard id="kasse-zahlung" step={nextStep()} title="Zahlungsart" complete={!!quote && methods.includes(cart.paymentMethod)}>
            <PaymentStep
              methods={methods}
              value={cart.paymentMethod}
              onChange={(m) => cart.set({ paymentMethod: m })}
              fulfillment={cart.fulfillment}
              customer={customer}
            />
          </StepCard>
        </div>

        <div className="min-w-0 lg:sticky lg:top-34 lg:-m-2 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:overscroll-contain lg:p-2">
          <SummaryPanel
            ref={setSummaryButton}
            quote={quote}
            updating={quoteQuery.isFetching}
            products={products}
            customer={customer}
            fulfillment={cart.fulfillment}
            slot={selectedSlot}
            itemCount={itemCount}
            couponCode={cart.couponCode}
            onCoupon={(code) => {
              setCouponError(null);
              cart.set({ couponCode: code });
            }}
            couponError={couponError}
            terms={terms}
            onTerms={(v) => {
              setTerms(v);
              if (v) setIssues((i) => ({ ...i, terms: undefined }));
            }}
            termsError={issues.terms}
            placing={placing}
            onPlace={() => void place()}
            placeError={placeError}
          />
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock size={13} aria-hidden />
            Ihre Daten werden verschlüsselt übertragen.
          </p>
        </div>
      </div>

      <MobileOrderBar total={total} hidden={summaryButtonVisible} placing={placing} onPlace={() => void place()} hint={barHint} />
    </>
  );
}
