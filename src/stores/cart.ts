/**
 * Warenkorb + Kassen-Eingaben (persistiert in localStorage "altinger.cart").
 * Preise berechnet ausschließlich der Core (`api.quote` bzw. `usePrice`) – hier stehen nur Mengen.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CheckoutInput, CheckoutItem, DayString, EmptiesLine, FulfillmentType, ID, PaymentMethod } from '@shared/types';

export const MAX_QTY = 999;

export interface CartData {
  items: CheckoutItem[];
  /** Leergut-Rückgabe */
  emptiesReturn: EmptiesLine[];
  fulfillment: FulfillmentType;
  slotId?: ID;
  addressId?: ID;
  carryService: boolean;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
  reference?: string;
  costCenter?: string;
  eventDate?: DayString;
  commission: boolean;
}

export interface CartState extends CartData {
  /** Menge erhöhen (Default +1) */
  add(productId: ID, qty?: number): void;
  /** Menge setzen; 0 entfernt den Artikel */
  setQty(productId: ID, qty: number): void;
  remove(productId: ID): void;
  /** Leergut-Rückgabe je Pfandart setzen; 0 entfernt */
  setEmpties(depositTypeId: ID, qty: number): void;
  /** beliebige Kassenfelder setzen */
  set(patch: Partial<CartData>): void;
  /** Warenkorb leeren (nach Bestellung). Behält Präferenzen: Lieferart, Adresse, Zahlart, Kostenstelle. */
  clear(): void;
  /** Anzahl Gebinde im Warenkorb */
  count(): number;
  /** Menge eines Artikels im Warenkorb */
  qtyOf(productId: ID): number;
}

const clampQty = (n: number) => Math.max(0, Math.min(MAX_QTY, Math.floor(Number.isFinite(n) ? n : 0)));

const INITIAL: CartData = {
  items: [],
  emptiesReturn: [],
  fulfillment: 'delivery',
  carryService: false,
  paymentMethod: 'cash',
  commission: false,
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      add(productId, qty = 1) {
        const items = get().items;
        const existing = items.find((i) => i.productId === productId);
        if (existing) {
          const next = clampQty(existing.qty + qty);
          set({ items: next ? items.map((i) => (i.productId === productId ? { ...i, qty: next } : i)) : items.filter((i) => i.productId !== productId) });
        } else {
          const next = clampQty(qty);
          if (next > 0) set({ items: [...items, { productId, qty: next }] });
        }
      },
      setQty(productId, qty) {
        const next = clampQty(qty);
        const items = get().items;
        if (next === 0) {
          set({ items: items.filter((i) => i.productId !== productId) });
        } else if (items.some((i) => i.productId === productId)) {
          set({ items: items.map((i) => (i.productId === productId ? { ...i, qty: next } : i)) });
        } else {
          set({ items: [...items, { productId, qty: next }] });
        }
      },
      remove(productId) {
        set({ items: get().items.filter((i) => i.productId !== productId) });
      },
      setEmpties(depositTypeId, qty) {
        const next = clampQty(qty);
        const lines = get().emptiesReturn.filter((l) => l.depositTypeId !== depositTypeId);
        set({ emptiesReturn: next ? [...lines, { depositTypeId, qty: next }] : lines });
      },
      set(patch) {
        set(patch);
      },
      clear() {
        const { fulfillment, addressId, paymentMethod, costCenter } = get();
        set({ ...INITIAL, fulfillment, addressId, paymentMethod, costCenter, slotId: undefined, couponCode: undefined, notes: undefined, reference: undefined, eventDate: undefined });
      },
      count() {
        return get().items.reduce((sum, i) => sum + i.qty, 0);
      },
      qtyOf(productId) {
        return get().items.find((i) => i.productId === productId)?.qty ?? 0;
      },
    }),
    {
      name: 'altinger.cart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): CartData => ({
        items: s.items,
        emptiesReturn: s.emptiesReturn,
        fulfillment: s.fulfillment,
        slotId: s.slotId,
        addressId: s.addressId,
        carryService: s.carryService,
        paymentMethod: s.paymentMethod,
        couponCode: s.couponCode,
        notes: s.notes,
        reference: s.reference,
        costCenter: s.costCenter,
        eventDate: s.eventDate,
        commission: s.commission,
      }),
    },
  ),
);

/** Anzahl Gebinde (reaktiv) – für Badges */
export function useCartCount(): number {
  return useCart((s) => s.items.reduce((sum, i) => sum + i.qty, 0));
}

/** Menge eines Artikels (reaktiv) */
export function useCartQty(productId: ID): number {
  return useCart((s) => s.items.find((i) => i.productId === productId)?.qty ?? 0);
}

/** Aktueller Warenkorb als CheckoutInput (für api.quote / api.placeOrder) */
export function cartToCheckoutInput(cart: CartData): CheckoutInput {
  const input: CheckoutInput = {
    items: cart.items.filter((i) => i.qty > 0),
    fulfillment: cart.fulfillment,
    emptiesReturn: cart.emptiesReturn.filter((l) => l.qty > 0),
    carryService: cart.fulfillment === 'delivery' ? cart.carryService : false,
    paymentMethod: cart.paymentMethod,
  };
  if (cart.fulfillment === 'delivery' && cart.addressId) input.addressId = cart.addressId;
  if (cart.slotId) input.slotId = cart.slotId;
  if (cart.couponCode?.trim()) input.couponCode = cart.couponCode.trim();
  if (cart.notes?.trim()) input.notes = cart.notes.trim();
  if (cart.reference?.trim()) input.reference = cart.reference.trim();
  if (cart.costCenter?.trim()) input.costCenter = cart.costCenter.trim();
  if (cart.eventDate) input.eventDate = cart.eventDate;
  if (cart.commission) input.commission = true;
  return input;
}
