import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CheckoutInput, DeliveryZone, OrderLine, Quote, QuoteMessage } from '@shared/types';
import { zoneForZip } from '@shared/core/geo';
import { computePrice, qk, useDepositTypes, useMyCustomer, useProductMap, useProducts, useQuote, useSettings } from '@/api/hooks';
import { cartToCheckoutInput, useCart } from '@/stores/cart';

/**
 * Fehlercodes aus api.quote, die im Warenkorb NICHT blockieren – Adresse, Liefergebiet, Zeitfenster,
 * Mindestbestellwert, Veranstaltungsdatum und Zahlart werden erst an der Kasse festgelegt.
 */
export const NON_BLOCKING_CODES = new Set(['address', 'zone', 'slot', 'min_order', 'rental_date', 'payment', 'fulfillment', 'credit_limit', 'empty']);
/** Fehler, die einer Position zugeordnet werden */
export const LINE_CODES = new Set(['stock', 'product']);

/** Warenkorb als CheckoutInput – stabil memoisiert (wichtig für die entprellte Preisberechnung) */
export function useCartInput(): CheckoutInput {
  const items = useCart((s) => s.items);
  const emptiesReturn = useCart((s) => s.emptiesReturn);
  const fulfillment = useCart((s) => s.fulfillment);
  const addressId = useCart((s) => s.addressId);
  const slotId = useCart((s) => s.slotId);
  const carryService = useCart((s) => s.carryService);
  const paymentMethod = useCart((s) => s.paymentMethod);
  const couponCode = useCart((s) => s.couponCode);
  const eventDate = useCart((s) => s.eventDate);
  const commission = useCart((s) => s.commission);
  const costCenter = useCart((s) => s.costCenter);
  return useMemo(
    () =>
      cartToCheckoutInput({ items, emptiesReturn, fulfillment, addressId, slotId, carryService, paymentMethod, couponCode, eventDate, commission, costCenter }),
    [items, emptiesReturn, fulfillment, addressId, slotId, carryService, paymentMethod, couponCode, eventDate, commission, costCenter],
  );
}

export interface CartQuoteState {
  input: CheckoutInput;
  quote: Quote | undefined;
  /** erste Berechnung läuft */
  loading: boolean;
  /** Neuberechnung läuft (altes Ergebnis wird noch angezeigt) */
  fetching: boolean;
  error: unknown;
  refetch: () => void;
  /** Position je Artikel: aus dem Quote, sonst lokal berechnet (sofortige Anzeige) */
  lineFor: (productId: string, qty: number) => OrderLine | undefined;
  /** blockierende Fehler (Warenkorb), ohne Positionsfehler */
  blocking: QuoteMessage[];
  /** Positionsfehler (Bestand, nicht mehr erhältlich) */
  lineErrors: QuoteMessage[];
  couponError?: QuoteMessage;
  couponWarning?: QuoteMessage;
  /** sonstige Hinweise (z. B. Konto wird geprüft, Kreditlimit) */
  notes: QuoteMessage[];
  /** Liefergebiet: aus dem Quote, sonst aus der Standardadresse des Kunden */
  zone?: DeliveryZone;
  /** Warenwert brutto (für Mindestbestellwert/Gutschein) */
  itemsGross: number;
  showNet: boolean;
}

export function useCartQuote(): CartQuoteState {
  const input = useCartInput();
  const q = useQuote(input);
  const products = useProductMap();
  const depositTypes = useDepositTypes();
  const settings = useSettings();
  const { data: customer } = useMyCustomer();
  const quote = q.data && input.items.length ? q.data : undefined;

  // Preis-/Bestandsänderungen (Echtzeit: product.updated → Sortiment neu geladen) auch im Quote nachziehen
  const qc = useQueryClient();
  const { dataUpdatedAt } = useProducts();
  const lastUpdate = useRef(dataUpdatedAt);
  useEffect(() => {
    if (dataUpdatedAt && lastUpdate.current && dataUpdatedAt !== lastUpdate.current) {
      void qc.invalidateQueries({ queryKey: qk.quote(null).slice(0, 1) });
    }
    lastUpdate.current = dataUpdatedAt;
  }, [dataUpdatedAt, qc]);

  return useMemo(() => {
    const quoteLines = new Map((quote?.lines ?? []).map((l) => [l.productId, l]));
    const lineFor = (productId: string, qty: number): OrderLine | undefined => {
      const ql = quoteLines.get(productId);
      if (ql && ql.qty === qty) return ql;
      const p = products.get(productId);
      if (!p) return ql;
      return computePrice(p, customer ?? null, qty, depositTypes).price;
    };
    const errors = quote?.errors ?? [];
    const warnings = quote?.warnings ?? [];
    const lineErrors = errors.filter((e) => LINE_CODES.has(e.code));
    const couponError = errors.find((e) => e.code === 'coupon');
    const blocking = errors.filter((e) => !NON_BLOCKING_CODES.has(e.code) && !LINE_CODES.has(e.code) && e.code !== 'coupon');
    const couponWarning = warnings.find((w) => w.code === 'coupon');
    const notes = [...warnings.filter((w) => w.code !== 'coupon' && w.code !== 'slot'), ...errors.filter((e) => e.code === 'credit_limit')];

    let zone = quote?.zone;
    if (!zone && input.fulfillment === 'delivery' && customer) {
      const def = customer.addresses.find((a) => a.id === customer.defaultAddressId) ?? customer.addresses[0];
      zone = def ? zoneForZip(settings, def.zip) : undefined;
    }

    let itemsGross = quote?.totals.itemsGross ?? 0;
    if (!quote) {
      for (const i of input.items) {
        const l = lineFor(i.productId, i.qty);
        if (l) itemsGross += l.lineGross;
      }
    }
    return {
      input,
      quote,
      loading: q.isLoading && !quote,
      fetching: q.isFetching,
      error: q.isError ? q.error : null,
      refetch: () => void q.refetch(),
      lineFor,
      blocking,
      lineErrors,
      couponError,
      couponWarning,
      notes,
      zone,
      itemsGross,
      showNet: quote ? quote.customerType === 'b2b' : customer?.type === 'b2b',
    };
  }, [quote, q.isLoading, q.isFetching, q.isError, q.error, input, products, customer, depositTypes, settings]);
}
