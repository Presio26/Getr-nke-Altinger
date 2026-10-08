import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClipboardList, Gauge, ListOrdered, Route, SearchX } from 'lucide-react';
import { formatDate, formatDistance, formatDuration, TOUR_STATUS_LABEL } from '@shared/format';
import { useDriverToday } from '@/api/hooks';
import { useMediaQuery, useNow } from '@/lib/hooks';
import { Badge, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, type BadgeTone } from '@/components/ui';
import { aggregateLoad, plural, tourStats } from './lib/driverUtils';
import { TourMap } from './components/TourMap';
import { StopsList } from './components/StopsList';
import { LoadList, useLoadChecks } from './components/LoadList';
import { TourOverview } from './components/TourOverview';
import { GpsShareCard, SimulationCard, SimulationMapBadge, TourActionCard } from './components/TourControls';

const TOUR_TONE: Record<string, BadgeTone> = { planned: 'brand', active: 'accent', completed: 'success' };
type TabId = 'stopps' | 'ladeliste' | 'uebersicht';

function TourSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-5 h-12 w-2/3" />
      <div className="lg:grid lg:grid-cols-2 lg:gap-6">
        <Skeleton className="-mx-4 h-[42vh] rounded-none sm:mx-0 sm:rounded-2xl lg:h-[560px]" />
        <div className="mt-4 space-y-3 lg:mt-0">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-11 w-full" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Fahrer-App: Tour mit Karte, Stopps, Ladeliste und Übersicht */
export default function TourPage() {
  const { tourId = '' } = useParams();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const roomy = useMediaQuery('(min-width: 480px)');
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error, refetch } = useDriverToday();
  const tour = data?.tours.find((t) => t.id === tourId);
  const loadChecks = useLoadChecks({ id: tourId, date: tour?.date ?? '' });
  const loadItems = useMemo(() => (tour ? aggregateLoad(tour) : []), [tour]);

  const tab = (['stopps', 'ladeliste', 'uebersicht'].includes(params.get('tab') ?? '') ? params.get('tab') : 'stopps') as TabId;
  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'stopps') next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  };

  if (isLoading) return <TourSkeleton />;
  if (error) {
    return (
      <>
        <PageHeader title="Tour" back="/fahrer" />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </>
    );
  }
  if (!tour) {
    return (
      <>
        <PageHeader title="Tour" back="/fahrer" />
        <Card>
          <EmptyState
            icon={SearchX}
            title="Tour nicht gefunden"
            description="Diese Tour ist Ihnen heute nicht (mehr) zugewiesen. Möglicherweise wurde sie vom Markt geändert."
            action={<ButtonLink to="/fahrer">Zur Tagesübersicht</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  const stats = tourStats(tour);
  const loadedDone = loadItems.filter((i) => loadChecks.checked.has(i.productId)).length;

  const subtitle = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={TOUR_TONE[tour.status]} solid={tour.status === 'active'}>
        {TOUR_STATUS_LABEL[tour.status]}
      </Badge>
      <span>
        {formatDate(tour.date, 'relative', now)} · {plural(stats.stops, 'Stopp', 'Stopps')}
        {tour.route ? ` · ${formatDistance(tour.route.distance)} · ${formatDuration(tour.route.duration)}` : ''}
        {tour.status === 'planned' && tour.plannedStart ? ` · Start ${tour.plannedStart} Uhr` : ''}
      </span>
    </span>
  );

  return (
    <div className="pb-14 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:pb-0">
      <PageHeader title={tour.name} subtitle={subtitle} back="/fahrer" className="mb-4 lg:col-span-2 lg:mb-0" />

      <div className="lg:sticky lg:top-24">
        <TourMap
          tour={tour}
          showVehicle={tour.status !== 'completed'}
          overlay={<SimulationMapBadge tour={tour} />}
          onStopClick={(orderId) => navigate(`/fahrer/stopp/${orderId}`)}
          className="-mx-4 h-[42vh] min-h-[260px] max-h-[440px] border-y border-slate-200 sm:mx-0 sm:rounded-2xl sm:border lg:h-[calc(100dvh-12rem)] lg:max-h-none"
        />
      </div>

      <div className="mt-4 space-y-4 lg:mt-0">
        <TourActionCard tour={tour} loadedInfo={{ done: loadedDone, total: loadItems.length }} onShowLoad={() => setTab('ladeliste')} />
        {tour.status === 'active' ? <GpsShareCard tour={tour} /> : null}

        <div>
          <Tabs
            aria-label="Tour-Ansicht"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'stopps', label: 'Stopps', icon: roomy ? ListOrdered : undefined, count: stats.stops },
              { id: 'ladeliste', label: 'Ladeliste', icon: roomy ? ClipboardList : undefined, count: loadItems.length },
              { id: 'uebersicht', label: 'Übersicht', icon: roomy ? Gauge : undefined },
            ]}
            className="mb-4"
          />
          <div role="tabpanel" aria-label={tab === 'stopps' ? 'Stopps' : tab === 'ladeliste' ? 'Ladeliste' : 'Übersicht'}>
            {tab === 'stopps' ? <StopsList tour={tour} /> : tab === 'ladeliste' ? <LoadList tour={tour} checked={loadChecks.checked} update={loadChecks.update} /> : <TourOverview tour={tour} />}
          </div>
        </div>

        <SimulationCard tour={tour} />
        {tour.route ? (
          <p className="flex items-center justify-center gap-1.5 pb-2 text-xs text-slate-400">
            <Route size={13} aria-hidden />
            Route ab Markt inkl. Rückfahrt · Kartendaten © OpenStreetMap
          </p>
        ) : null}
      </div>
    </div>
  );
}
