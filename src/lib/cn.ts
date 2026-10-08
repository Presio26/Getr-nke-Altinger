import { clsx, type ClassValue } from 'clsx';

/** Klassen zusammenführen (clsx) – kurzer Alias für die Komponenten. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
