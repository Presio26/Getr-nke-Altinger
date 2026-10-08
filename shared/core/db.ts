/**
 * Datenbestand des Cores – ein JSON-serialisierbares Objekt.
 * Server: data/db.json · Local-Modus: localStorage("altinger-db-v1").
 */
import type {
  AppNotification,
  Category,
  Customer,
  DepositType,
  Driver,
  ID,
  ISODate,
  Invoice,
  Order,
  Product,
  StoreSettings,
  Subscription,
  Tour,
  User,
} from '../types';

export const SCHEMA_VERSION = 1;

export interface StoredUser extends User {
  /** Klartext ist für die Demo ausreichend – Produktion: Hash (bcrypt/argon2) */
  password: string;
}

export interface Db {
  schemaVersion: number;
  /** Zeitpunkt der Demo-Datenerzeugung */
  seededAt: ISODate;
  /** fortlaufende Zähler für menschenlesbare Nummern */
  seq: {
    order: number; // AL-24851
    invoice: number; // RE-2026-00123
    customer: number; // K-20117
    id: number; // für generische IDs
  };
  settings: StoreSettings;
  categories: Category[];
  depositTypes: DepositType[];
  products: Product[];
  users: StoredUser[];
  /** token → userId */
  sessions: Record<string, ID>;
  customers: Customer[];
  orders: Order[];
  drivers: Driver[];
  tours: Tour[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  notifications: AppNotification[];
  /**
   * Demo-Modus: neue Bestellungen, die der Core nach kurzer Zeit automatisch bestätigt
   * (abgearbeitet in Core.tick(), damit es auch nach einem Neustart weiterläuft).
   */
  autoConfirm?: { orderId: ID; at: ISODate }[];
}

/** Neue, eindeutige ID mit Präfix, z. B. nextId(db, 'o') → "o-1x7k2" */
export function nextId(db: Db, prefix: string): ID {
  db.seq.id += 1;
  return `${prefix}-${db.seq.id.toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}
