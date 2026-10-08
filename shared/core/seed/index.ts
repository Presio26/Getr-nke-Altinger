/**
 * Demo-Datenbestand – deterministisch (mulberry32(42)) und relativ zu `now` erzeugt.
 */
import { todayString } from '../../time';
import { SCHEMA_VERSION, type Db } from '../db';
import { buildProducts, CATEGORIES, DEPOSIT_TYPES } from './catalog';
import { buildSettings } from './settings';
import { buildCustomers, buildDrivers, buildUsers, LAST_CUSTOMER_NUMBER } from './people';
import { buildSeedOrders } from './orders';
import { mulberry32 } from './prng';

export const SEED = 42;

export function createSeedDb(now: Date = new Date()): Db {
  const today = todayString(now);
  const rng = mulberry32(SEED);
  const settings = buildSettings();
  const categories = CATEGORIES.map((c) => ({ ...c }));
  const depositTypes = DEPOSIT_TYPES.map((d) => ({ ...d }));
  const products = buildProducts(today);
  const drivers = buildDrivers(now);
  const customers = buildCustomers(today, rng);
  const users = buildUsers(customers, today);
  const seeded = buildSeedOrders({ now, today, rng, settings, products, depositTypes, customers, drivers });

  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: now.toISOString(),
    seq: {
      order: seeded.lastOrderNumber,
      invoice: seeded.lastInvoiceSeq,
      customer: LAST_CUSTOMER_NUMBER,
      id: 1000,
    },
    settings,
    categories,
    depositTypes,
    products,
    users,
    sessions: {},
    customers,
    orders: seeded.orders,
    drivers,
    tours: seeded.tours,
    subscriptions: seeded.subscriptions,
    invoices: seeded.invoices,
    notifications: seeded.notifications,
    autoConfirm: [],
  };
}
