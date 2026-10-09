/**
 * Formularzustand der Markt-Einstellungen: StoreSettings ⇄ Entwurf, Prüfung je Abschnitt (spiegelt die Core-Validierung).
 */
import type { Coupon, DeliveryZone, GeoPoint, StoreSettings } from '@shared/types';
import { HEX_RE, TIME_RE, ZIP_RE, euroInput, parseDecimalInput, parseEuro, parseIntInput } from '../lib';

export type SettingsTab = 'markt' | 'zeiten' | 'fenster' | 'gebiete' | 'regeln' | 'gutscheine' | 'fahrer' | 'demo';

export interface HoursDraft {
  closed: boolean;
  open: string;
  close: string;
}

export interface SlotDraft {
  key: string;
  weekday: number;
  start: string;
  end: string;
  capacity: string;
}

export interface ZoneDraft {
  key: string;
  id: string;
  name: string;
  zips: string[];
  fee: string;
  minOrder: string;
  freeFrom: string;
  color: string;
  center: GeoPoint;
  radiusKm: string;
}

export interface SettingsDraft {
  name: string;
  legalName: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  announcement: string;
  hours: HoursDraft[]; // Index = Wochentag (0 = Sonntag)
  deliverySlots: SlotDraft[];
  pickupSlots: SlotDraft[];
  zones: ZoneDraft[];
  orderCutoffMinutes: string;
  pickupCutoffMinutes: string;
  pickupHoldHours: string;
  carryServiceFee: string;
  loyaltyPointsPerEuro: string;
  coupons: Coupon[];
}

let seq = 0;
export function newKey(prefix = 'k'): string {
  seq += 1;
  return `${prefix}${seq}`;
}

export function fromSettings(s: StoreSettings): SettingsDraft {
  const hours: HoursDraft[] = [];
  for (let d = 0; d <= 6; d++) {
    const h = s.openingHours[d];
    hours.push(h ? { closed: false, open: h.open, close: h.close } : { closed: true, open: '08:00', close: '18:00' });
  }
  return {
    name: s.name,
    legalName: s.legalName,
    street: s.street,
    zip: s.zip,
    city: s.city,
    phone: s.phone,
    email: s.email,
    announcement: s.announcement ?? '',
    hours,
    deliverySlots: s.deliverySlots.map((t, i) => ({ key: `d${i}`, weekday: t.weekday, start: t.start, end: t.end, capacity: String(t.capacity) })),
    pickupSlots: s.pickupSlots.map((t, i) => ({ key: `p${i}`, weekday: t.weekday, start: t.start, end: t.end, capacity: String(t.capacity) })),
    zones: s.zones.map((z, i) => ({
      key: `z${i}`,
      id: z.id,
      name: z.name,
      zips: [...z.zips],
      fee: euroInput(z.fee),
      minOrder: euroInput(z.minOrder),
      freeFrom: euroInput(z.freeFrom),
      color: z.color,
      center: { ...z.center },
      radiusKm: String(Math.round(z.radiusM / 100) / 10).replace('.', ','),
    })),
    orderCutoffMinutes: String(s.orderCutoffMinutes),
    pickupCutoffMinutes: String(s.pickupCutoffMinutes ?? 30),
    pickupHoldHours: String(s.pickupHoldHours),
    carryServiceFee: euroInput(s.carryServiceFee),
    loyaltyPointsPerEuro: String(s.loyaltyPointsPerEuro),
    coupons: s.coupons.map((c) => ({ ...c })),
  };
}

/** Vergleichswert ohne technische Schlüssel */
export function draftSignature(d: SettingsDraft): string {
  const strip = <T extends { key: string }>(list: T[]) => list.map(({ key: _k, ...rest }) => rest);
  return JSON.stringify({ ...d, deliverySlots: strip(d.deliverySlots), pickupSlots: strip(d.pickupSlots), zones: strip(d.zones) });
}

export interface DraftValidation {
  /** Feldfehler, Schlüssel z. B. "name", "hours-1", "slot-d3", "zone-z1-zips" */
  errors: Record<string, string>;
  /** Anzahl Fehler je Reiter */
  byTab: Partial<Record<SettingsTab, number>>;
  /** Hinweise (blockieren nicht), z. B. überlappende Zeitfenster */
  warnings: Record<string, string>;
}

function add(v: DraftValidation, tab: SettingsTab, key: string, msg: string) {
  if (v.errors[key]) return;
  v.errors[key] = msg;
  v.byTab[tab] = (v.byTab[tab] ?? 0) + 1;
}

function slotChecks(v: DraftValidation, list: SlotDraft[], prefix: string) {
  for (const t of list) {
    const cap = parseIntInput(t.capacity);
    if (!TIME_RE.test(t.start) || !TIME_RE.test(t.end)) add(v, 'fenster', `${prefix}-${t.key}`, 'Bitte Uhrzeiten im Format HH:MM angeben.');
    else if (t.start >= t.end) add(v, 'fenster', `${prefix}-${t.key}`, 'Der Beginn muss vor dem Ende liegen.');
    else if (cap === null || cap < 0 || cap > 500) add(v, 'fenster', `${prefix}-${t.key}`, 'Kapazität: ganze Zahl von 0 bis 500.');
  }
  for (let d = 0; d <= 6; d++) {
    const day = list.filter((t) => t.weekday === d && TIME_RE.test(t.start) && TIME_RE.test(t.end)).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < day.length; i++) {
      if (day[i].start < day[i - 1].end) v.warnings[`${prefix}-${day[i].key}`] = `Überschneidet sich mit ${day[i - 1].start}–${day[i - 1].end} Uhr.`;
    }
  }
}

export function validateSettingsDraft(d: SettingsDraft): DraftValidation {
  const v: DraftValidation = { errors: {}, byTab: {}, warnings: {} };
  // Markt
  if (!d.name.trim()) add(v, 'markt', 'name', 'Bitte geben Sie den Marktnamen an.');
  if (!d.legalName.trim()) add(v, 'markt', 'legalName', 'Bitte geben Sie die Firmierung an.');
  if (!d.street.trim()) add(v, 'markt', 'street', 'Bitte geben Sie die Straße an.');
  if (!ZIP_RE.test(d.zip.trim())) add(v, 'markt', 'zip', 'Fünfstellige PLZ.');
  if (!d.city.trim()) add(v, 'markt', 'city', 'Bitte den Ort angeben.');
  if (!d.phone.trim()) add(v, 'markt', 'phone', 'Bitte eine Telefonnummer angeben.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) add(v, 'markt', 'email', 'Bitte eine gültige E-Mail-Adresse angeben.');
  if (d.announcement.length > 300) add(v, 'markt', 'announcement', 'Maximal 300 Zeichen.');
  // Öffnungszeiten
  d.hours.forEach((h, day) => {
    if (h.closed) return;
    if (!TIME_RE.test(h.open) || !TIME_RE.test(h.close)) add(v, 'zeiten', `hours-${day}`, 'Bitte Uhrzeiten im Format HH:MM angeben.');
    else if (h.open >= h.close) add(v, 'zeiten', `hours-${day}`, 'Die Öffnung muss vor der Schließung liegen.');
  });
  // Zeitfenster
  slotChecks(v, d.deliverySlots, 'slot');
  slotChecks(v, d.pickupSlots, 'slot');
  // Liefergebiete
  if (!d.zones.length) add(v, 'gebiete', 'zones', 'Ohne Liefergebiet kann nicht geliefert werden – bitte mindestens ein Gebiet anlegen.');
  const zipOwner = new Map<string, string>();
  for (const z of d.zones) {
    const label = z.name.trim() || 'Liefergebiet';
    if (!z.name.trim()) add(v, 'gebiete', `zone-${z.key}-name`, 'Bitte einen Namen angeben.');
    if (!z.zips.length) add(v, 'gebiete', `zone-${z.key}-zips`, 'Bitte mindestens eine PLZ angeben.');
    for (const zip of z.zips) {
      const other = zipOwner.get(zip);
      if (other && other !== z.key) add(v, 'gebiete', `zone-${z.key}-zips`, `PLZ ${zip} ist schon einem anderen Gebiet zugeordnet.`);
      zipOwner.set(zip, z.key);
    }
    for (const [field, text] of [
      ['fee', 'Liefergebühr'],
      ['minOrder', 'Mindestbestellwert'],
      ['freeFrom', 'Lieferfrei ab'],
    ] as const) {
      const c = parseEuro(z[field]);
      if (c === null || c < 0) add(v, 'gebiete', `zone-${z.key}-${field}`, `${text}: gültigen Betrag angeben.`);
    }
    if (!HEX_RE.test(z.color)) add(v, 'gebiete', `zone-${z.key}-color`, 'Hex-Farbe, z. B. #1D58A0.');
    const r = parseDecimalInput(z.radiusKm);
    if (r === null || r <= 0 || r > 100) add(v, 'gebiete', `zone-${z.key}-radiusKm`, `${label}: Radius zwischen 0,1 und 100 km.`);
  }
  // Regeln
  const int = (key: keyof SettingsDraft, max: number, msg: string) => {
    const n = parseIntInput(String(d[key]));
    if (n === null || n < 0 || n > max) add(v, 'regeln', key, msg);
  };
  int('orderCutoffMinutes', 1440, 'Ganze Minuten von 0 bis 1440.');
  int('pickupCutoffMinutes', 1440, 'Ganze Minuten von 0 bis 1440.');
  int('pickupHoldHours', 336, 'Ganze Stunden von 0 bis 336.');
  int('loyaltyPointsPerEuro', 100, 'Ganze Zahl von 0 bis 100.');
  const carry = parseEuro(d.carryServiceFee);
  if (carry === null || carry < 0) add(v, 'regeln', 'carryServiceFee', 'Bitte einen gültigen Betrag angeben.');
  // Gutscheine (im Dialog geprüft – hier nur Eindeutigkeit)
  const codes = new Set<string>();
  for (const c of d.coupons) {
    if (codes.has(c.code)) add(v, 'gutscheine', `coupon-${c.code}`, `Der Code ${c.code} ist doppelt vergeben.`);
    codes.add(c.code);
  }
  return v;
}

function sortSlots(list: SlotDraft[]) {
  return [...list]
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start.localeCompare(b.start))
    .map((t) => ({ weekday: t.weekday, start: t.start, end: t.end, capacity: parseIntInput(t.capacity) ?? 0 }));
}

function slugId(name: string): string {
  return `z-${name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

/** Entwurf → StoreSettings (setzt gültigen Entwurf voraus) */
export function toSettings(d: SettingsDraft, base: StoreSettings): StoreSettings {
  const openingHours: StoreSettings['openingHours'] = {};
  d.hours.forEach((h, day) => {
    openingHours[day] = h.closed ? null : { open: h.open, close: h.close };
  });
  const usedIds = new Set<string>();
  const zones: DeliveryZone[] = d.zones.map((z) => {
    let id = z.id || slugId(z.name);
    while (usedIds.has(id)) id = `${id}-2`;
    usedIds.add(id);
    return {
      id,
      name: z.name.trim(),
      zips: [...new Set(z.zips)],
      fee: parseEuro(z.fee) ?? 0,
      minOrder: parseEuro(z.minOrder) ?? 0,
      freeFrom: parseEuro(z.freeFrom) ?? 0,
      color: z.color.toLowerCase(),
      center: { ...z.center },
      radiusM: Math.round((parseDecimalInput(z.radiusKm) ?? 3) * 1000),
    };
  });
  const out: StoreSettings = {
    ...base,
    name: d.name.trim(),
    legalName: d.legalName.trim(),
    street: d.street.trim(),
    zip: d.zip.trim(),
    city: d.city.trim(),
    phone: d.phone.trim(),
    email: d.email.trim(),
    openingHours,
    deliverySlots: sortSlots(d.deliverySlots),
    pickupSlots: sortSlots(d.pickupSlots),
    zones,
    orderCutoffMinutes: parseIntInput(d.orderCutoffMinutes) ?? base.orderCutoffMinutes,
    pickupCutoffMinutes: parseIntInput(d.pickupCutoffMinutes) ?? base.pickupCutoffMinutes,
    pickupHoldHours: parseIntInput(d.pickupHoldHours) ?? base.pickupHoldHours,
    carryServiceFee: parseEuro(d.carryServiceFee) ?? base.carryServiceFee,
    loyaltyPointsPerEuro: parseIntInput(d.loyaltyPointsPerEuro) ?? base.loyaltyPointsPerEuro,
    coupons: d.coupons.map((c) => ({ ...c })),
  };
  const ann = d.announcement.trim();
  if (ann) out.announcement = ann;
  else delete out.announcement;
  return out;
}

/** Wochentage in Anzeige-Reihenfolge (Montag zuerst) */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
