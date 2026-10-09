/**
 * Übersicht einer Tour: Strecke, Dauer, Fortschritt, Kassieren, Verlauf.
 */
import { CircleDollarSign, Gauge, ListChecks } from 'lucide-react';
import type { TourWithOrders } from '@shared/types';
import { addMinutesIso } from '@shared/time';
import { formatDistance, formatDuration, formatEuro, formatTime, TOUR_STATUS_LABEL } from '@shared/format';
import { Card, CardHeader, KeyValue, Timeline, type TimelineItem } from '@/components/ui';
import { currentStopIndex, payKind, tourStats } from '../lib/driverUtils';
import { ProgressBar } from './StopBits';

export function TourOverview({ tour }: { tour: TourWithOrders }) {
  const stats = tourStats(tour);
  const route = tour.route;
  const legs = route?.legs ?? [];
  const current = currentStopIndex(tour);
  const remainingM = legs.reduce((s, l, i) => (i >= (current === -1 ? tour.stops.length : current) ? s + l.distance : s), 0);
  const lastEta = [...tour.stops].reverse().find((s) => s.eta && (s.status === 'pending' || s.status === 'arrived'))?.eta;
  const returnLeg = legs[tour.stops.length];
  const backAt = tour.status !== 'completed' && lastEta && returnLeg ? addMinutesIso(lastEta, 4 + returnLeg.duration / 60) : undefined;

  const collectOrders = tour.orders.filter((o) => payKind(o.paymentMethod) === 'collect');

  const timeline: TimelineItem[] = [
    {
      title: 'Abfahrt am Markt',
      state: tour.startedAt ? 'done' : tour.status === 'planned' ? 'current' : 'done',
      time: tour.startedAt ? `${formatTime(tour.startedAt)} Uhr` : tour.plannedStart ? `geplant ${tour.plannedStart} Uhr` : undefined,
    },
    ...tour.stops.map((s, i): TimelineItem => {
      const order = tour.orders.find((o) => o.id === s.orderId);
      const state: TimelineItem['state'] =
        s.status === 'delivered' ? 'done' : s.status === 'failed' ? 'error' : i === current && tour.status === 'active' ? 'current' : 'upcoming';
      const time = s.doneAt ? `${formatTime(s.doneAt)} Uhr` : s.eta ? `ca. ${formatTime(s.eta)} Uhr` : undefined;
      return {
        title: `${i + 1}. ${order?.customerName ?? 'Stopp'}`,
        description: s.status === 'failed' && order?.failureReason ? `Fehlgeschlagen: ${order.failureReason}` : order?.address?.street,
        time,
        state,
      };
    }),
    {
      title: 'Rückkehr zum Markt',
      state: tour.status === 'completed' ? 'done' : current === -1 && tour.status === 'active' ? 'current' : 'upcoming',
      time: tour.finishedAt ? `${formatTime(tour.finishedAt)} Uhr` : backAt ? `ca. ${formatTime(backAt)} Uhr` : undefined,
    },
  ];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Fortschritt" subtitle={TOUR_STATUS_LABEL[tour.status]} icon={Gauge} />
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-3xl font-bold tabular-nums text-slate-900">{Math.round(stats.progress * 100)} %</span>
          <span className="text-sm font-medium text-slate-500">
            {stats.done} von {stats.stops} Stopps erledigt
          </span>
        </div>
        <ProgressBar value={stats.progress} tone={tour.status === 'completed' ? 'success' : 'accent'} />
        <KeyValue
          className="mt-4"
          items={[
            ['Gesamtstrecke', route ? formatDistance(route.distance) : '–'],
            ['Reine Fahrzeit', route ? formatDuration(route.duration) : '–'],
            ...(tour.status === 'active' ? ([['Reststrecke', formatDistance(remainingM)]] as [string, string][]) : []),
            ['Geplanter Start', tour.plannedStart ? `${tour.plannedStart} Uhr` : '–'],
            ...(tour.startedAt ? ([['Gestartet', `${formatTime(tour.startedAt)} Uhr`]] as [string, string][]) : []),
            ...(tour.finishedAt
              ? ([['Beendet', `${formatTime(tour.finishedAt)} Uhr`]] as [string, string][])
              : backAt
                ? ([['Zurück am Markt', `ca. ${formatTime(backAt)} Uhr`]] as [string, string][])
                : []),
            ['Zugestellt / fehlgeschlagen', `${stats.delivered} / ${stats.failed}`],
            ['Gebinde', `${stats.crates}${tour.driver ? ` von ${tour.driver.capacityCrates}` : ''}`],
            ['Leergut erwartet', `${stats.emptiesExpected} Gebinde`],
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Kassieren" subtitle={`${collectOrders.length} von ${tour.orders.length} Stopps zahlen bar oder mit EC-Karte`} icon={CircleDollarSign} />
        <KeyValue
          items={[
            ['Noch zu kassieren', <span className="text-lg font-bold">{formatEuro(stats.toCollect)}</span>],
            ['Bereits kassiert', formatEuro(stats.collected)],
            ['davon bar', formatEuro(stats.collectedCash)],
          ]}
        />
      </Card>

      <Card>
        <CardHeader title="Ablauf" icon={ListChecks} />
        <Timeline items={timeline} />
      </Card>
    </div>
  );
}
