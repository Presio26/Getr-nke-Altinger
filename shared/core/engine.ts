/**
 * Interner Laufzeit-Kontext des Cores: Datenstand, Uhr, Provider, Ereignisse, Persistenz.
 * Wird von allen Handlern und dem Simulator geteilt.
 */
import type { Audience, RealtimeEvent } from '../types';
import type { Db } from './db';
import type { Geocoder, RoutingProvider } from './routing';
import { clone } from './util';

export interface Engine {
  /** aktueller Datenstand (nach replaceDb/resetDemo neu – daher immer frisch lesen, nie zwischenspeichern) */
  readonly db: Db;
  setDb(db: Db): void;
  now(): Date;
  readonly mode: 'remote' | 'local';
  readonly demoMode: boolean;
  readonly routing: RoutingProvider;
  readonly geocoder: Geocoder;
  /** Ereignis (als Kopie) verteilen; Fehler des Hosts werden abgefangen */
  emit(event: RealtimeEvent, audience: Audience): void;
  /** Datenstand speichern (Host entscheidet über Entprellung) */
  persist(): void;
  /** Zeitpunkt des letzten persist() (ms) */
  readonly lastPersistAt: number;
}

export interface EngineOptions {
  db: Db;
  mode: 'remote' | 'local';
  emit: (event: RealtimeEvent, audience: Audience) => void;
  persist: (db: Db) => void;
  now: () => Date;
  routing: RoutingProvider;
  geocoder: Geocoder;
  demoMode: boolean;
}

export function createEngine(options: EngineOptions): Engine {
  const state = { db: options.db, lastPersistAt: 0 };
  return {
    get db() {
      return state.db;
    },
    setDb(db: Db) {
      state.db = db;
    },
    now: () => options.now(),
    mode: options.mode,
    demoMode: options.demoMode,
    routing: options.routing,
    geocoder: options.geocoder,
    emit(event, audience) {
      try {
        options.emit(clone(event), audience);
      } catch (err) {
        console.error('[core] Ereignis konnte nicht verteilt werden:', err);
      }
    },
    persist() {
      state.lastPersistAt = Date.now();
      try {
        options.persist(state.db);
      } catch (err) {
        console.error('[core] Speichern fehlgeschlagen:', err);
      }
    },
    get lastPersistAt() {
      return state.lastPersistAt;
    },
  };
}
