/**
 * Markt: Bestelldetail mit allen Angaben, Statusaktionen, Tour-Zuordnung,
 * Kommissionierschein (Druck), Zustellnachweis und Verlauf.
 */
import { useParams } from 'react-router-dom';
import { ArrowLeft, Clock, ExternalLink, History, ListChecks, MapPinned, Printer, Truck } from 'lucide-react';
import { ApiError } from '@shared/api';
import { FULFILLMENT_LABEL, formatDateTime, formatRelative } from '@shared/format';
import { useProductMap } from '@/api/hooks';
import { useNow } from '@/lib/hooks';
import { Button, ButtonLink, Card, CardHeader, ErrorState, OrderStatusBadge, PageHeader, Skeleton } from '@/components/ui';
import { useAdminDrivers, useAdminOrder, useAdminTours } from './ops/api';
import { orderCrates, orderItemCount } from './ops/model';
import { B2BTag, FulfillmentIcon, SourceTag } from './ops/components/OrderBits';
import { EmptiesList, OrderLinesList, OrderTotals } from './ops/components/OrderLines';
import {
  CustomerCard,
  FulfillmentCard,
  HistoryTimeline,
  InfoCard,
  PaymentCard,
  ProofCard,
  RatingCard,
  StatusStepper,
  TourAssignmentCard,
} from './ops/components/OrderPanels';
import { StatusActions } from './ops/components/StatusActions';
import { PickingSlipPrint } from './ops/components/PickingSlip';

function DetailSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-2 h-9 w-72" />
      <Skeleton className="mb-7 h-5 w-96 max-w-full" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-36 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function OrderAdminDetailPage() {
  const { orderId } = useParams();
  const now = useNow(30_000);
  const { data: order, isLoading, error, refetch } = useAdminOrder(orderId);
  const products = useProductMap();
  const toursQuery = useAdminTours(order?.slot.date, order?.fulfillment === 'delivery');
  const { data: drivers } = useAdminDrivers();

  if (isLoading) return <DetailSkeleton />;
  if (error || !order) {
    const notFound = error instanceof ApiError && error.code === 'not_found';
    return (
      <>
        <PageHeader title="Bestellung" back="/admin/bestellungen" />
        <Card>
          <ErrorState
            error={notFound ? new ApiError('not_found', 'Diese Bestellung gibt es nicht (mehr). Bitte prüfen Sie die Bestellnummer.') : error}
            onRetry={notFound ? undefined : () => void refetch()}
            action={
              <ButtonLink to="/admin/bestellungen" variant="ghost" icon={ArrowLeft}>
                Zu den Bestellungen
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  const tours = order.fulfillment === 'delivery' ? toursQuery.data : undefined;
  const tour = tours?.find((t) => t.id === order.tourId) ?? null;
  const driver = drivers?.find((d) => d.id === (order.driverId ?? tour?.driverId));
  const tracking = order.status === 'out_for_delivery';

  return (
    <>
      <PageHeader
        back="/admin/bestellungen"
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Bestellung {order.number}</span>
            <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} className="text-sm" />
          </span>
        }
        documentTitle={`Bestellung ${order.number}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <FulfillmentIcon type={order.fulfillment} size="sm" />
            <span>{FULFILLMENT_LABEL[order.fulfillment]}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5">
              {order.customerName}
              <B2BTag type={order.customerType} />
            </span>
            <span aria-hidden>·</span>
            <span title={formatDateTime(order.createdAt)}>
              {order.source === 'phone' ? 'telefonisch erfasst' : order.source === 'subscription' ? 'aus Abo angelegt' : 'eingegangen'} {formatRelative(order.createdAt, now)}
            </span>
            <SourceTag source={order.source} />
          </span>
        }
        actions={
          <>
            <Button variant="outline" icon={Printer} onClick={() => window.print()}>
              Kommissionierschein
            </Button>
            <ButtonLink to={`/bestellung/${order.id}`} variant={tracking ? 'secondary' : 'ghost'} icon={tracking ? MapPinned : ExternalLink}>
              {tracking ? 'Live-Tracking' : 'Kundenansicht'}
            </ButtonLink>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Hauptspalte */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Status" icon={Clock} subtitle={`Zuletzt geändert ${formatRelative(order.updatedAt, now)}`} />
            <StatusStepper order={order} />
            <div className="mt-5 border-t border-slate-100 pt-4">
              {order.fulfillment === 'delivery' && order.status === 'ready' && tour && tour.status === 'planned' ? (
                <p className="mb-3 flex items-start gap-2 text-sm text-slate-600">
                  <Truck size={16} aria-hidden className="mt-0.5 shrink-0 text-brand-600" />
                  <span>
                    Verladen für <strong className="font-semibold text-slate-800">{tour.name}</strong> – die Bestellung wird mit dem Tourstart automatisch als
                    „unterwegs“ gemeldet und der Kunde informiert.
                  </span>
                </p>
              ) : null}
              <StatusActions order={order} tour={tour} />
            </div>
          </Card>

          <ProofCard order={order} />

          <Card>
            <CardHeader
              title="Positionen"
              icon={ListChecks}
              subtitle={`${orderItemCount(order)} Artikel · ${orderCrates(order)} Gebinde`}
              action={
                <Button variant="ghost" size="sm" icon={Printer} onClick={() => window.print()}>
                  Drucken
                </Button>
              }
            />
            <OrderLinesList order={order} />
            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <div>
                <EmptiesList lines={order.emptiesReturn} />
                {!order.emptiesReturn.length ? <p className="text-sm text-slate-500">Keine Leergut-Rückgabe angemeldet.</p> : null}
              </div>
              <OrderTotals order={order} />
            </div>
          </Card>

          <FulfillmentCard order={order} driverColor={driver?.color} />

          {order.fulfillment === 'delivery' ? <TourAssignmentCard order={order} tours={tours} loading={toursQuery.isLoading} /> : null}

          <Card>
            <CardHeader title="Verlauf" icon={History} subtitle={`${order.statusHistory.length} Einträge`} />
            <HistoryTimeline order={order} />
          </Card>
        </div>

        {/* Seitenleiste */}
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
          <CustomerCard order={order} />
          <PaymentCard order={order} />
          <InfoCard order={order} />
          <RatingCard order={order} />
        </aside>
      </div>

      <PickingSlipPrint order={order} products={products} tour={tour} driverName={driver?.name} />
    </>
  );
}
