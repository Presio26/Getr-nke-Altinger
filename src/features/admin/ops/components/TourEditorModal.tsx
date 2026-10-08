/**
 * Tour anlegen bzw. bearbeiten: Fahrer wählen, Name/Startzeit, Aufträge per Checkbox.
 */
import { useMemo, useState } from 'react';
import { Check, Save } from 'lucide-react';
import type { DayString, Driver, Order, TourWithOrders } from '@shared/types';
import { DRIVER_STATUS_LABEL, formatDate } from '@shared/format';
import { Avatar, Badge, Button, Input, Modal, Notice, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSaveTour } from '../api';
import { firstName, orderCrates } from '../model';
import { B2BTag, CapacityBar } from './OrderBits';

export interface TourEditorProps {
  open: boolean;
  onClose: () => void;
  date: DayString;
  drivers: Driver[];
  /** bestehende Tour (Bearbeiten) */
  tour?: TourWithOrders | null;
  /** ungeplante Lieferungen des Tages */
  unplanned: Order[];
  /** vorausgewählte Aufträge (neue Tour) */
  preselected?: string[];
  /** Touren des Tages (für Fahrer-Hinweise) */
  tours: TourWithOrders[];
  onSaved?: (tourId: string) => void;
}

export function TourEditorModal(props: TourEditorProps) {
  if (!props.open) return null;
  return <Editor {...props} />;
}

function Editor({ open, onClose, date, drivers, tour, unplanned, preselected, tours, onSaved }: TourEditorProps) {
  const save = useSaveTour();
  const isNew = !tour;
  const suggestedDriver = useMemo(() => {
    if (tour) return tour.driverId;
    const load = new Map<string, number>();
    for (const t of tours) if (t.status !== 'completed') load.set(t.driverId, (load.get(t.driverId) ?? 0) + 1);
    const avail = drivers.filter((d) => d.status !== 'off');
    return [...(avail.length ? avail : drivers)].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]?.id ?? '';
  }, [tour, tours, drivers]);
  const [driverId, setDriverId] = useState(suggestedDriver);
  const [name, setName] = useState(tour?.name ?? '');
  const [start, setStart] = useState(tour?.plannedStart ?? (preselected?.length ? unplanned.find((o) => preselected.includes(o.id))?.slot.start ?? '' : ''));
  const [selected, setSelected] = useState<string[]>(() => (tour ? tour.stops.map((s) => s.orderId) : (preselected ?? [])));
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const own = tour ? tour.orders : [];
    return [...own, ...unplanned.filter((o) => !own.some((x) => x.id === o.id))];
  }, [tour, unplanned]);
  const driver = drivers.find((d) => d.id === driverId);
  const crates = candidates.filter((o) => selected.includes(o.id)).reduce((s, o) => s + orderCrates(o), 0);
  const lockedDriver = tour?.status === 'active';
  const lockedStop = (o: Order) => !!tour && tour.status === 'active' && tour.stops.find((s) => s.orderId === o.id)?.status !== 'pending';

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    setError(null);
    if (!driverId) {
      setError('Bitte wählen Sie einen Fahrer.');
      return;
    }
    if (isNew && !selected.length) {
      setError('Bitte wählen Sie mindestens einen Auftrag für die Tour.');
      return;
    }
    // bestehende Reihenfolge beibehalten, neue Aufträge hinten anhängen
    const keep = tour ? tour.stops.map((s) => s.orderId).filter((id) => selected.includes(id)) : [];
    const added = selected.filter((id) => !keep.includes(id));
    save.mutate(
      {
        id: tour?.id,
        date: tour?.date ?? date,
        driverId,
        orderIds: [...keep, ...added],
        plannedStart: start || (tour?.plannedStart ? '' : undefined),
        ...(name.trim() ? { name: name.trim() } : {}),
      },
      {
        onSuccess: (t) => {
          toast.success(isNew ? `„${t.name}“ angelegt` : `„${t.name}“ gespeichert`, { description: `${t.stops.length} Stopps · Route berechnet` });
          onSaved?.(t.id);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={save.isPending ? () => {} : onClose}
      size="lg"
      title={isNew ? 'Neue Tour planen' : `${tour?.name} bearbeiten`}
      description={`${formatDate(tour?.date ?? date, 'long')} · Die Route wird nach dem Speichern automatisch berechnet.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Abbrechen
          </Button>
          <Button icon={Save} onClick={submit} loading={save.isPending}>
            {isNew ? 'Tour anlegen' : 'Speichern'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Fahrer</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {drivers.map((d) => {
              const active = d.id === driverId;
              const count = tours.filter((t) => t.driverId === d.id && t.status !== 'completed' && t.id !== tour?.id).length;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={lockedDriver && !active}
                  onClick={() => setDriverId(d.id)}
                  className={cn(
                    'relative flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-[border-color,box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-50',
                    active ? 'border-brand-600 bg-brand-50/40 shadow-[0_0_0_1px_var(--color-brand-600)]' : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  <Avatar name={d.name} color={d.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{d.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {d.capacityCrates} Geb. · {count ? `${count} ${count === 1 ? 'Tour' : 'Touren'}` : DRIVER_STATUS_LABEL[d.status]}
                    </span>
                  </span>
                  {active ? <Check size={16} aria-hidden className="shrink-0 text-brand-700" /> : null}
                </button>
              );
            })}
          </div>
          {lockedDriver ? <p className="mt-1.5 text-xs text-slate-500">Bei einer laufenden Tour kann der Fahrer nicht gewechselt werden.</p> : null}
          {driver?.status === 'off' ? <p className="mt-1.5 text-xs font-medium text-amber-700">{firstName(driver.name)} ist heute nicht im Dienst.</p> : null}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Input label="Name der Tour" value={name} onChange={(e) => setName(e.target.value)} placeholder={driver ? `automatisch, z. B. „Tour · ${firstName(driver.name)}“` : 'automatisch'} maxLength={80} />
          <Input label="Startzeit" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>

        <fieldset>
          <legend className="mb-2 flex w-full items-baseline justify-between gap-3 text-sm font-medium text-slate-700">
            <span>Aufträge</span>
            <span className="text-xs font-normal text-slate-500">
              {selected.length} ausgewählt · {crates} Gebinde
            </span>
          </legend>
          {candidates.length ? (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {candidates.map((o) => {
                const checked = selected.includes(o.id);
                const locked = lockedStop(o);
                return (
                  <li key={o.id}>
                    <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50', locked && 'cursor-not-allowed opacity-60')}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggle(o.id)}
                        className="h-5 w-5 shrink-0 cursor-pointer rounded-md border-slate-300 accent-brand-700"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                          <span className="tabular-nums text-slate-500">{o.number}</span>
                          <span className="truncate">{o.customerName}</span>
                          <B2BTag type={o.customerType} />
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {o.address ? `${o.address.street}, ${o.address.zip} ${o.address.city}` : '–'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-600">
                        <span className="block font-medium tabular-nums">
                          {o.slot.start}–{o.slot.end}
                        </span>
                        <span className="block tabular-nums text-slate-500">{orderCrates(o)} Geb.</span>
                      </span>
                      {tour?.orders.some((x) => x.id === o.id) ? <Badge tone="brand">in Tour</Badge> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Notice tone="info">Für diesen Tag gibt es keine offenen Lieferungen ohne Tour.</Notice>
          )}
        </fieldset>

        {driver ? <CapacityBar crates={crates} capacity={driver.capacityCrates} label={`Auslastung ${driver.vehicle.split('·')[0].trim()}`} /> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Modal>
  );
}
