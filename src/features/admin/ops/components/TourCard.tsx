/**
 * Tour-Karte der Disposition: Fahrer, Kennzahlen, Auslastung, Stopps in Reihenfolge
 * (Auf/Ab, Entfernen) und Aktionen (Bearbeiten, Optimieren, Simulation, Löschen).
 */
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Pencil,
  Play,
  Square,
  Store,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import type { Driver, Order, TourStop, TourWithOrders } from '@shared/types';
import { STOP_STATUS_LABEL, TOUR_STATUS_LABEL, formatDistance, formatDuration, formatTime } from '@shared/format';
import { Avatar, Badge, Button, Card, IconButton, Spinner } from '@/components/ui';
import { STOP_COLORS } from '@/components/map';
import { cn } from '@/lib/cn';
import { orderCrates } from '../model';
import { B2BIcon, CapacityBar, MiniStat } from './OrderBits';

export interface TourCardProps {
  tour: TourWithOrders;
  driver?: Driver;
  selected: boolean;
  /** lokale Reihenfolge (optimistisch, während gespeichert wird) */
  orderIds?: string[];
  saving?: boolean;
  busy?: 'optimize' | 'simulate' | 'stop' | 'delete' | null;
  onSelect: () => void;
  onMove: (orderId: string, dir: -1 | 1) => void;
  onRemove: (order: Order) => void;
  onEdit: () => void;
  onOptimize: () => void;
  onSimulate: () => void;
  onStopSimulation: () => void;
  onDelete: () => void;
}

/** ETA mit Hinweis, wenn sie außerhalb des gebuchten Lieferfensters liegt */
function EtaLabel({ eta, order }: { eta: string; order?: Order }) {
  const t = formatTime(eta);
  const late = !!order && t > order.slot.end;
  const early = !!order && t < order.slot.start;
  const title = late
    ? `Nach Ende des Lieferfensters (${order?.slot.start}–${order?.slot.end} Uhr)`
    : early
      ? `Vor Beginn des Lieferfensters (${order?.slot.start}–${order?.slot.end} Uhr)`
      : `Voraussichtliche Ankunft · Fenster ${order?.slot.start}–${order?.slot.end} Uhr`;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold tabular-nums', late ? 'text-red-600' : early ? 'text-amber-700' : 'text-slate-800')} title={title}>
      {late || early ? <AlertTriangle size={11} aria-hidden /> : <Clock size={11} aria-hidden className="text-slate-400" />}
      {t}
    </span>
  );
}

export function TourCard({
  tour,
  driver,
  selected,
  orderIds,
  saving = false,
  busy = null,
  onSelect,
  onMove,
  onRemove,
  onEdit,
  onOptimize,
  onSimulate,
  onStopSimulation,
  onDelete,
}: TourCardProps) {
  const byId = new Map(tour.orders.map((o) => [o.id, o]));
  const stopById = new Map(tour.stops.map((s) => [s.orderId, s]));
  const ids = orderIds ?? tour.stops.map((s) => s.orderId);
  const stops = ids.map((id) => stopById.get(id) ?? ({ orderId: id, status: 'pending' } as TourStop));
  const crates = tour.orders.reduce((s, o) => s + orderCrates(o), 0);
  const capacity = driver?.capacityCrates ?? tour.driver?.capacityCrates ?? 60;
  const sim = !!tour.simulation?.running;
  const completed = tour.status === 'completed';
  const editable = !completed && !sim;
  const done = tour.stops.filter((s) => s.status === 'delivered' || s.status === 'failed').length;
  const color = driver?.color ?? tour.driver?.color ?? '#1d58a0';
  const vehicle = driver?.vehicle ?? tour.driver?.vehicle;
  const lastOpen = [...tour.stops].reverse().find((s) => s.eta && s.status === 'pending');
  const backLeg = tour.route?.legs[tour.stops.length];
  const backAt = lastOpen?.eta && backLeg ? new Date(Date.parse(lastOpen.eta) + 4 * 60_000 + backLeg.duration * 1000).toISOString() : undefined;

  return (
    <Card
      padding="none"
      data-tour={tour.id}
      className={cn('overflow-hidden transition-[box-shadow,border-color]', selected ? 'border-brand-300 shadow-raised ring-2 ring-brand-500/25' : 'hover:border-slate-300')}
    >
      <div className="h-1" style={{ backgroundColor: color }} aria-hidden />
      <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 px-4 pb-3 pt-3.5 text-left" aria-pressed={selected}>
        <Avatar name={driver?.name ?? tour.driver?.name ?? 'Fahrer'} color={color} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900" title={tour.name}>
            {tour.name}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-slate-500">
            <span className="font-medium text-slate-600">{driver?.name ?? tour.driver?.name ?? 'Unbekannter Fahrer'}</span>
            {vehicle ? <span className="block truncate text-[13px]" title={vehicle}>{vehicle}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={tour.status === 'active' ? 'brand' : completed ? 'success' : 'neutral'} icon={completed ? CheckCircle2 : undefined}>
            {TOUR_STATUS_LABEL[tour.status]}
          </Badge>
          {sim ? (
            <Badge tone="accent" solid>
              Simulation {tour.simulation?.speedFactor}×
            </Badge>
          ) : null}
        </div>
      </button>

      <div className="px-4">
        <dl className="grid grid-cols-4 gap-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-200/60">
          <MiniStat label="Start" value={tour.startedAt ? formatTime(tour.startedAt) : tour.plannedStart ?? '–'} />
          <MiniStat label="Stopps" value={tour.status === 'planned' ? tour.stops.length : `${done}/${tour.stops.length}`} />
          <MiniStat label="Strecke" value={tour.route ? formatDistance(tour.route.distance) : '–'} />
          <MiniStat label="Fahrzeit" value={tour.route ? formatDuration(tour.route.duration) : '–'} />
        </dl>
        <CapacityBar crates={crates} capacity={capacity} className="mt-3" />
      </div>

      <ol className="mt-3 divide-y divide-slate-100 border-t border-slate-100" aria-label={`Stopps von ${tour.name}`}>
        {stops.map((s, i) => {
          const o = byId.get(s.orderId);
          const movable = editable && s.status === 'pending';
          const prevMovable = i > 0 && stops[i - 1].status === 'pending';
          const nextMovable = i < stops.length - 1 && stops[i + 1].status === 'pending';
          const current = tour.status === 'active' && tour.stops[tour.currentStopIndex]?.orderId === s.orderId;
          const address = o?.address ? `${o.address.street}, ${o.address.zip} ${o.address.city.replace(' b. München', '')}` : '–';
          return (
            <li key={s.orderId} className={cn('flex items-center gap-2.5 px-4 py-2.5', current && 'bg-accent-50/60')}>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white"
                style={{ backgroundColor: STOP_COLORS[s.status] }}
                title={STOP_STATUS_LABEL[s.status]}
              >
                {s.status === 'delivered' ? <CheckCircle2 size={14} aria-hidden /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {o ? (
                  <Link
                    to={`/admin/bestellungen/${o.id}`}
                    className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-900 hover:text-brand-700 hover:underline"
                    title={`${o.number} · ${o.customerName}`}
                  >
                    {o.customerName}
                    <B2BIcon type={o.customerType} />
                  </Link>
                ) : (
                  <span className="text-sm text-slate-400">Auftrag nicht gefunden</span>
                )}
                <p className="line-clamp-2 text-xs leading-snug text-slate-500" title={address}>
                  {address}
                </p>
              </div>
              <div className="w-[3.75rem] shrink-0 text-right leading-tight">
                {s.status === 'pending' && s.eta && !completed ? (
                  <EtaLabel eta={s.eta} order={o} />
                ) : s.status !== 'pending' ? (
                  <span className="text-[11px] font-semibold text-slate-600">{STOP_STATUS_LABEL[s.status]}</span>
                ) : null}
                <span className="block text-[11px] tabular-nums text-slate-400">{o ? `${orderCrates(o)} Geb.` : ''}</span>
              </div>
              {editable ? (
                <div className="flex shrink-0 items-center">
                  <IconButton icon={ArrowUp} label="Nach oben" size="sm" disabled={!movable || !prevMovable || saving} onClick={() => onMove(s.orderId, -1)} className="!h-8 !w-8" />
                  <IconButton icon={ArrowDown} label="Nach unten" size="sm" disabled={!movable || !nextMovable || saving} onClick={() => onMove(s.orderId, 1)} className="!h-8 !w-8" />
                  <IconButton
                    icon={X}
                    label="Aus Tour entfernen"
                    size="sm"
                    disabled={!movable || saving || !o}
                    onClick={() => o && onRemove(o)}
                    className="!h-8 !w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
        {!stops.length ? <li className="px-4 py-5 text-center text-sm text-slate-500">Noch keine Stopps – fügen Sie Aufträge hinzu.</li> : null}
      </ol>

      {stops.length ? (
        <div className="flex items-center gap-2.5 border-t border-dashed border-slate-200 px-4 py-2 text-xs text-slate-500">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <Store size={14} aria-hidden />
          </span>
          {saving ? (
            <span className="inline-flex items-center gap-2 font-medium">
              <Spinner size={14} /> Route wird neu berechnet …
            </span>
          ) : completed && tour.finishedAt ? (
            <span>Zurück am Markt um {formatTime(tour.finishedAt)} Uhr</span>
          ) : backAt ? (
            <span>
              Zurück am Markt ca. <strong className="font-semibold tabular-nums text-slate-700">{formatTime(backAt)} Uhr</strong>
            </span>
          ) : (
            <span>Rückfahrt zum Markt</span>
          )}
        </div>
      ) : null}

      {!completed ? (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          {editable ? (
            <>
              <Button size="sm" variant="outline" icon={Pencil} onClick={onEdit} block>
                Bearbeiten
              </Button>
              <Button size="sm" variant="outline" icon={Wand2} onClick={onOptimize} loading={busy === 'optimize'} disabled={tour.stops.length < 2 || saving} block>
                Optimieren
              </Button>
            </>
          ) : null}
          {sim ? (
            <Button size="sm" variant="secondary" icon={Square} onClick={onStopSimulation} loading={busy === 'stop'} block className="col-span-2">
              Simulation stoppen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={Play}
              onClick={onSimulate}
              loading={busy === 'simulate'}
              disabled={!tour.stops.length || saving}
              block
              className={tour.status === 'planned' ? undefined : 'col-span-2'}
            >
              Simulation starten
            </Button>
          )}
          {tour.status === 'planned' && !sim ? (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} loading={busy === 'delete'} block className="text-red-700 hover:bg-red-50 hover:text-red-800" aria-label="Tour löschen">
              Löschen
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
