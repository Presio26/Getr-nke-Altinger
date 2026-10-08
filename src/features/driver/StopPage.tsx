import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BellRing,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Home,
  IdCard,
  ListOrdered,
  MapPinCheck,
  PackageOpen,
  Recycle,
  SearchX,
  Signature,
  TriangleAlert,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import type { DeliveryProofInput, Driver, ID, Order, TourWithOrders } from '@shared/types';
import { formatEuro, formatTime, STOP_STATUS_LABEL } from '@shared/format';
import { ApiError } from '@shared/api';
import { api } from '@/api/client';
import { qk, useApiMutation, useDepositTypes, useDriverToday, useOrder, useProductMap } from '@/api/hooks';
import { readJson, writeJson, writeStorage } from '@/lib/storage';
import { cn } from '@/lib/cn';
import { StickyActionBar } from '@/components/layout';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Checkbox,
  Divider,
  EmptyState,
  ErrorState,
  Input,
  Notice,
  OrderStatusBadge,
  PageHeader,
  Skeleton,
  toast,
} from '@/components/ui';
import { ageCheck, ageCheckNote, dueInfo, emptiesLabel, findStop, nextOpenIndex, payKind, paymentNote, STOP_TONE } from './lib/driverUtils';
import { CustomerCard, DoneBanner, EmptiesSummary, ItemsCard, NotesCard, ProofView } from './components/StopSections';
import { EmptiesEditor } from './components/EmptiesEditor';
import { PaymentPanel, paymentComplete, receivedCents, type PaymentState } from './components/PaymentPanel';
import { SignaturePad } from './components/SignaturePad';
import { PhotoCapture } from './components/PhotoCapture';
import { FailModal } from './components/FailModal';
import { SimulationWaitNotice } from './components/TourControls';

// ───────────────────────────── Entwurf (je Stopp gespeichert) ─────────────────────────────

interface StopDraft {
  checked: number[];
  empties: Record<ID, number>;
  method: 'cash' | 'ec';
  received: string;
  ecConfirmed: boolean;
  receivedBy: string;
  /** Jugendschutz: Alter des Empfängers geprüft */
  ageChecked: boolean;
}

const draftKey = (orderId: ID) => `altinger.driver.stopp.${orderId}`;

function initialDraft(order: Order): StopDraft {
  const stored = readJson<Partial<StopDraft> | null>(draftKey(order.id), null);
  const empties: Record<ID, number> = {};
  for (const l of order.emptiesReturn) if (l.qty) empties[l.depositTypeId] = (empties[l.depositTypeId] ?? 0) + l.qty;
  return {
    checked: stored?.checked ?? [],
    empties: stored?.empties ?? empties,
    method: stored?.method ?? (order.paymentMethod === 'ec' ? 'ec' : 'cash'),
    received: stored?.received ?? '',
    ecConfirmed: stored?.ecConfirmed ?? false,
    receivedBy: stored?.receivedBy ?? (order.customerType === 'b2c' ? (order.address?.name ?? order.customerName) : ''),
    ageChecked: stored?.ageChecked ?? false,
  };
}

// ───────────────────────────── Seite ─────────────────────────────

function StopSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-5 h-12 w-2/3" />
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Fahrer-App: ein Stopp – Navigation, Leergut, Kassieren, Unterschrift, Foto, Abschluss */
export default function StopPage() {
  const { orderId = '' } = useParams();
  const today = useDriverToday();
  const found = useMemo(() => findStop(today.data?.tours, orderId), [today.data, orderId]);
  // Auftrag nicht in den heutigen Touren → einzeln laden (z. B. alter Link)
  const single = useOrder(today.data && !found ? orderId : null);

  if (today.isLoading || (single.isLoading && single.fetchStatus !== 'idle')) return <StopSkeleton />;
  if (today.error) {
    return (
      <>
        <PageHeader title="Stopp" back="/fahrer" />
        <Card padding="none">
          <ErrorState error={today.error} onRetry={() => void today.refetch()} />
        </Card>
      </>
    );
  }

  if (found) {
    return <StopWorkspace key={found.order.id} order={found.order} tour={found.tour} index={found.index} driver={today.data?.driver} />;
  }
  if (single.data) return <StopWorkspace key={single.data.id} order={single.data} driver={today.data?.driver} />;
  const active = today.data?.tours.find((t) => t.status === 'active');
  // Nicht gefunden – gleiches Muster wie im Shop: Seitenüberschrift (h1) + EmptyState mit Aktionen
  return (
    <>
      <PageHeader title="Stopp nicht gefunden" back="/fahrer" />
      <Card padding="none">
        {single.error && !(single.error instanceof ApiError && (single.error.code === 'not_found' || single.error.code === 'forbidden')) ? (
          <ErrorState
            error={single.error}
            onRetry={() => void single.refetch()}
            action={
              <ButtonLink to="/fahrer" variant="outline" icon={Home}>
                Zur Tagesübersicht
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Diesen Auftrag gibt es nicht – oder er ist Ihnen nicht zugewiesen"
            description="Möglicherweise wurde die Tour vom Markt geändert. Ihre aktuellen Stopps finden Sie in der Tagesübersicht."
            action={
              <>
                <ButtonLink to="/fahrer" icon={Home}>
                  Zur Tagesübersicht
                </ButtonLink>
                {active ? (
                  <ButtonLink to={`/fahrer/tour/${active.id}`} variant="outline" icon={ListOrdered}>
                    Zur laufenden Tour
                  </ButtonLink>
                ) : null}
              </>
            }
          />
        )}
      </Card>
    </>
  );
}

interface WorkspaceProps {
  order: Order;
  tour?: TourWithOrders;
  index?: number;
  driver?: Driver;
}

function StopWorkspace({ order, tour, index = -1, driver }: WorkspaceProps) {
  const navigate = useNavigate();
  const types = useDepositTypes();
  const productMap = useProductMap();
  const age = useMemo(() => ageCheck(order, productMap), [order, productMap]);
  const [draft, setDraft] = useState<StopDraft>(() => initialDraft(order));
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [failOpen, setFailOpen] = useState(false);

  const stop = tour && index >= 0 ? tour.stops[index] : undefined;
  const active = order.status === 'out_for_delivery';
  const done = order.status === 'delivered' || order.status === 'failed';
  const kind = payKind(order.paymentMethod);

  // Entwurf sichern (z. B. beim Wechsel in die Navigations-App)
  useEffect(() => {
    if (active) writeJson(draftKey(order.id), draft);
  }, [draft, active, order.id]);

  const patch = (p: Partial<StopDraft>) => setDraft((d) => ({ ...d, ...p }));
  const checked = useMemo(() => new Set(draft.checked), [draft.checked]);
  const emptiesLines = useMemo(() => Object.entries(draft.empties).map(([depositTypeId, qty]) => ({ depositTypeId, qty })), [draft.empties]);
  const due = useMemo(() => dueInfo(order, emptiesLines, types), [order, emptiesLines, types]);
  const payState: PaymentState = { method: draft.method, received: draft.received, ecConfirmed: draft.ecConfirmed };

  // ── Weiter zum nächsten offenen Stopp ──
  const goNext = (title: string) => {
    window.setTimeout(() => writeStorage(draftKey(order.id), null), 0);
    if (!tour) {
      toast.success(title);
      navigate('/fahrer');
      return;
    }
    const i = nextOpenIndex(tour.stops, index, index);
    if (i >= 0) {
      const next = tour.orders.find((o) => o.id === tour.stops[i].orderId);
      toast.success(title, { description: `Weiter zu Stopp ${i + 1}${next ? ` · ${next.customerName}` : ''}`, id: 'stop-done' });
      navigate(`/fahrer/stopp/${tour.stops[i].orderId}`, { replace: true });
    } else {
      toast.success(title, { description: 'Alle Stopps erledigt – bitte die Tour beenden.', id: 'stop-done' });
      navigate(`/fahrer/tour/${tour.id}`, { replace: true });
    }
  };

  const arrive = useApiMutation(() => api.arriveAtStop(order.id), {
    invalidate: [qk.driverToday],
    success: 'Ankunft gemeldet – der Kunde wurde informiert.',
  });
  const complete = useApiMutation((proof: DeliveryProofInput) => api.completeDelivery(order.id, proof), {
    invalidate: [qk.driverToday],
    onSuccess: () => goNext('Zustellung abgeschlossen'),
  });
  const fail = useApiMutation((reason: string) => api.failDelivery(order.id, reason), {
    invalidate: [qk.driverToday],
    onSuccess: () => {
      setFailOpen(false);
      goNext('Problem gemeldet – der Markt ist informiert');
    },
  });

  // ── Prüfung vor dem Abschluss ──
  const payOk = paymentComplete(order, due, payState);
  const proofOk = !!signature || !!photo;
  const nameOk = !signature || draft.receivedBy.trim().length >= 2;
  const missing: { id: string; label: string }[] = [];
  if (!payOk) missing.push({ id: 'kassieren', label: draft.method === 'ec' ? 'EC-Zahlung bestätigen' : 'erhaltenen Betrag eingeben' });
  if (!proofOk) missing.push({ id: 'empfang', label: 'Unterschrift oder Foto' });
  if (!nameOk) missing.push({ id: 'empfang', label: 'Name des Empfängers' });
  const ageOk = !age || draft.ageChecked;
  if (!ageOk) missing.push({ id: 'jugendschutz', label: 'Alterskontrolle bestätigen' });

  const submit = () => {
    if (missing.length) {
      setShowErrors(true);
      toast.error(`Bitte noch ergänzen: ${missing.map((m) => m.label).join(', ')}`, { id: 'stop-missing' });
      document.getElementById(missing[0].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const notes: string[] = [];
    if (age) notes.push(ageCheckNote(age));
    if (kind === 'collect') {
      if (due.due < 0) notes.push(`Leergut-Auszahlung ${formatEuro(-due.due)} bar`);
      else {
        notes.push(paymentNote(draft.method));
        const r = receivedCents(payState);
        if (draft.method === 'cash' && r !== null && r > due.due) notes.push(`erhalten ${formatEuro(r)}, Rückgeld ${formatEuro(r - due.due)}`);
      }
    }
    if (due.refundDiff !== 0) notes.push(`Leergut abweichend von Ankündigung (${formatEuro(-due.refundDiff, { sign: true })})`);
    const unchecked = order.lines.length - order.lines.filter((_, i) => checked.has(i)).length;
    if (draft.checked.length > 0 && unchecked > 0) notes.push(`${unchecked} Position(en) nicht abgehakt`);
    const proof: DeliveryProofInput = {
      emptiesCollected: emptiesLines.filter((l) => l.qty > 0),
      ...(draft.receivedBy.trim() ? { receivedBy: draft.receivedBy.trim() } : {}),
      ...(signature ? { signatureDataUrl: signature } : {}),
      ...(photo ? { photoDataUrl: photo } : {}),
      ...(kind === 'collect' ? { amountCollected: Math.max(0, due.due) } : {}),
      ...(notes.length ? { note: notes.join(' · ').slice(0, 480) } : {}),
    };
    complete.mutate(proof);
  };

  // ── Kopf ──
  const total = tour?.stops.length ?? 0;
  const prevId = tour && index > 0 ? tour.stops[index - 1].orderId : null;
  const nextId = tour && index >= 0 && index < total - 1 ? tour.stops[index + 1].orderId : null;
  const subtitle = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {stop ? (
        <Badge tone={STOP_TONE[stop.status]} solid={stop.status !== 'pending'}>
          {STOP_STATUS_LABEL[stop.status]}
        </Badge>
      ) : (
        <OrderStatusBadge status={order.status} fulfillment={order.fulfillment} />
      )}
      <span>
        {order.slot.start}–{order.slot.end} Uhr
        {stop?.eta && stop.status === 'pending' && active ? ` · ca. ${formatTime(stop.eta)}` : ''}
      </span>
    </span>
  );

  const emptiesNow = emptiesLabel(emptiesLines, types);
  // „Zum Abschluss“: zum ersten noch fehlenden Punkt (Kassieren, Alterskontrolle, Unterschrift), sonst zum Empfang
  const scrollToFinish = () => document.getElementById(missing[0]?.id ?? 'empfang')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    // Abstand für die feste Aktionsleiste hält das Layout (--sticky-bar-h); pb-14 = Platz für die Demo-Pille
    <div className="pb-14 lg:pb-0">
      <PageHeader
        title={tour ? `Stopp ${index + 1} von ${total}` : 'Stopp'}
        documentTitle={tour ? `Stopp ${index + 1} · ${order.customerName}` : `Stopp · ${order.customerName}`}
        subtitle={subtitle}
        back={tour ? `/fahrer/tour/${tour.id}` : '/fahrer'}
        className="mb-4"
        actions={
          tour ? (
            <div className="hidden items-center gap-1 sm:flex">
              <ButtonLink to={prevId ? `/fahrer/stopp/${prevId}` : '#'} replace variant="ghost" icon={ChevronLeft} disabled={!prevId} aria-label="Vorheriger Stopp">
                Zurück
              </ButtonLink>
              <ButtonLink to={nextId ? `/fahrer/stopp/${nextId}` : '#'} replace variant="ghost" iconRight={ChevronRight} disabled={!nextId} aria-label="Nächster Stopp">
                Weiter
              </ButtonLink>
            </div>
          ) : undefined
        }
      />

      {/* Status / Ankunft */}
      <div className="mb-4 space-y-3">
        {tour && active ? <SimulationWaitNotice tour={tour} currentOrderId={order.id} onHere={scrollToFinish} /> : null}
        {done ? <DoneBanner order={order} /> : null}
        {age && !done ? (
          <Notice tone="danger" icon={IdCard} title={`Alter prüfen (ab ${age.minAge} Jahren)`}>
            {age.minAge === 18 ? 'Die Lieferung enthält Spirituosen' : 'Die Lieferung enthält alkoholische Getränke'} ({age.items.join(', ')}). Übergabe nur an
            Personen ab {age.minAge} Jahren – im Zweifel Ausweis zeigen lassen.
          </Notice>
        ) : null}
        {!active && !done ? (
          <Notice
            tone="warning"
            icon={Truck}
            title="Die Tour ist noch nicht gestartet"
            action={tour ? <ButtonLink to={`/fahrer/tour/${tour.id}`} size="sm">Zur Tour</ButtonLink> : undefined}
          >
            Ankunft, Leergut und Zustellung können Sie erfassen, sobald die Tour läuft.
          </Notice>
        ) : null}
        {active && stop?.status !== 'arrived' && !order.arrivedAt ? (
          <Card padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <BellRing size={22} aria-hidden />
              </span>
              <p className="text-[15px] leading-snug text-slate-600">
                <strong className="block text-slate-900">Beim Kunden angekommen?</strong>
                Der Kunde erhält sofort eine Nachricht, dass Sie da sind.
              </p>
            </div>
            <Button size="lg" icon={MapPinCheck} loading={arrive.isPending} onClick={() => arrive.mutate()} className="h-14! w-full sm:w-auto">
              Angekommen
            </Button>
          </Card>
        ) : null}
        {active && (stop?.status === 'arrived' || order.arrivedAt) ? (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-sm">
            <MapPinCheck size={22} aria-hidden className="shrink-0" />
            <p className="text-[15px] font-semibold">
              Vor Ort seit {formatTime(stop?.arrivedAt ?? order.arrivedAt ?? new Date())} Uhr – der Kunde wurde informiert.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {/* Links: Kunde, Hinweise, Positionen */}
        <div className="space-y-4">
          <CustomerCard order={order} driver={driver} />
          <NotesCard order={order} />
          <ItemsCard
            order={order}
            interactive={active}
            checked={checked}
            onToggle={(i) => patch({ checked: checked.has(i) ? draft.checked.filter((x) => x !== i) : [...draft.checked, i] })}
            onAll={(all) => patch({ checked: all ? order.lines.map((_, i) => i) : [] })}
          />
        </div>

        {/* Rechts: Leergut, Kassieren, Empfang, Abschluss */}
        <div className="space-y-4">
          {active ? (
            <>
              <Card id="leergut" className="scroll-mt-24">
                <CardHeader
                  title="Leergut erfassen"
                  subtitle={
                    order.emptiesReturn.length
                      ? `Angekündigt: ${emptiesLabel(order.emptiesReturn, types)} · jetzt erfasst: ${emptiesNow}`
                      : 'Kein Leergut angekündigt – bei Bedarf hier erfassen.'
                  }
                  icon={Recycle}
                />
                <EmptiesEditor order={order} types={types} value={draft.empties} onChange={(empties) => patch({ empties })} />
                <EmptiesSummary announced={due.announcedRefund} actual={due.actualRefund} />
              </Card>

              <Card id="kassieren" className="scroll-mt-24">
                <CardHeader title="Kassieren" icon={Wallet} subtitle={kind === 'collect' ? 'Betrag inkl. tatsächlich zurückgenommenem Leergut' : undefined} />
                <PaymentPanel order={order} due={due} value={payState} onChange={(p) => patch(p)} showErrors={showErrors} />
              </Card>

              <Card id="empfang" className="scroll-mt-24">
                <CardHeader title="Empfang bestätigen" subtitle="Unterschrift und/oder Foto als Zustellnachweis" icon={Signature} />
                {age ? (
                  <div
                    id="jugendschutz"
                    className={cn(
                      'mb-4 scroll-mt-24 rounded-xl px-3 ring-1 ring-inset',
                      showErrors && !draft.ageChecked ? 'bg-red-50/70 ring-red-300' : draft.ageChecked ? 'bg-emerald-50/70 ring-emerald-200' : 'bg-amber-50 ring-amber-300',
                    )}
                  >
                    <Checkbox
                      checked={draft.ageChecked}
                      onChange={(e) => patch({ ageChecked: e.target.checked })}
                      label={age.minAge === 18 ? 'Alter geprüft – Empfänger ist volljährig (ab 18)' : 'Alter geprüft – Empfänger ist mindestens 16 Jahre alt'}
                      description="Pflicht bei alkoholischen Getränken (Jugendschutzgesetz). Wird im Zustellnachweis vermerkt."
                      containerClassName="py-3"
                    />
                    {showErrors && !draft.ageChecked ? (
                      <p className="-mt-1 pb-2.5 text-sm font-medium text-red-600">Bitte bestätigen Sie die Alterskontrolle – sonst „Problem melden“.</p>
                    ) : null}
                  </div>
                ) : null}
                <Input
                  label="Name des Empfängers"
                  icon={User}
                  autoComplete="off"
                  autoCapitalize="words"
                  placeholder="Vor- und Nachname"
                  value={draft.receivedBy}
                  onChange={(e) => patch({ receivedBy: e.target.value })}
                  error={showErrors && !nameOk ? 'Bitte den Namen der Person eintragen, die unterschreibt.' : undefined}
                  containerClassName="mb-4"
                />
                <SignaturePad onChange={setSignature} invalid={showErrors && !proofOk} signerName={draft.receivedBy.trim() || undefined} />
                <Divider label="Foto" />
                <PhotoCapture value={photo} onChange={setPhoto} />
                {showErrors && !proofOk ? (
                  <p className="mt-2 text-sm font-medium text-red-600">Bitte lassen Sie unterschreiben oder machen Sie ein Foto der abgestellten Ware.</p>
                ) : null}
              </Card>

              {/* Desktop: Abschluss in der Spalte */}
              <Card className="hidden lg:block">
                <CardHeader title="Abschluss" icon={ClipboardCheck} />
                <ul className="mb-4 space-y-2 text-[15px]">
                  {[
                    { ok: true, label: `Leergut: ${emptiesNow} (${formatEuro(due.actualRefund)})`, icon: Recycle },
                    ...(age ? [{ ok: draft.ageChecked, label: `Alter geprüft (ab ${age.minAge})`, icon: IdCard }] : []),
                    {
                      ok: payOk,
                      label:
                        kind === 'collect'
                          ? due.due < 0
                            ? `Auszahlen: ${formatEuro(-due.due)}`
                            : `Kassiert: ${formatEuro(due.due)} ${draft.method === 'ec' ? 'per EC' : 'bar'}`
                          : kind === 'prepaid'
                            ? 'Bereits bezahlt'
                            : 'Per Rechnung',
                      icon: Wallet,
                    },
                    { ok: !!signature, label: signature ? `Unterschrift von ${draft.receivedBy.trim() || '–'}` : 'Unterschrift', icon: Signature, optional: !!photo },
                    { ok: !!photo, label: 'Foto', icon: Camera, optional: !!signature },
                  ].map((row) => (
                    <li key={row.label} className="flex items-center gap-2.5">
                      {row.ok ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                          <Check size={14} strokeWidth={3} aria-hidden />
                        </span>
                      ) : (
                        <Circle size={24} aria-hidden className={row.optional ? 'text-slate-200' : 'text-slate-300'} />
                      )}
                      <span className={cn(row.ok ? 'font-medium text-slate-900' : 'text-slate-500')}>
                        {row.label}
                        {!row.ok && row.optional ? ' (optional)' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button variant="outline" size="lg" icon={TriangleAlert} onClick={() => setFailOpen(true)} className="border-red-200! text-red-700! hover:bg-red-50!">
                    Problem melden
                  </Button>
                  <Button variant="success" size="lg" icon={PackageOpen} block loading={complete.isPending} onClick={submit} className="flex-1">
                    Zustellung abschließen
                  </Button>
                </div>
              </Card>
            </>
          ) : done ? (
            <ProofView order={order} types={types} />
          ) : (
            <Card>
              <CardHeader title="Leergut angekündigt" icon={Recycle} />
              {order.emptiesReturn.length ? (
                <ul className="space-y-1.5 text-[15px]">
                  {order.emptiesReturn.map((l) => (
                    <li key={l.depositTypeId} className="flex justify-between">
                      <span className="text-slate-600">{types.find((t) => t.id === l.depositTypeId)?.shortName ?? l.depositTypeId}</span>
                      <strong className="tabular-nums">{l.qty}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-slate-500">Kein Leergut angekündigt.</p>
              )}
            </Card>
          )}

          {tour ? (
            <div className="flex items-center justify-between gap-2 sm:hidden">
              {prevId ? (
                <Link to={`/fahrer/stopp/${prevId}`} replace className="flex min-h-11 items-center gap-1 text-sm font-semibold text-slate-600">
                  <ChevronLeft size={18} aria-hidden /> Stopp {index}
                </Link>
              ) : (
                <span />
              )}
              {nextId ? (
                <Link to={`/fahrer/stopp/${nextId}`} replace className="flex min-h-11 items-center gap-1 text-sm font-semibold text-slate-600">
                  Stopp {index + 2} <ChevronRight size={18} aria-hidden />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobil: feste Aktionsleiste */}
      {active ? (
        <StickyActionBar offset="none">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFailOpen(true)}
              aria-label="Problem melden"
              title="Problem melden"
              className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-red-200 bg-white text-red-700 transition-colors hover:bg-red-50 active:bg-red-100 sm:w-auto sm:flex-row sm:gap-2 sm:px-4"
            >
              <TriangleAlert size={20} aria-hidden />
              <span className="text-[11px] font-semibold leading-none sm:text-[15px]">Problem</span>
            </button>
            <Button variant="success" size="lg" icon={PackageOpen} loading={complete.isPending} onClick={submit} className="h-14! min-w-0 flex-1 px-3!">
              Zustellung abschließen
            </Button>
          </div>
        </StickyActionBar>
      ) : null}

      <FailModal
        open={failOpen}
        onClose={() => setFailOpen(false)}
        onSubmit={(r) => fail.mutate(r)}
        loading={fail.isPending}
        customerName={order.customerName}
        {...(age ? { ageLimit: age.minAge } : {})}
      />
    </div>
  );
}
