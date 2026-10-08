/**
 * Markt-Dashboard: Bestellungen, Abholungen, Fahrer, Kunden, Leergut, Sortiment, Einstellungen,
 * Auswertungen, Rundschreiben.
 */
import { ApiError, type CoreHandlers } from '../../api';
import type {
  BusinessInfo,
  Customer,
  DeliveryZone,
  Driver,
  DriverStatus,
  OrderStatus,
  Product,
  SlotTemplate,
  StoreSettings,
} from '../../types';
import type { Engine } from '../engine';
import { nextId } from '../db';
import { actorLabel, findCustomer, findOrder, findProduct, publicSettings, requireAdmin } from '../access';
import { adminSetStatusOp } from '../lifecycle';
import { ORDER_TRANSITIONS } from '../orderOps';
import { addNotification, emitCustomer, emitDriver, emitProduct, notifyAdmin, notifyCustomer } from '../notify';
import { withInvoiceStatus } from '../invoices';
import { computeStats } from '../stats';
import { activeTourOf } from '../tourOps';
import { isInt, isNonEmptyString, publicUser, slugify, TIME_RE, ZIP_RE } from '../util';
import { isDayString } from '../../time';
import { formatDate, SEGMENT_LABEL, PRICE_GROUP_LABEL } from '../../format';

const DRIVER_STATUSES: DriverStatus[] = ['off', 'available', 'on_tour', 'break'];
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function text(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function cents(v: unknown, label: string): number {
  if (!isInt(v) || v < 0) throw new ApiError('validation', `${label}: bitte einen gültigen Betrag in Cent angeben.`);
  return v;
}

function validateSlots(list: unknown, label: string): SlotTemplate[] {
  if (!Array.isArray(list)) throw new ApiError('validation', `${label}: ungültige Zeitfenster.`);
  return list.map((t: Partial<SlotTemplate>) => {
    if (!t || !isInt(t.weekday) || t.weekday < 0 || t.weekday > 6) throw new ApiError('validation', `${label}: ungültiger Wochentag.`);
    if (!TIME_RE.test(String(t.start)) || !TIME_RE.test(String(t.end)) || String(t.start) >= String(t.end)) {
      throw new ApiError('validation', `${label}: Beginn muss vor dem Ende liegen (HH:MM).`);
    }
    if (!isInt(t.capacity) || t.capacity < 0 || t.capacity > 500) throw new ApiError('validation', `${label}: ungültige Kapazität.`);
    return { weekday: t.weekday, start: String(t.start), end: String(t.end), capacity: t.capacity };
  });
}

function validateSettings(input: StoreSettings, current: StoreSettings): StoreSettings {
  if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Einstellungen.');
  const name = text(input.name, 80);
  if (!name) throw new ApiError('validation', 'Bitte geben Sie den Marktnamen an.');
  const zones: DeliveryZone[] = (Array.isArray(input.zones) ? input.zones : []).map((z, i) => {
    const zips = (Array.isArray(z?.zips) ? z.zips : []).map((x) => String(x).trim()).filter((x) => ZIP_RE.test(x));
    if (!text(z?.name)) throw new ApiError('validation', `Liefergebiet ${i + 1}: bitte einen Namen angeben.`);
    if (!zips.length) throw new ApiError('validation', `Liefergebiet „${z.name}“: bitte mindestens eine gültige PLZ angeben.`);
    return {
      id: text(z.id, 40) || `z-${slugify(z.name)}`,
      name: text(z.name, 80),
      zips: [...new Set(zips)],
      fee: cents(z.fee, `Liefergebühr „${z.name}“`),
      minOrder: cents(z.minOrder, `Mindestbestellwert „${z.name}“`),
      freeFrom: cents(z.freeFrom, `Lieferfrei-ab „${z.name}“`),
      color: HEX_RE.test(String(z.color)) ? String(z.color) : '#1d58a0',
      center:
        z.center && Number.isFinite(z.center.lat) && Number.isFinite(z.center.lng) ? { lat: z.center.lat, lng: z.center.lng } : { ...current.location },
      radiusM: isInt(z.radiusM) && z.radiusM > 0 ? z.radiusM : 3000,
    };
  });
  const hours: StoreSettings['openingHours'] = {};
  for (let d = 0; d <= 6; d++) {
    const h = input.openingHours?.[d];
    if (!h) {
      hours[d] = null;
      continue;
    }
    if (!TIME_RE.test(h.open) || !TIME_RE.test(h.close) || h.open >= h.close) {
      throw new ApiError('validation', 'Öffnungszeiten: bitte gültige Zeiten (HH:MM, Öffnung vor Schließung) angeben.');
    }
    hours[d] = { open: h.open, close: h.close };
  }
  const nonNeg = (v: unknown, label: string, max = 100_000) => {
    if (!isInt(v) || v < 0 || v > max) throw new ApiError('validation', `${label}: ungültiger Wert.`);
    return v;
  };
  const coupons = (Array.isArray(input.coupons) ? input.coupons : []).map((c) => {
    const code = text(c?.code, 30).toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw new ApiError('validation', 'Gutscheincodes: 3–30 Zeichen (A–Z, 0–9, Bindestrich).');
    if (c.type !== 'percent' && c.type !== 'fixed') throw new ApiError('validation', `Gutschein ${code}: ungültige Art.`);
    if (!isInt(c.value) || c.value <= 0 || (c.type === 'percent' && c.value > 100)) throw new ApiError('validation', `Gutschein ${code}: ungültiger Wert.`);
    const out: StoreSettings['coupons'][number] = { code, description: text(c.description, 200), type: c.type, value: c.value, active: !!c.active };
    if (c.minOrder !== undefined && c.minOrder !== null) out.minOrder = cents(c.minOrder, `Gutschein ${code}`);
    if (c.validUntil) {
      if (!isDayString(c.validUntil)) throw new ApiError('validation', `Gutschein ${code}: ungültiges Datum.`);
      out.validUntil = c.validUntil;
    }
    if (c.b2cOnly) out.b2cOnly = true;
    return out;
  });
  if (new Set(coupons.map((c) => c.code)).size !== coupons.length) throw new ApiError('validation', 'Gutscheincodes müssen eindeutig sein.');
  const settings: StoreSettings = {
    name,
    legalName: text(input.legalName, 120) || current.legalName,
    street: text(input.street, 120) || current.street,
    zip: ZIP_RE.test(String(input.zip)) ? String(input.zip) : current.zip,
    city: text(input.city, 80) || current.city,
    phone: text(input.phone, 40) || current.phone,
    email: text(input.email, 120) || current.email,
    location:
      input.location && Number.isFinite(input.location.lat) && Number.isFinite(input.location.lng)
        ? { lat: input.location.lat, lng: input.location.lng }
        : { ...current.location },
    openingHours: hours,
    deliverySlots: validateSlots(input.deliverySlots, 'Lieferfenster'),
    pickupSlots: validateSlots(input.pickupSlots, 'Abholfenster'),
    zones,
    orderCutoffMinutes: nonNeg(input.orderCutoffMinutes, 'Bestellschluss Lieferung', 24 * 60),
    pickupHoldHours: nonNeg(input.pickupHoldHours, 'Reservierungsdauer', 24 * 14),
    carryServiceFee: cents(input.carryServiceFee, 'Tragservice'),
    loyaltyPointsPerEuro: nonNeg(input.loyaltyPointsPerEuro, 'Treuepunkte pro Euro', 100),
    coupons,
  };
  if (input.pickupCutoffMinutes !== undefined && input.pickupCutoffMinutes !== null) {
    settings.pickupCutoffMinutes = nonNeg(input.pickupCutoffMinutes, 'Bestellschluss Abholung', 24 * 60);
  }
  const announcement = text(input.announcement, 300);
  if (announcement) settings.announcement = announcement;
  return settings;
}

function validateProduct(e: Engine, input: Product, existing?: Product): Product {
  const name = text(input.name, 120);
  const brand = text(input.brand, 80);
  if (!name) throw new ApiError('validation', 'Bitte geben Sie eine Artikelbezeichnung an.');
  if (!e.db.categories.some((c) => c.id === input.categoryId)) throw new ApiError('validation', 'Bitte wählen Sie eine gültige Kategorie.');
  if (input.vatRate !== 7 && input.vatRate !== 19) throw new ApiError('validation', 'Der MwSt.-Satz muss 7 % oder 19 % betragen.');
  if (input.depositTypeId && !e.db.depositTypes.some((d) => d.id === input.depositTypeId)) throw new ApiError('validation', 'Unbekannte Pfandart.');
  const priceGross = cents(input.priceGross, 'Preis');
  if (!isInt(input.stock) || input.stock < 0) throw new ApiError('validation', 'Der Bestand muss eine ganze Zahl ≥ 0 sein.');
  if (!isInt(input.minStock) || input.minStock < 0) throw new ApiError('validation', 'Der Meldebestand muss eine ganze Zahl ≥ 0 sein.');
  if (!isInt(input.unitCount) || input.unitCount < 1) throw new ApiError('validation', 'Die Anzahl Einheiten muss mindestens 1 sein.');
  if (typeof input.unitVolumeL !== 'number' || !(input.unitVolumeL >= 0)) throw new ApiError('validation', 'Ungültiges Volumen.');
  const materials = ['glas', 'pet', 'dose', 'fass', 'tetra', 'sonstiges'];
  const p: Product = {
    id: existing?.id ?? '',
    sku: text(input.sku, 40) || existing?.sku || `AL-${Date.now().toString().slice(-6)}`,
    name,
    brand,
    categoryId: input.categoryId,
    description: text(input.description, 2000),
    packaging: text(input.packaging, 80),
    unitCount: input.unitCount,
    unitVolumeL: input.unitVolumeL,
    material: materials.includes(input.material) ? input.material : 'sonstiges',
    priceGross,
    vatRate: input.vatRate,
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map((t) => text(t, 30).toLowerCase()).filter(Boolean))] : [],
    stock: input.stock,
    minStock: input.minStock,
    active: input.active !== false,
    color: HEX_RE.test(String(input.color)) ? input.color : existing?.color ?? '#1d58a0',
    accent: HEX_RE.test(String(input.accent)) ? input.accent : existing?.accent ?? '#f2a900',
  };
  if (input.ean) p.ean = text(input.ean, 20);
  if (input.depositTypeId && !input.isRental) p.depositTypeId = input.depositTypeId;
  if (typeof input.alcoholPercent === 'number' && input.alcoholPercent >= 0 && input.alcoholPercent <= 100) p.alcoholPercent = input.alcoholPercent;
  if (input.offer) {
    if (!isInt(input.offer.priceGross) || input.offer.priceGross <= 0) throw new ApiError('validation', 'Angebot: ungültiger Preis.');
    if (!isDayString(input.offer.validUntil)) throw new ApiError('validation', 'Angebot: bitte ein Enddatum angeben.');
    p.offer = { priceGross: input.offer.priceGross, validUntil: input.offer.validUntil, ...(text(input.offer.label) ? { label: text(input.offer.label, 40) } : {}) };
  }
  if (Array.isArray(input.tierPrices) && input.tierPrices.length) {
    p.tierPrices = input.tierPrices
      .map((t) => {
        if (!isInt(t?.minQty) || t.minQty < 2 || !isInt(t.priceNet) || t.priceNet <= 0) throw new ApiError('validation', 'Staffelpreise: ungültige Werte.');
        return { minQty: t.minQty, priceNet: t.priceNet };
      })
      .sort((a, b) => a.minQty - b.minQty);
  }
  const origin = text(input.origin, 80);
  if (origin) p.origin = origin;
  if (input.isRental) p.isRental = true;
  if (typeof input.rating === 'number' && input.rating >= 1 && input.rating <= 5) p.rating = Math.round(input.rating * 10) / 10;
  const location = text(input.location, 40);
  if (location) p.location = location;
  return p;
}

function validateCustomer(e: Engine, input: Customer, existing?: Customer): Customer {
  if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Kundendaten.');
  const name = text(input.name, 120);
  if (!name) throw new ApiError('validation', 'Bitte geben Sie einen Namen an.');
  const type = input.type === 'b2b' ? 'b2b' : 'b2c';
  const balance: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.depositBalance ?? {})) {
    if (!e.db.depositTypes.some((d) => d.id === k)) continue;
    if (!isInt(v) || v < 0) throw new ApiError('validation', 'Leergut-Konto: nur ganze Zahlen ≥ 0.');
    if (v) balance[k] = v;
  }
  const addresses = Array.isArray(input.addresses) ? input.addresses : existing?.addresses ?? [];
  for (const a of addresses) {
    if (!a?.id || !text(a.street) || !ZIP_RE.test(String(a.zip)) || !Number.isFinite(a.lat) || !Number.isFinite(a.lng)) {
      throw new ApiError('validation', 'Ungültige Adresse im Kundendatensatz.');
    }
  }
  const c: Customer = {
    id: existing?.id ?? input.id ?? '',
    type,
    name,
    contactName: text(input.contactName, 120) || name,
    email: text(input.email, 120),
    phone: text(input.phone, 40),
    addresses: addresses.map((a) => ({ ...a })),
    favorites: Array.isArray(input.favorites) ? input.favorites.filter((f) => e.db.products.some((p) => p.id === f)) : existing?.favorites ?? [],
    loyaltyPoints: isInt(input.loyaltyPoints) && input.loyaltyPoints >= 0 ? input.loyaltyPoints : existing?.loyaltyPoints ?? 0,
    depositBalance: balance,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const def = input.defaultAddressId && addresses.some((a) => a.id === input.defaultAddressId) ? input.defaultAddressId : addresses[0]?.id;
  if (def) c.defaultAddressId = def;
  if (input.marketingOptIn !== undefined) c.marketingOptIn = !!input.marketingOptIn;
  const note = text(input.internalNote, 2000);
  if (note) c.internalNote = note;
  if (type === 'b2b') {
    const b = (input.b2b ?? existing?.b2b ?? {}) as Partial<BusinessInfo>;
    const segments = Object.keys(SEGMENT_LABEL);
    const groups = Object.keys(PRICE_GROUP_LABEL);
    const pct = Number(b.discountPercent ?? 0);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new ApiError('validation', 'Der Rabatt muss zwischen 0 und 50 % liegen.');
    const terms = Number(b.paymentTermsDays ?? 14);
    if (!isInt(terms) || terms < 0 || terms > 120) throw new ApiError('validation', 'Das Zahlungsziel muss zwischen 0 und 120 Tagen liegen.');
    let customerNumber = text(b.customerNumber, 20) || existing?.b2b?.customerNumber;
    if (!customerNumber) {
      e.db.seq.customer += 1;
      customerNumber = `K-${e.db.seq.customer}`;
    }
    c.b2b = {
      companyName: text(b.companyName, 120) || name,
      segment: segments.includes(String(b.segment)) ? (b.segment as BusinessInfo['segment']) : 'sonstiges',
      customerNumber,
      priceGroup: groups.includes(String(b.priceGroup)) ? (b.priceGroup as BusinessInfo['priceGroup']) : 'standard',
      discountPercent: Math.round(pct * 10) / 10,
      paymentTermsDays: terms,
      creditLimit: isInt(b.creditLimit) && b.creditLimit >= 0 ? b.creditLimit : 0,
      allowInvoice: !!b.allowInvoice,
      freeDelivery: !!b.freeDelivery,
      costCenters: Array.isArray(b.costCenters) ? [...new Set(b.costCenters.map((x) => text(x, 60)).filter(Boolean))] : [],
      status: b.status === 'active' || b.status === 'blocked' ? b.status : 'pending',
    };
    const vatId = text(b.vatId, 30);
    if (vatId) c.b2b.vatId = vatId;
    const manager = text(b.accountManager, 80);
    if (manager) c.b2b.accountManager = manager;
  }
  return c;
}

export function adminHandlers(
  e: Engine,
): Pick<
  CoreHandlers,
  | 'adminListOrders'
  | 'adminUpdateOrderStatus'
  | 'adminFindPickup'
  | 'adminListDrivers'
  | 'adminSaveDriver'
  | 'adminListCustomers'
  | 'adminGetCustomer'
  | 'adminSaveCustomer'
  | 'adminAdjustDeposit'
  | 'adminSaveProduct'
  | 'adminAdjustStock'
  | 'adminSaveSettings'
  | 'adminGetStats'
  | 'adminBroadcast'
> {
  return {
    adminListOrders(ctx, query) {
      requireAdmin(ctx);
      const q = query ?? {};
      const needle = typeof q.q === 'string' ? q.q.trim().toLowerCase() : '';
      const statuses = Array.isArray(q.status) && q.status.length ? new Set(q.status) : null;
      return e.db.orders
        .filter((o) => {
          if (statuses && !statuses.has(o.status)) return false;
          if (q.date && o.slot.date !== q.date) return false;
          if (q.fulfillment && o.fulfillment !== q.fulfillment) return false;
          if (q.customerId && o.customerId !== q.customerId) return false;
          if (needle) {
            const hay = [o.number, o.customerName, o.address?.street, o.address?.city, o.address?.zip, o.pickupCode, o.reference]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!hay.includes(needle)) return false;
          }
          return true;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    adminUpdateOrderStatus(ctx, orderId, status, note, emptiesCollected) {
      const user = requireAdmin(ctx);
      if (!Object.prototype.hasOwnProperty.call(ORDER_TRANSITIONS, status)) throw new ApiError('validation', 'Unbekannter Status.');
      const order = findOrder(e, orderId);
      const n = typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : undefined;
      adminSetStatusOp(e, order, status as OrderStatus, ctx.now, actorLabel(e, user), n, emptiesCollected);
      return order;
    },

    adminFindPickup(ctx, codeOrQr) {
      requireAdmin(ctx);
      const raw = typeof codeOrQr === 'string' ? codeOrQr.trim() : '';
      if (!raw) throw new ApiError('validation', 'Bitte geben Sie einen Abholcode ein oder scannen Sie den QR-Code.');
      const qr = /^ALTINGER:([^:]+):([A-Za-z0-9]+)$/i.exec(raw);
      let order;
      if (qr) {
        order = e.db.orders.find((o) => o.id === qr[1] && (o.pickupCode ?? '').toUpperCase() === qr[2].toUpperCase());
      } else {
        const code = raw.toUpperCase().replace(/\s+/g, '');
        order =
          e.db.orders.find((o) => o.fulfillment === 'pickup' && o.pickupCode === code) ??
          e.db.orders.find((o) => o.fulfillment === 'pickup' && o.number.toUpperCase() === code);
      }
      if (!order) throw new ApiError('not_found', 'Zu diesem Abholcode wurde keine Reservierung gefunden.');
      return order;
    },

    adminListDrivers(ctx) {
      requireAdmin(ctx);
      return [...e.db.drivers].sort((a, b) => a.name.localeCompare(b.name));
    },

    adminSaveDriver(ctx, input) {
      requireAdmin(ctx);
      if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Fahrerdaten.');
      const name = text(input.name, 80);
      if (!name) throw new ApiError('validation', 'Bitte geben Sie den Namen des Fahrers an.');
      if (!DRIVER_STATUSES.includes(input.status)) throw new ApiError('validation', 'Ungültiger Fahrerstatus.');
      const existing = input.id ? e.db.drivers.find((d) => d.id === input.id) : undefined;
      if (existing && activeTourOf(e, existing.id) && input.status === 'off') {
        throw new ApiError('conflict', 'Der Fahrer ist gerade auf Tour.');
      }
      const driver: Driver = {
        id: existing?.id ?? nextId(e.db, 'd'),
        name,
        phone: text(input.phone, 40),
        vehicle: text(input.vehicle, 80),
        color: HEX_RE.test(String(input.color)) ? input.color : existing?.color ?? '#2563eb',
        status: input.status,
        capacityCrates: isInt(input.capacityCrates) && input.capacityCrates > 0 ? input.capacityCrates : existing?.capacityCrates ?? 60,
      };
      if (existing?.position) driver.position = existing.position;
      if (existing) e.db.drivers[e.db.drivers.indexOf(existing)] = driver;
      else e.db.drivers.push(driver);
      emitDriver(e, driver);
      return driver;
    },

    adminListCustomers(ctx) {
      requireAdmin(ctx);
      return [...e.db.customers].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },

    adminGetCustomer(ctx, customerId) {
      requireAdmin(ctx);
      const customer = findCustomer(e, customerId);
      return {
        customer,
        orders: e.db.orders.filter((o) => o.customerId === customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        invoices: e.db.invoices
          .filter((i) => i.customerId === customer.id)
          .map((i) => withInvoiceStatus(i, ctx.now))
          .sort((a, b) => b.date.localeCompare(a.date)),
        subscriptions: e.db.subscriptions.filter((s) => s.customerId === customer.id),
        users: e.db.users.filter((u) => u.customerId === customer.id).map(publicUser),
      };
    },

    adminSaveCustomer(ctx, input) {
      requireAdmin(ctx);
      const existing = input?.id ? e.db.customers.find((c) => c.id === input.id) : undefined;
      const customer = validateCustomer(e, input, existing);
      if (!existing) {
        customer.id = nextId(e.db, 'c');
        customer.createdAt = ctx.now.toISOString();
        e.db.customers.push(customer);
      } else {
        e.db.customers[e.db.customers.indexOf(existing)] = customer;
      }
      const before = existing?.b2b?.status;
      const after = customer.b2b?.status;
      if (existing && before !== after && after === 'active') {
        notifyCustomer(
          e,
          customer.id,
          {
            title: 'Ihr Geschäftskundenkonto ist freigeschaltet',
            body: `Willkommen als Geschäftskunde! Ab sofort gelten Ihre Konditionen${customer.b2b?.discountPercent ? ` (${customer.b2b.discountPercent} % Rabatt)` : ''}${customer.b2b?.allowInvoice ? ' und Sie können auf Rechnung bestellen' : ''}.`,
            kind: 'system',
            link: '/business',
          },
          ctx.now,
        );
      } else if (existing && before !== after && after === 'blocked') {
        notifyCustomer(e, customer.id, { title: 'Geschäftskundenkonto gesperrt', body: `Bitte wenden Sie sich an den Markt: ${e.db.settings.phone}.`, kind: 'system' }, ctx.now);
      }
      emitCustomer(e, customer);
      return customer;
    },

    adminAdjustDeposit(ctx, customerId, depositTypeId, delta, note) {
      requireAdmin(ctx);
      const customer = findCustomer(e, customerId);
      const type = e.db.depositTypes.find((d) => d.id === depositTypeId);
      if (!type) throw new ApiError('validation', 'Unbekannte Leergut-Art.');
      if (!isInt(delta) || delta === 0) throw new ApiError('validation', 'Bitte geben Sie eine ganze Zahl ungleich 0 an.');
      const next = (customer.depositBalance[type.id] ?? 0) + delta;
      if (next < 0) throw new ApiError('validation', 'Das Leergut-Konto kann nicht negativ werden.');
      const balance = { ...customer.depositBalance };
      if (next) balance[type.id] = next;
      else delete balance[type.id];
      customer.depositBalance = balance;
      const n = text(note, 200);
      if (n) {
        const line = `${formatDate(ctx.now, 'short')}: Leergut ${type.shortName} ${delta > 0 ? '+' : ''}${delta} (${n})`;
        customer.internalNote = customer.internalNote ? `${customer.internalNote}\n${line}` : line;
      }
      emitCustomer(e, customer);
      return customer;
    },

    adminSaveProduct(ctx, input) {
      requireAdmin(ctx);
      if (!input || typeof input !== 'object') throw new ApiError('validation', 'Ungültige Artikeldaten.');
      const existing = input.id ? e.db.products.find((p) => p.id === input.id) : undefined;
      const product = validateProduct(e, input as Product, existing);
      if (existing) {
        e.db.products[e.db.products.indexOf(existing)] = product;
        if (existing.stock >= existing.minStock && product.stock < product.minStock) {
          notifyAdmin(e, { title: 'Meldebestand unterschritten', body: `${product.brand} ${product.name}: noch ${product.stock} auf Lager.`, kind: 'stock', link: `/admin/sortiment/${product.id}` }, ctx.now);
        }
      } else {
        let id = slugify(`${product.brand} ${product.name} ${product.packaging}`) || 'artikel';
        const base = id;
        for (let i = 2; e.db.products.some((p) => p.id === id); i++) id = `${base}-${i}`;
        product.id = id;
        e.db.products.push(product);
      }
      emitProduct(e, product);
      return product;
    },

    adminAdjustStock(ctx, productId, delta, reason) {
      requireAdmin(ctx);
      const p = findProduct(e, productId);
      if (!isInt(delta)) throw new ApiError('validation', 'Bitte geben Sie eine ganze Zahl an.');
      const next = p.stock + delta;
      if (next < 0) throw new ApiError('validation', `Der Bestand kann nicht negativ werden (aktuell ${p.stock}).`);
      const before = p.stock;
      p.stock = next;
      void reason;
      if (before >= p.minStock && next < p.minStock && !p.isRental) {
        notifyAdmin(e, { title: 'Meldebestand unterschritten', body: `${p.brand} ${p.name} (${p.packaging}): noch ${next} auf Lager, Meldebestand ${p.minStock}.`, kind: 'stock', link: `/admin/sortiment/${p.id}` }, ctx.now);
      }
      emitProduct(e, p);
      return p;
    },

    adminSaveSettings(ctx, input) {
      requireAdmin(ctx);
      const settings = validateSettings(input, e.db.settings);
      e.db.settings = settings;
      // alle ohne interne Gutscheine, danach vollständig an den Markt (kommt bei Admins zuletzt an)
      e.emit({ type: 'settings.updated', settings: publicSettings(settings) }, { all: true });
      e.emit({ type: 'settings.updated', settings }, { admin: true });
      return settings;
    },

    adminGetStats(ctx, days) {
      requireAdmin(ctx);
      return computeStats(e.db, days, ctx.now);
    },

    adminBroadcast(ctx, input) {
      requireAdmin(ctx);
      const title = text(input?.title, 120);
      const body = text(input?.body, 1000);
      if (!title || !body) throw new ApiError('validation', 'Bitte geben Sie Titel und Text an.');
      const audience = input.audience === 'b2c' || input.audience === 'b2b' ? input.audience : 'all';
      const link = isNonEmptyString(input.link) && input.link.startsWith('/') ? input.link.slice(0, 200) : undefined;
      let count = 0;
      for (const u of e.db.users) {
        if (u.role !== 'customer' && u.role !== 'business') continue;
        const c = e.db.customers.find((x) => x.id === u.customerId);
        if (!c) continue;
        if (audience !== 'all' && c.type !== audience) continue;
        addNotification(e, u.id, { title, body, kind: 'promo', ...(link ? { link } : {}) }, ctx.now);
        count++;
      }
      return count;
    },
  };
}
