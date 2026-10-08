/**
 * Automatische Tourenplanung mit Vorschau: Der Core berechnet einen Vorschlag
 * (`adminAutoPlanTours(date, { preview: true })`, speichert nichts), der Markt prüft
 * Touren je Fahrer, Stopps und Auslastung und übernimmt den Plan erst mit „Übernehmen“.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Info, RefreshCw, Sparkles } from 'lucide-react';
import type { Order, TourWithOrders } from '@shared/types';
import { formatDate, formatDistance, formatDuration } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { Avatar, Button, EmptyState, ErrorState, Modal, Notice, Skeleton } from '@/components/ui';
import { firstName, orderCrates } from '../model';
import { B2BIcon, CapacityBar, MiniStat } from './OrderBits';

export interface AutoPlanModalProps {
  open: boolean;
  onClose: () => void;
  date: string;
  /** ungeplante Lieferungen des Tages (für den Hinweis auf unbestätigte Aufträge) */
  unplanned: Order[];
  onApplied: (created: TourWithOrders[]) => void;
}

function PreviewTour({ tour, index }: { tour: TourWithOrders; index: number }) {
  const crates = tour.orders.reduce((s, o) => s + orderCrates(o), 0);
  const byId = new Map(tour.orders.map((o) => [o.id, o]));
  const color = tour.driver?.color ?? '#1d58a0';
  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="h-1" style={{ backgroundColor: color }} aria-hidden />
      <div className="flex items-start gap-3 px-4 pt-3">
        <Avatar name={tour.driver?.name ?? 'Fahrer'} color={color} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-slate-900">{tour.name || `Tour ${index + 1}`}</p>
          <p className="text-sm text-slate-500">
            {tour.driver?.name ?? 'Fahrer'}
            {tour.driver?.vehicle ? ` · ${tour.driver.vehicle}` : ''}
          </p>
        </div>
      </div>
      <div className="px-4 pt-3">
        <dl className="grid grid-cols-4 gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200/60">
          <MiniStat label="Start" value={tour.plannedStart ?? '–'} />
          <MiniStat label="Stopps" value={tour.stops.length} />
          <MiniStat label="Strecke" value={tour.route ? formatDistance(tour.route.distance) : '–'} />
          <MiniStat label="Fahrzeit" value={tour.route ? formatDuration(tour.route.duration) : '–'} />
        </dl>
        <CapacityBar crates={crates} capacity={tour.driver?.capacityCrates ?? 60} className="mt-3" />
      </div>
      <ol className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
        {tour.stops.map((s, i) => {
          const o = byId.get(s.orderId);
          return (
            <li key={s.orderId} className="flex items-start gap-3 px-4 py-2">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: color }}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-slate-900">
                  {o?.customerName ?? s.orderId}
                  {o ? <B2BIcon type={o.customerType} /> : null}
                </p>
                <p className="text-xs leading-snug text-slate-500">
                  {o ? `${o.number} · ` : ''}
                  {o?.address ? `${o.address.street}, ${o.address.zip} ${o.address.city.replace(' b. München', '')}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs leading-snug">
                <p className="font-semibold tabular-nums text-slate-800">{o ? `${o.slot.start}–${o.slot.end}` : ''}</p>
                <p className="tabular-nums text-slate-500">{o ? `${orderCrates(o)} Geb.` : ''}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

export function AutoPlanModal({ open, onClose, date, unplanned, onApplied }: AutoPlanModalProps) {
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ['autoPlanPreview', date],
    queryFn: () => api.adminAutoPlanTours(date, { preview: true }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const apply = useApiMutation(() => api.adminAutoPlanTours(date), {
    invalidate: [qk.admin],
    onSuccess: (created) => {
      void qc.removeQueries({ queryKey: ['autoPlanPreview'] });
      onApplied(created);
    },
  });

  const tours = preview.data ?? [];
  const plannedIds = new Set(tours.flatMap((t) => t.stops.map((s) => s.orderId)));
  const unconfirmed = unplanned.filter((o) => o.status === 'pending' && !plannedIds.has(o.id));
  const left = unplanned.filter((o) => o.status !== 'pending' && !plannedIds.has(o.id));
  const stops = tours.reduce((s, t) => s + t.stops.length, 0);
  const distance = tours.reduce((s, t) => s + (t.route?.distance ?? 0), 0);

  return (
    <Modal
      open={open}
      onClose={apply.isPending ? () => {} : onClose}
      size="xl"
      title="Touren automatisch planen"
      description={`Vorschlag für ${formatDate(date, 'long')} – erst mit „Übernehmen“ wird gespeichert.`}
      footer={
        <>
          <Button variant="ghost" icon={RefreshCw} onClick={() => void preview.refetch()} disabled={preview.isFetching || apply.isPending} className="sm:mr-auto">
            Neu berechnen
          </Button>
          <Button variant="outline" onClick={onClose} disabled={apply.isPending}>
            Verwerfen
          </Button>
          <Button icon={CalendarCheck} onClick={() => apply.mutate()} loading={apply.isPending} disabled={!tours.length || preview.isFetching}>
            {tours.length === 1 ? 'Tour übernehmen' : `${tours.length || ''} Touren übernehmen`.trim()}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Notice tone="info" icon={Info}>
          Eingeplant werden nur <strong>bestätigte</strong> Lieferaufträge ohne Tour, verteilt auf die Fahrer im Dienst.
          {unconfirmed.length ? (
            <>
              {' '}
              {unconfirmed.length === 1 ? '1 unbestätigter Auftrag bleibt' : `${unconfirmed.length} unbestätigte Aufträge bleiben`} ungeplant
              {` (${unconfirmed.map((o) => o.number).join(', ')})`} – bitte zuerst im Bestell-Board bestätigen.
            </>
          ) : null}
        </Notice>

        {preview.isLoading || (preview.isFetching && !preview.data) ? (
          <div className="grid gap-4 lg:grid-cols-2" aria-busy>
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        ) : preview.error ? (
          <ErrorState error={preview.error} onRetry={() => void preview.refetch()} className="py-6" />
        ) : !tours.length ? (
          <EmptyState
            icon={Sparkles}
            title="Nichts automatisch zu planen"
            description={
              unconfirmed.length
                ? 'Alle offenen Lieferungen dieses Tages sind noch unbestätigt. Bestätigen Sie sie im Bestell-Board und planen Sie dann erneut.'
                : 'Für diesen Tag gibt es keine bestätigten Lieferungen ohne Tour.'
            }
            className="py-8"
          />
        ) : (
          <>
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{tours.length === 1 ? '1 Tour' : `${tours.length} Touren`}</strong> mit {stops} {stops === 1 ? 'Stopp' : 'Stopps'} ·{' '}
              {formatDistance(distance)} Strecke gesamt · Fahrer: {[...new Set(tours.map((t) => (t.driver ? firstName(t.driver.name) : '–')))].join(', ')}
              {left.length ? <span className="text-amber-700"> · {left.length} weitere bleiben ungeplant</span> : null}
            </p>
            <ul className="grid items-start gap-4 lg:grid-cols-2">
              {tours.map((t, i) => (
                <PreviewTour key={t.id || i} tour={t} index={i} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
