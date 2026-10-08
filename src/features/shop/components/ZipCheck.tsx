import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MapPin, Search, Store, XCircle } from 'lucide-react';
import type { DeliveryZone } from '@shared/types';
import { formatEuro } from '@shared/format';
import { api } from '@/api/client';
import { qk, useSettings } from '@/api/hooks';
import { Button, Spinner, errorMessage } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Gebühr/Mindestwert/frei-ab einer Zone als kurze Texte */
export function zoneTerms(zone: DeliveryZone) {
  const alwaysFree = zone.fee === 0;
  return {
    fee: alwaysFree ? 'kostenlos' : formatEuro(zone.fee),
    minOrder: formatEuro(zone.minOrder),
    freeFrom: alwaysFree ? 'immer' : zone.freeFrom > 0 ? formatEuro(zone.freeFrom) : '—',
    alwaysFree,
  };
}

/**
 * „Liefern wir zu Ihnen?“ – prüft die PLZ über api.checkZip und zeigt Zone, Gebühr,
 * Mindestbestellwert und ab wann die Lieferung kostenlos ist.
 */
export function ZipCheck({ className, compact = false, defaultZip = '' }: { className?: string; compact?: boolean; defaultZip?: string }) {
  const settings = useSettings();
  const [zip, setZip] = useState(defaultZip);
  const [checked, setChecked] = useState(/^\d{5}$/.test(defaultZip) ? defaultZip : '');
  const [hint, setHint] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.zip(checked),
    queryFn: () => api.checkZip(checked),
    enabled: checked.length === 5,
    staleTime: 10 * 60_000,
  });

  const submit = (value: string) => {
    const v = value.trim();
    if (!/^\d{5}$/.test(v)) {
      setHint('Bitte geben Sie eine fünfstellige Postleitzahl ein.');
      return;
    }
    setHint(null);
    setChecked(v);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(zip);
  };

  const examples = settings.zones.slice(0, 3).map((z) => z.zips[0]).filter(Boolean);

  return (
    <div className={className}>
      <form onSubmit={onSubmit} className="flex gap-2" noValidate>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Ihre Postleitzahl</span>
          <MapPin size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={zip}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 5);
              setZip(v);
              setHint(null);
              if (v.length === 5) submit(v);
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            enterKeyHint="search"
            placeholder="PLZ, z. B. 85748"
            aria-invalid={hint ? true : undefined}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base tabular-nums tracking-wide text-slate-900 shadow-xs placeholder:tracking-normal placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          />
        </label>
        <Button type="submit" icon={Search} className="h-12" loading={query.isFetching && !query.isSuccess}>
          Prüfen
        </Button>
      </form>

      <div aria-live="polite" className="mt-3">
        {hint ? <p className="text-sm font-medium text-red-600">{hint}</p> : null}
        {!hint && !checked ? (
          <p className="text-sm text-slate-500">
            Liefergebiete:{' '}
            {settings.zones.map((z, i) => (
              <span key={z.id}>
                {i ? ' · ' : ''}
                {z.name}
              </span>
            ))}
            {examples.length ? <span className="hidden sm:inline"> (z. B. {examples.join(', ')})</span> : null}
          </p>
        ) : null}
        {!hint && checked && query.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner size={14} /> Liefergebiet wird geprüft …
          </p>
        ) : null}
        {!hint && checked && query.isError ? <p className="text-sm font-medium text-red-600">{errorMessage(query.error)}</p> : null}
        {!hint && checked && query.isSuccess ? <ZipResult zip={checked} zone={query.data} compact={compact} /> : null}
      </div>
    </div>
  );
}

function ZipResult({ zip, zone, compact }: { zip: string; zone: DeliveryZone | null; compact: boolean }) {
  if (!zone) {
    return (
      <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950 animate-fade-in">
        <XCircle size={20} aria-hidden className="mt-px shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="font-semibold">PLZ {zip} liegt leider außerhalb unseres Liefergebiets.</p>
          <p className="mt-0.5 text-amber-900/85">
            Reservieren Sie online und holen Sie bequem im Markt ab – mit Click &amp; Collect liegt alles fertig für Sie bereit.{' '}
            <Link to="/markt" className="inline-flex items-center gap-1 font-semibold text-amber-950 underline decoration-amber-400 underline-offset-2">
              <Store size={14} aria-hidden /> Zum Markt
            </Link>
          </p>
        </div>
      </div>
    );
  }
  const t = zoneTerms(zone);
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 animate-fade-in">
      <p className="flex items-start gap-2 text-[15px] font-semibold text-emerald-900">
        <CheckCircle2 size={20} aria-hidden className="mt-px shrink-0 text-emerald-600" />
        <span>
          Ja, wir liefern zu Ihnen! <span className="font-medium text-emerald-800">PLZ {zip} · {zone.name}</span>
        </span>
      </p>
      <dl className={cn('mt-3 grid grid-cols-3 gap-2 text-center', compact && 'mt-2.5')}>
        <Term label="Gebühr" value={t.fee} highlight={t.alwaysFree} />
        <Term label="Mindestwert" value={t.minOrder} />
        <Term label="Gratis ab" value={t.freeFrom} highlight={t.alwaysFree} />
      </dl>
    </div>
  );
}

function Term({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2 ring-1 ring-emerald-100">
      <dt className="truncate text-xs font-medium text-slate-500">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-bold tabular-nums', highlight ? 'text-emerald-700' : 'text-slate-900')}>{value}</dd>
    </div>
  );
}
