/**
 * Sortiment, Preise, Gutscheine, Liefergebiet, Zeitfenster, Leihartikel, Adresssuche.
 * Öffentlich – Preise richten sich nach dem angemeldeten Kunden.
 */
import { ApiError, type CoreHandlers, type Ctx } from '../../api';
import type { CheckoutInput, Customer, Product } from '../../types';
import { todayString } from '../../time';
import type { Engine } from '../engine';
import { findProduct } from '../access';
import { calculateQuote, checkCoupon, findCoupon, rentalReserved } from '../pricing';
import { quoteContextFor } from '../orderOps';
import { findSlot, generateSlots, parseSlotId } from '../slots';
import { zoneForZip } from '../geo';
import { safeSearch } from '../routing';
import { DAY_RE } from '../util';

/** Kundendatensatz des angemeldeten Kunden (oder null für Gäste/Personal) */
export function ctxCustomer(e: Engine, ctx: Ctx): Customer | null {
  const u = ctx.user;
  if (!u || (u.role !== 'customer' && u.role !== 'business') || !u.customerId) return null;
  return e.db.customers.find((c) => c.id === u.customerId) ?? null;
}

const isAdmin = (ctx: Ctx) => ctx.user?.role === 'admin';

export function normalizeCheckoutInput(input: CheckoutInput | undefined | null): CheckoutInput {
  if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Bestelldaten.');
  return {
    ...input,
    items: Array.isArray(input.items) ? input.items : [],
    emptiesReturn: Array.isArray(input.emptiesReturn) ? input.emptiesReturn : [],
    carryService: !!input.carryService,
    fulfillment: input.fulfillment === 'pickup' ? 'pickup' : input.fulfillment === 'delivery' ? 'delivery' : input.fulfillment,
  };
}

export function catalogHandlers(
  e: Engine,
): Pick<CoreHandlers, 'listProducts' | 'getProduct' | 'validateCoupon' | 'checkZip' | 'listSlots' | 'quote' | 'rentalAvailability' | 'searchAddress'> {
  return {
    listProducts(ctx) {
      const list: Product[] = isAdmin(ctx) ? e.db.products : e.db.products.filter((p) => p.active);
      return [...list];
    },

    getProduct(ctx, productId) {
      const p = findProduct(e, productId);
      if (!p.active && !isAdmin(ctx)) throw new ApiError('not_found', 'Der Artikel wurde nicht gefunden.');
      return p;
    },

    validateCoupon(ctx, code, itemsGross) {
      const c = typeof code === 'string' ? code : '';
      if (!c.trim()) throw new ApiError('validation', 'Bitte geben Sie einen Gutscheincode ein.');
      const coupon = findCoupon(e.db.settings, c);
      const customer = ctxCustomer(e, ctx);
      const goods = Number.isFinite(itemsGross) ? Math.max(0, Math.round(itemsGross)) : 0;
      const check = checkCoupon(coupon, c, customer?.type ?? 'b2c', goods, todayString(ctx.now));
      if (!check.ok) throw new ApiError('validation', check.message);
      return coupon!;
    },

    checkZip(_ctx, zip) {
      const z = typeof zip === 'string' ? zip.trim() : '';
      if (!/^\d{5}$/.test(z)) return null;
      return zoneForZip(e.db.settings, z) ?? null;
    },

    listSlots(ctx, query) {
      if (!query || (query.type !== 'delivery' && query.type !== 'pickup')) {
        throw new ApiError('validation', 'Bitte geben Sie Lieferung oder Abholung an.');
      }
      return generateSlots(e.db.settings, e.db.orders, query, ctx.now);
    },

    quote(ctx, rawInput) {
      const input = normalizeCheckoutInput(rawInput);
      const customer = ctxCustomer(e, ctx);
      const quote = calculateQuote(input, quoteContextFor(e, customer, ctx.now));
      if (input.slotId) {
        const parsed = parseSlotId(input.slotId);
        const slot = parsed && parsed.type === input.fulfillment ? findSlot(e.db.settings, e.db.orders, input.slotId, ctx.now) : null;
        if (!slot) {
          quote.warnings.push({ code: 'slot', message: 'Das gewählte Zeitfenster ist nicht verfügbar. Bitte wählen Sie ein anderes.' });
        } else if (!slot.available) {
          quote.warnings.push({
            code: 'slot',
            message:
              slot.reason === 'Ausgebucht'
                ? 'Das gewählte Zeitfenster ist inzwischen ausgebucht. Bitte wählen Sie ein anderes.'
                : 'Für das gewählte Zeitfenster ist der Bestellschluss überschritten. Bitte wählen Sie ein späteres.',
          });
        }
      }
      return quote;
    },

    rentalAvailability(ctx, date) {
      if (typeof date !== 'string' || !DAY_RE.test(date)) throw new ApiError('validation', 'Bitte geben Sie ein gültiges Datum an.');
      void ctx;
      return e.db.products
        .filter((p) => p.isRental && p.active)
        .map((p) => ({
          productId: p.id,
          total: p.stock,
          available: Math.max(0, p.stock - rentalReserved(e.db.orders, p.id, date)),
        }));
    },

    async searchAddress(_ctx, query) {
      const q = typeof query === 'string' ? query.trim().slice(0, 120) : '';
      if (q.length < 3) return [];
      return safeSearch(e.geocoder, q);
    },
  };
}
