import type { DepositType, QuoteMessage } from '@shared/types';

/**
 * Leergut-Rückgabe gruppiert: ganze Kästen/Fässer (laufen über das Leergut-Konto) und lose
 * Einzelflaschen/-dosen (`DepositType.loose`, stückweise, ohne Kontoprüfung).
 */
export type EmptiesGroupId = 'crates' | 'loose';

export interface EmptiesGroup {
  id: EmptiesGroupId;
  title: string;
  hint: string;
  types: DepositType[];
}

/** Höchstmengen für die Stepper (der Core prüft zusätzlich: Konto bzw. MAX_LOOSE_QTY) */
export const EMPTIES_MAX = { crates: 99, loose: 500 } as const;

export function emptiesMax(type: DepositType): number {
  return type.loose ? EMPTIES_MAX.loose : EMPTIES_MAX.crates;
}

/** Alle Pfandarten, die bei Lieferung/Abholung zurückgegeben werden können */
export function returnableTypes(types: readonly DepositType[]): DepositType[] {
  return types.filter((t) => t.returnable);
}

export function groupEmpties(types: readonly DepositType[]): EmptiesGroup[] {
  const list = returnableTypes(types);
  const crates = list.filter((t) => !t.loose);
  const loose = list.filter((t) => t.loose).sort((a, b) => a.amount - b.amount);
  const groups: EmptiesGroup[] = [];
  if (crates.length) groups.push({ id: 'crates', title: 'Kästen & Fässer', hint: 'nur vollständige Kästen mit allen Flaschen', types: crates });
  if (loose.length) groups.push({ id: 'loose', title: 'Einzelflaschen', hint: 'lose Mehrweg- und Einwegflaschen, stückweise', types: loose });
  return groups;
}

/** Einheit je Pfandart („je Kasten“, „je Fass“, „je Flasche“, „je Stück“) */
export function emptiesUnit(type: DepositType): string {
  if (type.loose) {
    const text = `${type.name} ${type.shortName}`;
    return /flasche/i.test(text) && !/dose/i.test(text) ? 'je Flasche' : 'je Stück';
  }
  if (/fass/i.test(type.id) || /fass/i.test(type.shortName)) return 'je Fass';
  return 'je Kasten';
}

/**
 * Leergut-Fehler aus der Preisberechnung einer Pfandart zuordnen (Meldungen nennen den Kurznamen in „…“).
 * Rückgabe: Meldungen je Pfandart-ID und übrige (allgemeine) Meldungen.
 */
export function emptiesErrors(errors: readonly QuoteMessage[] | undefined, types: readonly DepositType[]): { byType: Map<string, string>; general: string[] } {
  const byType = new Map<string, string>();
  const general: string[] = [];
  for (const e of errors ?? []) {
    if (e.code !== 'empties') continue;
    const type = types.find((t) => e.message.includes(`„${t.shortName}“`) || e.message.includes(`× ${t.shortName} `) || e.message.includes(`× ${t.shortName}.`));
    if (type && !byType.has(type.id)) byType.set(type.id, e.message);
    else general.push(e.message);
  }
  return { byType, general };
}
