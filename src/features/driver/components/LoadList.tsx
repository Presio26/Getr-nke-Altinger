/**
 * Ladeliste: alle Positionen der Tour je Artikel zusammengefasst, abhakbar (je Tour im
 * localStorage gespeichert), dazu das angekündigte Leergut.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, PackageCheck, Recycle, RotateCcw, Truck } from 'lucide-react';
import type { ID, TourWithOrders } from '@shared/types';
import { useDepositTypes, useProductMap } from '@/api/hooks';
import { readJson, writeJson } from '@/lib/storage';
import { cn } from '@/lib/cn';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { ProductImage } from '@/components/product';
import { aggregateEmpties, aggregateLoad } from '../lib/driverUtils';
import { ProgressBar } from './StopBits';

function storageKey(tour: Pick<TourWithOrders, 'id' | 'date'>) {
  return `altinger.driver.ladeliste.${tour.id}.${tour.date}`;
}

/** Abgehakte Artikel einer Tour (persistiert) */
export function useLoadChecks(tour: Pick<TourWithOrders, 'id' | 'date'>) {
  const key = storageKey(tour);
  const [checked, setChecked] = useState<Set<ID>>(() => new Set(readJson<ID[]>(key, [])));
  useEffect(() => {
    setChecked(new Set(readJson<ID[]>(key, [])));
  }, [key]);
  const update = useCallback(
    (next: Set<ID>) => {
      setChecked(next);
      writeJson(key, [...next]);
    },
    [key],
  );
  return { checked, update };
}

export function LoadList({ tour, checked, update }: { tour: TourWithOrders } & ReturnType<typeof useLoadChecks>) {
  const items = useMemo(() => aggregateLoad(tour), [tour]);
  const empties = useMemo(() => aggregateEmpties(tour), [tour]);
  const products = useProductMap();
  const depositTypes = useDepositTypes();
  const capacity = tour.driver?.capacityCrates;

  const total = items.reduce((s, i) => s + i.qty, 0);
  const loaded = items.filter((i) => checked.has(i.productId)).reduce((s, i) => s + i.qty, 0);
  const doneCount = items.filter((i) => checked.has(i.productId)).length;
  const allDone = items.length > 0 && doneCount === items.length;

  const toggle = (id: ID) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  if (!items.length) {
    return <EmptyState icon={PackageCheck} title="Keine Positionen" description="Diese Tour enthält noch keine Artikel." />;
  }

  const emptiesTotal = empties.reduce((s, e) => s + e.qty, 0);

  return (
    <div className="space-y-4">
      <Card padding="sm" className={cn(allDone && 'border-emerald-200 bg-emerald-50/60')}>
        <div className="flex items-center gap-3">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', allDone ? 'bg-emerald-600 text-white' : 'bg-brand-50 text-brand-700')}>
            {allDone ? <CheckCheck size={22} aria-hidden /> : <Truck size={22} aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-slate-900">{allDone ? 'Alles verladen' : `${doneCount} von ${items.length} Positionen verladen`}</p>
            <p className="text-sm text-slate-500">
              {loaded} von {total} Gebinden{capacity ? ` · Kapazität ${capacity}` : ''}
            </p>
          </div>
        </div>
        <ProgressBar value={items.length ? doneCount / items.length : 0} tone={allDone ? 'success' : 'brand'} className="mt-3" label="Verladen" />
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={CheckCheck}
            onClick={() => update(new Set(items.map((i) => i.productId)))}
            disabled={allDone}
            className="flex-1"
          >
            Alle abhaken
          </Button>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => update(new Set())} disabled={doneCount === 0} className="flex-1">
            Zurücksetzen
          </Button>
        </div>
      </Card>

      <ul className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card" aria-label="Ladeliste">
        {items.map((item) => {
          const on = checked.has(item.productId);
          const product = products.get(item.productId);
          return (
            <li key={item.productId} className="border-b border-slate-100 last:border-b-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(item.productId)}
                className={cn('flex w-full items-center gap-3 px-3 py-3 text-left transition-colors sm:px-4', on ? 'bg-emerald-50/50' : 'hover:bg-slate-50')}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                    on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white',
                  )}
                  aria-hidden
                >
                  {on ? <Check size={18} strokeWidth={3} /> : null}
                </span>
                {product ? (
                  <ProductImage product={product} size={44} className={cn('shrink-0', on && 'opacity-50')} />
                ) : (
                  <span className="h-11 w-11 shrink-0 rounded-lg bg-slate-100" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[15px] font-semibold leading-snug', on ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900')}>
                    {item.name}
                  </span>
                  <span className="block text-[13px] text-slate-500">{item.packaging}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {item.perStop.map((p) => (
                      <span key={p.stop} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                        Stopp {p.stop}: {p.qty}
                      </span>
                    ))}
                  </span>
                </span>
                <span className={cn('shrink-0 text-right text-2xl font-bold tabular-nums', on ? 'text-emerald-600' : 'text-slate-900')}>
                  {item.qty}
                  <span className="ml-0.5 text-sm font-semibold text-slate-400">×</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardHeader
          title="Erwartetes Leergut"
          subtitle={emptiesTotal ? `${emptiesTotal} Gebinde angekündigt – bitte Platz im Fahrzeug einplanen.` : 'Für diese Tour wurde kein Leergut angekündigt.'}
          icon={Recycle}
          className={emptiesTotal ? undefined : 'mb-0'}
        />
        {emptiesTotal ? (
          <ul className="divide-y divide-slate-100">
            {empties.map((e) => {
              const type = depositTypes.find((t) => t.id === e.depositTypeId);
              return (
                <li key={e.depositTypeId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900">{type?.shortName ?? e.depositTypeId}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {e.perStop.map((p) => (
                        <span key={p.stop} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                          Stopp {p.stop}: {p.qty}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="text-xl font-bold tabular-nums text-slate-900">{e.qty}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
