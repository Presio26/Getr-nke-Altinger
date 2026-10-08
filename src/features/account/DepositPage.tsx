import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Beer,
  CalendarClock,
  Check,
  Citrus,
  CupSoda,
  Cylinder,
  GlassWater,
  History,
  Info,
  Milk,
  Package,
  Recycle,
  ShoppingCart,
  Store,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { DepositType, EmptiesLine } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { useDepositTypes, useMyCustomer, useMyOrders } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { cn } from '@/lib/cn';
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorState, Notice, PageHeader, Skeleton, TBody, TD, TH, THead, TR, toast } from '@/components/ui';
import { depositSummary, emptiesFlow, emptiesText, isCompletedOrder, isOpenOrder, type EmptiesFlow } from './lib/helpers';

function depositIcon(id: string): LucideIcon {
  if (id.startsWith('kasten-bier') || id.startsWith('flaschen-bier')) return Beer;
  if (id.startsWith('kasten-glas')) return GlassWater;
  if (id.startsWith('kasten-pet') || id.startsWith('einweg')) return Milk;
  if (id.startsWith('kasten-saft')) return Citrus;
  if (id.startsWith('kasten-soft') || id.startsWith('dose')) return CupSoda;
  if (id.startsWith('fass')) return Cylinder;
  return Package;
}

function sameLines(a: EmptiesLine[], b: EmptiesLine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((l) => b.some((x) => x.depositTypeId === l.depositTypeId && x.qty === l.qty));
}

// ───────────────────────────── Kontostand ─────────────────────────────

function BalanceCard({ balance }: { balance: Record<string, number> }) {
  const types = useDepositTypes();
  const navigate = useNavigate();
  const cartEmpties = useCart((s) => s.emptiesReturn);
  const summary = depositSummary(balance, types);
  const returnValue = summary.returnLines.reduce((s, l) => s + (types.find((t) => t.id === l.depositTypeId)?.amount ?? 0) * l.qty, 0);
  const returnQty = summary.returnLines.reduce((s, l) => s + l.qty, 0);
  const already = summary.returnLines.length > 0 && sameLines(summary.returnLines, cartEmpties);

  const giveBack = () => {
    useCart.getState().set({ emptiesReturn: summary.returnLines.map((l) => ({ ...l })) });
    toast.success('Leergut für Ihre nächste Bestellung vorgemerkt', {
      description: `${returnQty} Gebinde · Gutschrift ${formatEuro(returnValue)} – der Fahrer nimmt es bei der Lieferung mit.`,
      id: 'empties',
    });
    navigate('/warenkorb');
  };

  return (
    <section aria-label="Leergut-Kontostand" className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-5 text-white sm:p-6">
        <Recycle aria-hidden className="pointer-events-none absolute -bottom-10 -right-8 h-44 w-44 text-white/[0.06]" />
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-300">Ihr Leergut bei uns</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-4xl font-bold tracking-tight tabular-nums">{formatEuro(summary.totalValue)}</p>
            <p className="text-sm text-white/70">Pfandwert, den Sie zurückbekommen</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{summary.totalQty}</p>
            <p className="text-sm text-white/70">{summary.totalQty === 1 ? 'Gebinde' : 'Gebinde'} bei Ihnen</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          {summary.returnLines.length ? (
            already ? (
              <ButtonLink to="/warenkorb" variant="accent" icon={Check} className="w-full sm:w-auto">
                Im Warenkorb vorgemerkt
              </ButtonLink>
            ) : (
              <Button variant="accent" icon={Truck} onClick={giveBack} className="w-full sm:w-auto">
                <span className="sm:hidden">Bei nächster Lieferung mitgeben</span>
                <span className="hidden sm:inline">Leergut bei nächster Lieferung mitgeben</span>
              </Button>
            )
          ) : (
            <ButtonLink to="/warenkorb" variant="accent" icon={ShoppingCart} className="w-full sm:w-auto">
              Leergut im Warenkorb angeben
            </ButtonLink>
          )}
          {summary.returnLines.length ? (
            <p className="text-sm text-white/70">
              Gutschrift {formatEuro(returnValue)} für {returnQty} {returnQty === 1 ? 'Kasten' : 'Kästen'}
            </p>
          ) : null}
        </div>
      </div>
      {summary.lines.length ? (
        <ul className="divide-y divide-slate-100">
          {summary.lines.map((l) => {
            const Icon = depositIcon(l.type.id);
            return (
              <li key={l.type.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon size={19} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900">{l.type.shortName}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {l.qty} × {formatEuro(l.type.amount)} Pfand{!l.type.returnable ? ' · Rückgabe im Markt' : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-bold tabular-nums text-slate-900">{l.qty}</span>
                  <span className="block text-sm tabular-nums text-slate-500">{formatEuro(l.value)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Recycle}
          title="Kein offenes Leergut"
          description="Sie haben aktuell kein Leergut von uns – alles zurückgegeben. Mehrweg-Kästen aus Ihren Lieferungen erscheinen hier automatisch."
          className="py-8"
        />
      )}
    </section>
  );
}

// ───────────────────────────── Verlauf ─────────────────────────────

function Delta({ value }: { value: number }) {
  if (value === 0) return <Badge tone="neutral">± 0</Badge>;
  return value > 0 ? (
    <Badge tone="info" icon={ArrowDownLeft}>
      +{value}
    </Badge>
  ) : (
    <Badge tone="success" icon={ArrowUpRight}>
      −{Math.abs(value)}
    </Badge>
  );
}

function FlowText({ lines, types, empty = '–', stacked = false }: { lines: EmptiesLine[]; types: DepositType[]; empty?: string; stacked?: boolean }) {
  if (!lines.length) return <span className="text-slate-400">{empty}</span>;
  if (!stacked) return <span>{emptiesText(lines, types)}</span>;
  return (
    <span className="block space-y-0.5">
      {lines.map((l) => (
        <span key={l.depositTypeId} className="block">
          <span className="font-semibold tabular-nums text-slate-900">{l.qty}×</span> {types.find((t) => t.id === l.depositTypeId)?.shortName ?? l.depositTypeId}
        </span>
      ))}
    </span>
  );
}

function HistoryCard() {
  const types = useDepositTypes();
  const { data: orders, isLoading, error, refetch } = useMyOrders();
  const [limit, setLimit] = useState(8);

  const { done, planned } = useMemo(() => {
    const list = orders ?? [];
    const done = list
      .filter(isCompletedOrder)
      .map((o) => emptiesFlow(o, types))
      .filter((f) => f.deliveredQty || f.returnedQty)
      .sort((a, b) => b.order.slot.date.localeCompare(a.order.slot.date) || b.order.createdAt.localeCompare(a.order.createdAt));
    const planned = list
      .filter((o) => isOpenOrder(o) && o.emptiesReturn.some((l) => l.qty > 0))
      .sort((a, b) => a.slot.date.localeCompare(b.slot.date));
    return { done, planned };
  }, [orders, types]);

  const shown = done.slice(0, limit);

  return (
    <Card padding="none">
      <div className="p-5 pb-0 sm:p-6 sm:pb-0">
        <CardHeader icon={History} title="Verlauf" subtitle="Gelieferte Mehrweg-Gebinde und zurückgegebenes Leergut je Bestellung" />
      </div>
      {isLoading ? (
        <div className="space-y-2 px-5 pb-6 sm:px-6">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !done.length && !planned.length ? (
        <EmptyState icon={History} title="Noch keine Leergut-Bewegungen" description="Sobald wir Mehrweg-Kästen liefern oder Leergut mitnehmen, sehen Sie es hier." className="py-8" />
      ) : (
        <>
          {planned.length ? (
            <div className="mx-5 mb-4 space-y-2 sm:mx-6">
              {planned.map((o) => (
                <Link
                  key={o.id}
                  to={`/bestellung/${o.id}`}
                  className="flex items-center gap-3 rounded-xl border border-accent-200 bg-accent-50/70 px-3.5 py-2.5 text-sm transition-colors hover:bg-accent-50"
                >
                  <CalendarClock size={18} aria-hidden className="shrink-0 text-accent-700" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-900">Geplante Rückgabe {formatDate(o.slot.date, 'relative')}</span>
                    <span className="block truncate text-slate-600">
                      {emptiesText(o.emptiesReturn, types)} · {o.number}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-emerald-700">−{formatEuro(o.totals.depositRefund)}</span>
                </Link>
              ))}
            </div>
          ) : null}

          {done.length ? (
            <>
              {/* Desktop: Tabelle */}
              <div className="hidden overflow-x-auto border-t border-slate-100 md:block">
                <table className="w-full border-collapse text-left text-[13px] [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td]:px-3 [&_th]:px-3">
                  <THead>
                    <tr>
                      <TH>Bestellung</TH>
                      <TH>Geliefert (Mehrweg)</TH>
                      <TH>Zurückgegeben</TH>
                      <TH className="text-center">Konto</TH>
                      <TH className="text-right">Pfand</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {shown.map((f) => (
                      <HistoryRow key={f.order.id} flow={f} types={types} />
                    ))}
                  </TBody>
                </table>
              </div>
              {/* Mobil: Liste */}
              <ul className="divide-y divide-slate-100 border-t border-slate-100 md:hidden">
                {shown.map((f) => (
                  <li key={f.order.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <Link to={`/bestellung/${f.order.id}`} className="min-w-0 text-[15px] font-semibold text-slate-900">
                        {formatDate(f.order.slot.date, 'short')} <span className="font-normal text-slate-400">·</span> <span className="text-brand-700">{f.order.number}</span>
                      </Link>
                      <Delta value={f.delta} />
                    </div>
                    <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
                      <dt className="text-slate-500">Geliefert</dt>
                      <dd className="text-slate-800">
                        <FlowText lines={f.delivered} types={types} />
                      </dd>
                      <dt className="text-slate-500">Zurück</dt>
                      <dd className="text-slate-800">
                        <FlowText lines={f.returned} types={types} empty="kein Leergut" />
                      </dd>
                      <dt className="text-slate-500">Pfand</dt>
                      <dd className="tabular-nums text-slate-800">
                        {formatEuro(f.order.totals.deposit)}
                        {f.order.totals.depositRefund ? <span className="text-emerald-700"> · Gutschrift {formatEuro(f.order.totals.depositRefund)}</span> : null}
                      </dd>
                    </dl>
                  </li>
                ))}
              </ul>
              {done.length > limit ? (
                <div className="border-t border-slate-100 p-3 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 10)}>
                    Weitere {Math.min(10, done.length - limit)} anzeigen
                  </Button>
                </div>
              ) : (
                <div className="h-4" />
              )}
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}

function HistoryRow({ flow, types }: { flow: EmptiesFlow; types: DepositType[] }) {
  const o = flow.order;
  return (
    <TR>
      <TD className="whitespace-nowrap align-top">
        <span className="block font-medium tabular-nums text-slate-900">{formatDate(o.slot.date, 'short')}</span>
        <Link to={`/bestellung/${o.id}`} className="font-semibold text-brand-700 hover:text-brand-800">
          {o.number}
        </Link>
        <span className="text-xs text-slate-400"> · {o.fulfillment === 'pickup' ? 'Abholung' : 'Lieferung'}</span>
      </TD>
      <TD className="align-top">
        <FlowText lines={flow.delivered} types={types} stacked />
      </TD>
      <TD className="align-top">
        <FlowText lines={flow.returned} types={types} empty="kein Leergut" stacked />
      </TD>
      <TD className="text-center align-top">
        <Delta value={flow.delta} />
      </TD>
      <TD className="whitespace-nowrap text-right align-top tabular-nums">
        <span className="block text-slate-800">{formatEuro(o.totals.deposit)}</span>
        {o.totals.depositRefund ? <span className="block text-emerald-700">−{formatEuro(o.totals.depositRefund)}</span> : null}
      </TD>
    </TR>
  );
}

// ───────────────────────────── Erklärung ─────────────────────────────

function ExplainCard() {
  const types = useDepositTypes();
  const sorted = [...types].sort((a, b) => Number(b.returnable) - Number(a.returnable) || a.amount - b.amount);
  return (
    <Card padding="lg">
      <CardHeader icon={Info} title="Pfand & Mehrweg – kurz erklärt" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { icon: Beer, title: 'Mehrweg-Kästen', text: 'Pfand gilt für den ganzen Kasten inklusive Flaschen, z. B. 3,10 € für den Bierkasten. Bitte nur vollständige, sortenreine Kästen zurückgeben.' },
          { icon: Milk, title: 'Einweg (PET & Dose)', text: '0,25 € pro Flasche oder Dose. Einweg nimmt unser Leergutautomat im Markt an – nicht der Fahrer.' },
          { icon: Cylinder, title: 'Fässer', text: '30,00 € Pfand je Fass. Fässer und Zapfanlagen holen wir nach Ihrem Fest auf Wunsch wieder ab.' },
        ].map((b) => (
          <div key={b.title} className="rounded-2xl bg-slate-50 p-4">
            <b.icon size={20} aria-hidden className="text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-slate-900">{b.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{b.text}</p>
          </div>
        ))}
      </div>
      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Pfandbeträge</h3>
      <ul className="grid grid-cols-1 gap-x-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 sm:grid-cols-2 sm:divide-y-0">
        {sorted.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:border-b sm:border-slate-100">
            <span className="min-w-0">
              <span className="block font-medium text-slate-800">{t.name}</span>
              <span className={cn('text-xs', t.returnable ? 'text-emerald-700' : 'text-slate-500')}>
                {t.returnable ? 'Rückgabe beim Fahrer oder im Markt' : 'Rückgabe im Markt (Automat)'}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatEuro(t.amount)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StepsCard() {
  const steps = [
    { icon: Recycle, title: 'Leergut bereitstellen', text: 'Volle Kästen mit den passenden leeren Flaschen – gern sortenrein gestapelt.' },
    { icon: ShoppingCart, title: 'Bei der Bestellung angeben', text: 'Im Warenkorb unter „Leergut-Rückgabe“ – oder hier mit einem Klick übernehmen.' },
    { icon: Truck, title: 'Fahrer nimmt es mit', text: 'Gezählt wird vor Ort; das Pfand wird direkt mit Ihrer Bestellung verrechnet.' },
  ];
  return (
    <Card padding="lg">
      <h2 className="text-base font-bold text-slate-900">So geben Sie Leergut zurück</h2>
      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <s.icon size={19} aria-hidden />
              <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[11px] font-bold text-white ring-2 ring-white">{i + 1}</span>
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{s.title}</span>
              <span className="block text-sm leading-snug text-slate-500">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Notice tone="info" icon={Store} className="mt-5">
        Lieber selbst vorbeikommen? Im Markt nehmen wir Leergut jederzeit während der Öffnungszeiten zurück – den Pfandbon verrechnen wir an der Kasse.
      </Notice>
    </Card>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

/** Leergut-Konto: Kontostand, Verlauf, Erklärung, Rückgabe mit der nächsten Lieferung */
export default function DepositPage() {
  const { data: customer, isLoading, error, refetch } = useMyCustomer();
  return (
    <>
      <PageHeader title="Leergut-Konto" subtitle="Wie viel Leergut Sie von uns haben – und wie Sie Ihr Pfand bequem zurückbekommen." back="/konto" />
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]" aria-busy>
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="hidden h-80 rounded-2xl lg:block" />
        </div>
      ) : error || !customer ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-6">
            <BalanceCard balance={customer.depositBalance} />
            <HistoryCard />
            <ExplainCard />
          </div>
          <aside className="lg:sticky lg:top-36">
            <StepsCard />
          </aside>
        </div>
      )}
    </>
  );
}
