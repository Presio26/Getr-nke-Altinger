import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react';
import type { AddressInput } from '@shared/types';
import { api } from '@/api/client';
import { qk } from '@/api/hooks';
import { useClickOutside, useDebouncedValue } from '@/lib/hooks';
import { Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Adresssuche mit Vorschlägen (api.searchAddress, entprellt) */
export function AddressAutocomplete({ onPick }: { onPick: (a: AddressInput) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = useDebouncedValue(q.trim(), 350);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const search = useQuery({
    queryKey: qk.addressSearch(term),
    queryFn: () => api.searchAddress(term),
    enabled: term.length >= 3,
    staleTime: 5 * 60_000,
  });
  const results = term.length >= 3 ? (search.data ?? []) : [];
  const typing = q.trim() !== term;
  const loading = search.isFetching || (typing && q.trim().length >= 3);

  const pick = (a: AddressInput) => {
    onPick(a);
    setQ('');
    setOpen(false);
    setActive(-1);
  };

  const showList = open && q.trim().length >= 3;

  return (
    <div ref={ref} className="relative">
      <Input
        label="Adresse suchen"
        icon={Search}
        value={q}
        placeholder="z. B. Mühlgasse 6, Garching"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls="kasse-adressvorschlaege"
        aria-autocomplete="list"
        hint="Vorschlag wählen – die Felder unten werden automatisch ausgefüllt."
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList || !results.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(results.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        suffix={loading ? <Spinner size={16} /> : null}
      />
      {showList ? (
        <div
          id="kasse-adressvorschlaege"
          role="listbox"
          className="absolute inset-x-0 top-[4.6rem] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop animate-fade-in"
        >
          {results.length ? (
            results.map((a, i) => (
              <button
                key={`${a.street}-${a.zip}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(a)}
                className={cn('flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{a.street || a.city}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {a.zip} {a.city}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3.5 py-3 text-sm text-slate-500">{loading ? 'Suche läuft …' : 'Keine Vorschläge gefunden – bitte füllen Sie die Felder unten aus.'}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
