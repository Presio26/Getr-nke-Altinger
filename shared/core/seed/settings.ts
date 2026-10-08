/**
 * Markt-Einstellungen: Stammdaten, Öffnungszeiten, Zeitfenster, Liefergebiete, Gutscheine.
 */
import type { DeliveryZone, SlotTemplate, StoreSettings } from '../../types';

export const STORE_LOCATION = { lat: 48.2525161, lng: 11.6534043 };

function weekdays(days: number[], windows: [string, string][], capacity: number): SlotTemplate[] {
  const out: SlotTemplate[] = [];
  for (const weekday of days) for (const [start, end] of windows) out.push({ weekday, start, end, capacity });
  return out;
}

function hourly(from: number, to: number): [string, string][] {
  const out: [string, string][] = [];
  for (let h = from; h < to; h++) out.push([`${String(h).padStart(2, '0')}:00`, `${String(h + 1).padStart(2, '0')}:00`]);
  return out;
}

export const ZONES: DeliveryZone[] = [
  {
    id: 'z-garching',
    name: 'Garching & Hochbrück',
    zips: ['85748'],
    fee: 0,
    minOrder: 1500,
    freeFrom: 0,
    color: '#1d58a0',
    center: { lat: 48.2505, lng: 11.6470 },
    radiusM: 3200,
  },
  {
    id: 'z-nachbarorte',
    name: 'Nachbarorte',
    zips: ['85386', '85737', '85716', '85375', '85764'],
    fee: 490,
    minOrder: 3000,
    freeFrom: 7500,
    color: '#f2a900',
    center: { lat: 48.2690, lng: 11.6250 },
    radiusM: 8500,
  },
  {
    id: 'z-muenchen-nord',
    name: 'München-Nord',
    zips: ['80939', '80937', '80807', '80805', '80809'],
    fee: 790,
    minOrder: 5000,
    freeFrom: 12000,
    color: '#7c3aed',
    center: { lat: 48.1880, lng: 11.5900 },
    radiusM: 4200,
  },
];

export function buildSettings(): StoreSettings {
  return {
    name: 'Getränke Altinger',
    legalName: 'Getränke-Altinger GmbH',
    street: 'Freisinger Landstraße 19',
    zip: '85748',
    city: 'Garching b. München',
    phone: '089 3202562',
    email: 'info@getraenke-altinger.de',
    location: { ...STORE_LOCATION },
    openingHours: {
      0: null,
      1: { open: '07:30', close: '20:00' },
      2: { open: '07:30', close: '20:00' },
      3: { open: '07:30', close: '20:00' },
      4: { open: '07:30', close: '20:00' },
      5: { open: '07:30', close: '20:00' },
      6: { open: '07:30', close: '16:00' },
    },
    deliverySlots: [
      ...weekdays(
        [1, 2, 3, 4, 5],
        [
          ['08:00', '10:00'],
          ['10:00', '12:00'],
          ['12:00', '14:00'],
          ['14:00', '16:00'],
          ['16:00', '18:00'],
          ['18:00', '20:00'],
        ],
        8,
      ),
      ...weekdays(
        [6],
        [
          ['08:00', '10:00'],
          ['10:00', '12:00'],
          ['12:00', '14:00'],
        ],
        10,
      ),
    ],
    pickupSlots: [...weekdays([1, 2, 3, 4, 5], hourly(8, 20), 12), ...weekdays([6], hourly(8, 16), 12)],
    zones: ZONES.map((z) => ({ ...z, zips: [...z.zips], center: { ...z.center } })),
    orderCutoffMinutes: 90,
    pickupCutoffMinutes: 30,
    pickupHoldHours: 48,
    carryServiceFee: 390,
    loyaltyPointsPerEuro: 1,
    coupons: [
      {
        code: 'WILLKOMMEN10',
        description: '10 % Willkommensrabatt für Privatkunden ab 20 € Warenwert',
        type: 'percent',
        value: 10,
        minOrder: 2000,
        b2cOnly: true,
        active: true,
      },
      {
        code: 'FEST5',
        description: '5 € Rabatt auf Ihre Festbestellung ab 50 € Warenwert',
        type: 'fixed',
        value: 500,
        minOrder: 5000,
        active: true,
      },
      {
        code: 'GARCHING',
        description: '3 € Nachbarschaftsrabatt ab 25 € Warenwert',
        type: 'fixed',
        value: 300,
        minOrder: 2500,
        active: true,
      },
    ],
    announcement: 'Neu: Verfolgen Sie Ihre Lieferung live auf der Karte!',
  };
}
