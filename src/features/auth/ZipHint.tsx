import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Info } from 'lucide-react';
import { formatEuro } from '@shared/format';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { Spinner } from '@/components/ui';

/** Prüft die PLZ gegen die Liefergebiete und zeigt Gebühr/Mindestbestellwert */
export function ZipHint({ zip }: { zip: string }) {
  const valid = /^\d{5}$/.test(zip.trim());
  const { data, isFetching, isSuccess } = useQuery({
    queryKey: qk.zip(zip.trim()),
    queryFn: () => api.checkZip(zip.trim()),
    enabled: valid,
    staleTime: 10 * 60_000,
  });
  if (!valid) return null;
  if (isFetching && !isSuccess) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner size={14} /> Liefergebiet wird geprüft …
      </p>
    );
  }
  if (!isSuccess) return null;
  if (!data) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        Diese PLZ liegt außerhalb unseres Liefergebiets – Click &amp; Collect im Markt ist natürlich jederzeit möglich.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
      <span>
        Wir liefern zu Ihnen ({data.name}):{' '}
        {data.fee ? `Liefergebühr ${formatEuro(data.fee)}, ab ${formatEuro(data.freeFrom)} frei Haus` : 'Lieferung kostenlos'} · Mindestbestellwert{' '}
        {formatEuro(data.minOrder)}.
      </span>
    </p>
  );
}
