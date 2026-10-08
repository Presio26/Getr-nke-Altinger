/**
 * Kleine, umgebungsneutrale Helfer des Cores (Browser + Node).
 */
import type { User } from '../types';
import type { StoredUser } from './db';

/** Tiefe Kopie über JSON – Ergebnisse dürfen den internen Stand nie teilen. */
export function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function sumBy<T>(items: readonly T[], fn: (item: T) => number): number {
  let s = 0;
  for (const item of items) s += fn(item);
  return s;
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Zufallszahl-Bytes – kryptografisch, wenn verfügbar (Browser & Node ≥ 19) */
function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function randomString(length: number, alphabet: string): string {
  // Verwerfen statt Modulo-Verzerrung
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < limit) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Sitzungs-Token: 32 zufällige Zeichen [A-Za-z0-9] */
export function randomToken(length = 32): string {
  return randomString(length, TOKEN_ALPHABET);
}

/** Abholcode-Alphabet ohne verwechselbare Zeichen (kein I, O, 0, 1) */
export const PICKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomPickupCode(rnd?: () => number): string {
  if (!rnd) return randomString(6, PICKUP_CODE_ALPHABET);
  let code = '';
  for (let i = 0; i < 6; i++) code += PICKUP_CODE_ALPHABET[Math.floor(rnd() * PICKUP_CODE_ALPHABET.length)];
  return code;
}

/** "Getränke Altinger – Hell 0,5 l" → "getraenke-altinger-hell-0-5-l" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Nutzer ohne Passwort */
export function publicUser(user: StoredUser | User): User {
  const { id, role, name, email, phone, customerId, driverId, createdAt } = user;
  const out: User = { id, role, name, email, createdAt };
  if (phone !== undefined) out.phone = phone;
  if (customerId !== undefined) out.customerId = customerId;
  if (driverId !== undefined) out.driverId = driverId;
  return out;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ZIP_RE = /^\d{5}$/;

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
