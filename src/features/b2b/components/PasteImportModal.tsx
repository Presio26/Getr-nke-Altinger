import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardPaste, ListChecks } from 'lucide-react';
import type { ID, Product } from '@shared/types';
import { Button, Modal, Notice, Textarea, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { mergePasteRows, parsePasteList } from '../lib/b2b';

const EXAMPLE = 'AL-10010;12\nAL-10260;8\nAL-10330;5';

export interface PasteImportModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  /** vorbelegter Text (z. B. aus Strg+V auf der Seite) */
  initialText?: string;
  onApply: (items: { productId: ID; qty: number }[]) => void;
}

/** „Art.-Nr.;Menge“ je Zeile einfügen → Vorschau → übernehmen */
export function PasteImportModal({ open, onClose, products, initialText, onApply }: PasteImportModalProps) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText(initialText ?? '');
  }, [open, initialText]);

  const rows = useMemo(() => parsePasteList(text, products), [text, products]);
  const valid = useMemo(() => mergePasteRows(rows), [rows]);
  const invalidCount = rows.filter((r) => r.error).length;
  const clipboardSupported = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  const readClipboard = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) {
        toast.info('Die Zwischenablage ist leer.');
        return;
      }
      setText(value);
    } catch {
      toast.info('Der Browser erlaubt keinen Zugriff auf die Zwischenablage – bitte fügen Sie mit Strg+V bzw. ⌘V ein.');
    }
  };

  const apply = () => {
    onApply(valid);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Aus Zwischenablage einfügen"
      description="Eine Zeile je Artikel im Format „Art.‑Nr.;Menge“ – z. B. direkt aus Excel oder Ihrem Warenwirtschaftssystem kopiert."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button icon={ListChecks} onClick={apply} disabled={!valid.length}>
            {valid.length ? `${valid.length} ${valid.length === 1 ? 'Position' : 'Positionen'} übernehmen` : 'Positionen übernehmen'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <label htmlFor="paste-list" className="text-sm font-medium text-slate-700">
              Bestellliste
            </label>
            {clipboardSupported ? (
              <Button variant="secondary" size="sm" icon={ClipboardPaste} onClick={() => void readClipboard()}>
                Aus Zwischenablage
              </Button>
            ) : null}
          </div>
          <Textarea
            id="paste-list"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={EXAMPLE}
            spellCheck={false}
            autoFocus
            data-autofocus
            className="font-mono text-[15px] tabular-nums"
            hint="Trennzeichen: Semikolon, Tabulator, Komma oder Leerzeichen. Art.-Nr. auch ohne „AL-“ oder als EAN."
          />
        </div>

        {rows.length ? (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-900">Vorschau</span>
              <span className="text-slate-500">
                {rows.length - invalidCount} von {rows.length} {rows.length === 1 ? 'Zeile' : 'Zeilen'} erkannt
              </span>
            </div>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {rows.map((r) => (
                <li key={`${r.line}-${r.raw}`} className={cn('flex items-center gap-3 px-3 py-2.5 text-sm', r.error && 'bg-red-50/50')}>
                  {r.error ? (
                    <AlertCircle size={18} aria-hidden className="shrink-0 text-red-500" />
                  ) : (
                    <CheckCircle2 size={18} aria-hidden className="shrink-0 text-emerald-600" />
                  )}
                  <span className="w-20 shrink-0 font-mono text-[13px] text-slate-500 sm:w-24">{r.product?.sku ?? r.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-medium', r.error && !r.product ? 'text-slate-500' : 'text-slate-900')}>
                      {r.product ? `${r.product.brand} ${r.product.name}` : `Zeile ${r.line}: „${r.raw}“`}
                    </span>
                    {r.error ? <span className="block text-[13px] font-medium text-red-600">{r.error}</span> : r.product ? <span className="block truncate text-[13px] text-slate-500">{r.product.packaging}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">{r.qty > 0 ? `${r.qty} ×` : '–'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-slate-500">Vorhandene Mengen dieser Artikel werden ersetzt; mehrfach genannte Artikel werden zusammengezählt.</p>
          </div>
        ) : (
          <Notice tone="brand" icon={ClipboardPaste} title="So geht’s">
            Kopieren Sie zwei Spalten (Artikelnummer und Menge) aus Ihrer Tabelle und fügen Sie sie oben ein. Unsere Artikelnummern finden Sie in der Bestellmatrix und auf
            jeder Rechnung.
          </Notice>
        )}
      </div>
    </Modal>
  );
}
