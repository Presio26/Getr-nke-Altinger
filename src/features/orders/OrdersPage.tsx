import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardList, Clock, LayoutGrid, Package, Truck } from 'lucide-react';
import type { Order } from '@shared/types';
import { formatTime } from '@shared/format';
import { useMyOrders, useProductMap } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { OrderCard } from './components/OrderCard';
import { isActiveOrder } from './lib/orderStatus';
import { useReorder } from './lib/useReorder';
import { useEtaCountdown, useLiveTracking } from './lib/useLiveTracking';

type TabId = 'aktiv' | 'abgeschlossen';

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <div className="flex justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="mt-4 h-12 w-full rounded-xl" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-12 w-12 rounded-xl" />
        <Skeleton className="h-12 w-12 rounded-xl" />
      </div>
    </div>
  );
}

/** Hervorgehobene Live-Lieferung oben in der Liste */
function LiveBanner({ order }: { order: Order }) {
  const tracking = useLiveTracking(order.id);
  const eta = useEtaCountdown(tracking.data, tracking.dataUpdatedAt);
  const driver = tracking.data?.driver?.name.split(' ')[0];
  const arrived = !!order.arrivedAt || eta?.minutes === 0;
  return (
    <Link
      to={`/bestellung/${order.id}`}
      className="group relative mb-6 flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-4 text-white shadow-raised sm:p-5"
    >
      <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" aria-hidden />
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-accent-400/20" aria-hidden />
        <Truck size={24} aria-hidden className="text-accent-300" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-[0.14em] text-accent-300">Live · {order.number}</span>
        <span className="mt-0.5 block text-lg font-bold leading-tight">
          {arrived
            ? `${driver ?? 'Ihr Fahrer'} ist da!`
            : eta
              ? `Ankunft in ca. ${eta.minutes} Min.`
              : 'Ihre Lieferung ist unterwegs'}
        </span>
        <span className="mt-0.5 block truncate text-sm text-white/70">
          {arrived
            ? 'Bitte öffnen Sie die Tür.'
            : eta
              ? `${driver ? `${driver} kommt` : 'Voraussichtlich'} gegen ${formatTime(eta.arrival)} Uhr`
              : 'Verfolgen Sie Ihren Fahrer live auf der Karte.'}
        </span>
      </span>
      <span className="relative hidden shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-brand-800 shadow-sm transition-transform group-hover:translate-x-0.5 sm:inline-flex">
        Live verfolgen
        <ArrowRight size={16} aria-hidden />
      </span>
      <ArrowRight size={20} aria-hidden className="relative shrink-0 text-white/70 sm:hidden" />
    </Link>
  );
}

/** Meine Bestellungen: Aktiv / Abgeschlossen */
export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get('tab') === 'abgeschlossen' ? 'abgeschlossen' : 'aktiv';
  const { data, isLoading, error, refetch } = useMyOrders();
  const products = useProductMap();
  const reorder = useReorder();
  const isBusiness = useSession((s) => s.user?.role === 'business');

  const { active, done } = useMemo(() => {
    const list = data ?? [];
    return { active: list.filter(isActiveOrder), done: list.filter((o) => !isActiveOrder(o)) };
  }, [data]);
  const live = active.find((o) => o.status === 'out_for_delivery' && o.fulfillment === 'delivery');
  const list = tab === 'aktiv' ? active : done;

  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'abgeschlossen') next.set('tab', id);
    else next.delete('tab');
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Meine Bestellungen"
        subtitle={isBusiness ? 'Alle Bestellungen Ihres Unternehmens – mit Status, Lieferung und Nachbestellung.' : 'Verfolgen Sie Ihre Lieferungen live und bestellen Sie Ihre Favoriten mit einem Klick nach.'}
        icon={ClipboardList}
        actions={
          <ButtonLink to="/sortiment" variant="outline" icon={LayoutGrid}>
            Zum Sortiment
          </ButtonLink>
        }
      />

      {live ? <LiveBanner order={live} /> : null}

      <Tabs
        aria-label="Bestellungen filtern"
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'aktiv', label: 'Aktiv', icon: Clock, count: data ? active.length : undefined },
          { id: 'abgeschlossen', label: 'Abgeschlossen', icon: CheckCircle2, count: data ? done.length : undefined },
        ]}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60">
          {tab === 'aktiv' ? (
            <EmptyState
              icon={Package}
              title="Keine offenen Bestellungen"
              description={
                done.length
                  ? 'Aktuell ist nichts unterwegs. Bestellen Sie Ihre Lieblingsgetränke einfach nach – wir liefern bis an die Tür oder legen alles im Markt bereit.'
                  : 'Sie haben noch nichts bestellt. Stöbern Sie im Sortiment – wir liefern bis an die Tür oder legen alles im Markt für Sie bereit.'
              }
              action={
                <>
                  <ButtonLink to="/sortiment" icon={LayoutGrid}>
                    Jetzt einkaufen
                  </ButtonLink>
                  {done.length ? (
                    <ButtonLink to="/bestellungen?tab=abgeschlossen" variant="ghost">
                      Frühere Bestellungen
                    </ButtonLink>
                  ) : null}
                </>
              }
            />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Noch keine abgeschlossenen Bestellungen"
              description="Hier finden Sie später alle zugestellten, abgeholten und stornierten Bestellungen – inklusive „Nochmal bestellen“."
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {list.map((o) => (
            <OrderCard key={o.id} order={o} products={products} onReorder={reorder} />
          ))}
        </div>
      )}
    </div>
  );
}
