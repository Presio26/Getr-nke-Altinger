import { useState } from 'react';
import { CalendarDays, Copy, Plus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { WEEKDAY_LABEL } from '@shared/format';
import { minutesToTime, timeToMinutes } from '@shared/time';
import { Button, Checkbox, IconButton, Input, Modal, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/cn';
import { parseIntInput, TIME_RE } from '../lib';
import { FormSection, TimeField } from '../ui';
import { WEEK_ORDER, newKey, type SlotDraft } from './settingsDraft';
import type { SectionProps } from './GeneralSections';

type Kind = 'deliverySlots' | 'pickupSlots';

function CopyDayModal({ from, onClose, onCopy }: { from: number | null; onClose: () => void; onCopy: (targets: number[]) => void }) {
  const [targets, setTargets] = useState<number[]>([]);
  const toggle = (d: number) => setTargets((t) => (t.includes(d) ? t.filter((x) => x !== d) : [...t, d]));
  return (
    <Modal
      open={from !== null}
      onClose={() => {
        setTargets([]);
        onClose();
      }}
      size="sm"
      title={from !== null ? `${WEEKDAY_LABEL[from]} übertragen` : ''}
      description="Die Zeitfenster der gewählten Tage werden durch die Fenster dieses Tages ersetzt."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            icon={Copy}
            disabled={!targets.length}
            onClick={() => {
              onCopy(targets);
              setTargets([]);
            }}
          >
            Übertragen
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-4">
        {WEEK_ORDER.filter((d) => d !== from).map((d) => (
          <Checkbox key={d} label={WEEKDAY_LABEL[d]} checked={targets.includes(d)} onChange={() => toggle(d)} />
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-sm">
        <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setTargets([1, 2, 3, 4, 5].filter((d) => d !== from))}>
          Mo–Fr
        </button>
        <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setTargets(WEEK_ORDER.filter((d) => d !== from))}>
          Alle Tage
        </button>
      </div>
    </Modal>
  );
}

/** Lieferfenster und Abholfenster: Vorlagen je Wochentag (Beginn, Ende, Kapazität) */
export function SlotsSection({ draft, update, v }: SectionProps) {
  const [kind, setKind] = useState<Kind>('deliverySlots');
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const list = draft[kind];
  const prefix = kind === 'deliverySlots' ? 'd' : 'p';

  const setList = (fn: (l: SlotDraft[]) => SlotDraft[]) => update((d) => ({ ...d, [kind]: fn(d[kind]) }));
  const patch = (key: string, p: Partial<SlotDraft>) => setList((l) => l.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const remove = (key: string) => setList((l) => l.filter((t) => t.key !== key));
  const addTo = (day: number) =>
    setList((l) => {
      const dayList = l.filter((t) => t.weekday === day && TIME_RE.test(t.end)).sort((a, b) => a.end.localeCompare(b.end));
      const last = dayList[dayList.length - 1];
      const len = kind === 'deliverySlots' ? 120 : 60;
      const start = last ? last.end : draft.hours[day] && !draft.hours[day].closed ? draft.hours[day].open : '08:00';
      const endMin = Math.min(timeToMinutes(start) + len, 23 * 60 + 59);
      return [...l, { key: newKey(prefix), weekday: day, start, end: minutesToTime(endMin), capacity: last?.capacity ?? (kind === 'deliverySlots' ? '8' : '12') }];
    });
  const copyDay = (from: number, targets: number[]) => {
    setList((l) => {
      const src = l.filter((t) => t.weekday === from);
      const rest = l.filter((t) => !targets.includes(t.weekday));
      const copies = targets.flatMap((day) => src.map((t) => ({ ...t, key: newKey(prefix), weekday: day })));
      return [...rest, ...copies];
    });
    setCopyFrom(null);
  };

  const totalCap = list.reduce((s, t) => s + (parseIntInput(t.capacity) ?? 0), 0);

  return (
    <FormSection
      title="Zeitfenster"
      subtitle="Wöchentliche Vorlagen – daraus entstehen die buchbaren Fenster an der Kasse"
      icon={CalendarDays}
      action={
        <SegmentedControl
          size="sm"
          aria-label="Art der Zeitfenster"
          value={kind}
          onChange={(k) => setKind(k as Kind)}
          options={[
            { value: 'deliverySlots', label: 'Lieferung', icon: Truck },
            { value: 'pickupSlots', label: 'Abholung', icon: ShoppingBag },
          ]}
        />
      }
    >
      <p className="mb-4 text-sm text-slate-500">
        {list.length} {kind === 'deliverySlots' ? 'Lieferfenster' : 'Abholfenster'} pro Woche · insgesamt {totalCap} Bestellungen Kapazität
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {WEEK_ORDER.map((day) => {
          const rows = list.filter((t) => t.weekday === day).sort((a, b) => a.start.localeCompare(b.start));
          const cap = rows.reduce((s, t) => s + (parseIntInput(t.capacity) ?? 0), 0);
          const closed = draft.hours[day]?.closed;
          return (
            <div key={day} className={cn('rounded-2xl border p-3 sm:p-4', rows.length ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50/50')}>
              <div className="mb-2 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{WEEKDAY_LABEL[day]}</p>
                  <p className="text-xs text-slate-500">
                    {rows.length ? `${rows.length} ${rows.length === 1 ? 'Fenster' : 'Fenster'} · Kapazität ${cap}` : closed ? 'Markt geschlossen · keine Fenster' : 'keine Fenster'}
                  </p>
                </div>
                {rows.length ? <IconButton icon={Copy} size="sm" label={`${WEEKDAY_LABEL[day]} auf andere Tage übertragen`} onClick={() => setCopyFrom(day)} /> : null}
                <Button size="sm" variant="secondary" icon={Plus} onClick={() => addTo(day)}>
                  Fenster
                </Button>
              </div>
              {rows.length ? (
                <>
                  <div className="mb-1 grid grid-cols-[4.75rem_0.5rem_4.75rem_minmax(0,1fr)_2.25rem] gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <span>Beginn</span>
                    <span />
                    <span>Ende</span>
                    <span>Kapazität</span>
                    <span />
                  </div>
                  <ul className="space-y-2">
                    {rows.map((t) => {
                      const err = v.errors[`slot-${t.key}`];
                      const warn = v.warnings[`slot-${t.key}`];
                      return (
                        <li key={t.key}>
                          <div className="grid grid-cols-[4.75rem_0.5rem_4.75rem_minmax(0,1fr)_2.25rem] items-center gap-2">
                            <TimeField aria-label="Beginn" value={t.start} onChange={(start) => patch(t.key, { start })} invalid={!!err} className="h-10 px-1" />
                            <span className="text-center text-slate-400">–</span>
                            <TimeField aria-label="Ende" value={t.end} onChange={(end) => patch(t.key, { end })} invalid={!!err} className="h-10 px-1" />
                            <Input
                              aria-label="Kapazität (Bestellungen)"
                              inputMode="numeric"
                              value={t.capacity}
                              onChange={(e) => patch(t.key, { capacity: e.target.value.replace(/[^\d]/g, '') })}
                              suffix={<span className="hidden text-xs sm:inline">Best.</span>}
                              className={cn('h-10 px-2.5 sm:pr-12', err && 'border-red-400')}
                              title="Maximale Anzahl Bestellungen in diesem Fenster"
                            />
                            <IconButton icon={Trash2} size="sm" label={`Fenster ${t.start}–${t.end} entfernen`} onClick={() => remove(t.key)} />
                          </div>
                          {err ? <p className="mt-1 text-xs font-medium text-red-600">{err}</p> : warn ? <p className="mt-1 text-xs font-medium text-amber-700">{warn}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <CopyDayModal from={copyFrom} onClose={() => setCopyFrom(null)} onCopy={(targets) => copyFrom !== null && copyDay(copyFrom, targets)} />
    </FormSection>
  );
}
