/**
 * Zustellfoto: Kamera (Rückseite) öffnen, Bild im Browser verkleinern (compressImage), Vorschau.
 */
import { useRef, useState } from 'react';
import { Camera, RefreshCw, Trash2 } from 'lucide-react';
import { compressImage, dataUrlBytes } from '@/lib/image';
import { cn } from '@/lib/cn';
import { Button, Spinner, errorMessage, toast } from '@/components/ui';

export interface PhotoCaptureProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  className?: string;
}

function kb(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('de-DE')} KB`;
}

export function PhotoCapture({ value, onChange, disabled = false, className }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImage(file, 1280, 0.78);
      onChange(dataUrl);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Zustellfoto aufnehmen"
        data-testid="photo-input"
        onChange={(e) => void onFile(e.target.files?.[0])}
        disabled={disabled}
      />
      {value ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <img src={value} alt="Zustellfoto" className="max-h-72 w-full object-contain" />
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2">
            <span className="text-sm font-medium text-emerald-700">Foto erfasst · {kb(dataUrlBytes(value))}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" icon={RefreshCw} onClick={pick} disabled={disabled || busy}>
                Neu
              </Button>
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onChange(null)} disabled={disabled || busy} className="text-red-600 hover:bg-red-50">
                Entfernen
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={disabled || busy}
          className={cn(
            'flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-center transition-colors',
            'hover:border-brand-400 hover:bg-brand-50/40 active:bg-brand-50 disabled:opacity-60',
          )}
        >
          {busy ? <Spinner size={26} /> : <Camera size={28} aria-hidden className="text-brand-700" />}
          <span className="text-[15px] font-semibold text-slate-900">{busy ? 'Foto wird verarbeitet …' : 'Foto aufnehmen'}</span>
          <span className="text-sm text-slate-500">z. B. abgestellte Ware oder Lieferschein</span>
        </button>
      )}
    </div>
  );
}
