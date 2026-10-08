/**
 * Download- und Druck-Helfer (Rechnungen, Ladelisten, CSV-Exporte).
 */

/** Blob als Datei herunterladen */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    downloadUrl(url, filename);
  } finally {
    // Safari braucht die URL noch einen Moment
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/** URL bzw. Data-URL als Datei herunterladen */
export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const downloadDataUrl = downloadUrl;

/** Text als Datei herunterladen */
export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV für deutsches Excel (Semikolon, Dezimalkomma, UTF-8 mit BOM).
 * @param rows erste Zeile = Spaltenüberschriften
 */
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function downloadCsv(rows: unknown[][], filename: string): void {
  downloadText(`﻿${toCsv(rows)}`, filename.endsWith('.csv') ? filename : `${filename}.csv`, 'text/csv;charset=utf-8');
}

/** Druckdialog öffnen (Druckansichten nutzen die Tailwind-Variante `print:`) */
export function printPage(): void {
  window.print();
}

/** Dateiname-tauglicher Text: "Rechnung RE-2026-00123" → "Rechnung-RE-2026-00123" */
export function safeFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
