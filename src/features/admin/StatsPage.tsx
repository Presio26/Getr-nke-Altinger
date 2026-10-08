import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, Download, Euro, Receipt, Recycle, ShoppingBasket, ShoppingCart, Star, Trophy, UserPlus } from 'lucide-react';
import type { Stats } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { addDays, todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useProductMap } from '@/api/hooks';
import { downloadCsv } from '@/lib/download';
import { cn } from '@/lib/cn';
import { Card, CardHeader, EmptyState, ErrorState, Button, PageHeader, SegmentedControl, Skeleton, StatCard, toast } from '@/components/ui';
import { ProductImage } from '@/components/product';
import { formatCount, formatPercent, useAdminStats, useUrlState } from './master/lib';
import { StatsSkeleton, StockDot } from './master/ui';
import { CategoryChart, LegendItem, OrdersByHourChart, RevenueByDayChart, SERIES, ShareBar } from './master/stats/charts';

const RANGES = [7, 30, 90] as const;

/** Vergleich mit dem Vorzeitraum gleicher Länge – nur, wenn es dort schon vollständige Daten gibt */
function usePreviousPeriod(days: number, currentOrders: number | undefined) {
  const { data } = useQuery({ queryKey: qk.adminStats(days * 2), queryFn: () => api.adminGetStats(days * 2), staleTime: 60_000 });
  return useMemo(() => {
    if (!data) return null;
    const prevDays = data.revenueByDay.slice(0, data.revenueByDay.length - days);
    const firstWithOrders = data.revenueByDay.find((d) => d.orders > 0)?.date;
    if (!prevDays.length || !firstWithOrders || firstWithOrders > addDays(prevDays[0].date, 3)) return null;
    const revenue = prevDays.reduce((s, d) => s + d.b2c + d.b2b, 0);
    const orders = prevDays.reduce((s, d) => s + d.orders, 0);
    // Vorzeitraum nur vergleichen, wenn er ähnlich dicht mit Daten belegt ist (sonst irreführende Prozentwerte)
    if (!revenue || !orders || (currentOrders !== undefined && orders < currentOrders * 0.4)) return null;
    return { revenue, orders, avg: Math.round(revenue / orders) };
  }, [data, days, currentOrders]);
}

function trend(current: number, previous: number | undefined) {
  if (!previous) return undefined;
  return { value: ((current - previous) / previous) * 100, label: 'ggü. Vorzeitraum' };
}

function ChartCard({ title, subtitle, children, legend, className }: { title: string; subtitle?: string; children: ReactNode; legend?: ReactNode; className?: string }) {
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader title={title} subtitle={subtitle} className="mb-3" action={legend ? <div className="hidden flex-wrap gap-x-4 gap-y-1 sm:flex">{legend}</div> : undefined} />
      {legend ? <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 sm:hidden">{legend}</div> : null}
      {children}
    </Card>
  );
}

function exportCsv(stats: Stats) {
  const e = (c: number) => c / 100;
  const today = todayString();
  const rows: unknown[][] = [
    [`Auswertung Getränke Altinger – letzte ${stats.days} Tage (Stand ${formatDate(today, 'short')})`],
    [],
    ['Kennzahl', 'Wert'],
    ['Umsatz (€, Warenwert brutto)', e(stats.revenueTotal)],
    ['Bestellungen', stats.ordersTotal],
    ['Ø Warenkorb (€)', e(stats.avgOrderValue)],
    ['Ø Bewertung', stats.ratingAvg],
    ['Anzahl Bewertungen', stats.ratingCount],
    ['Neukunden', stats.newCustomers],
    ['Pfand im Umlauf (€)', e(stats.depositOutstanding)],
    ['Offene Posten (€)', e(stats.openInvoicesAmount)],
    ['davon überfällig (€)', e(stats.overdueInvoicesAmount)],
    ['Bestellungen Lieferung', stats.byFulfillment.delivery],
    ['Bestellungen Abholung', stats.byFulfillment.pickup],
    ['Bestellungen Privatkunden', stats.byCustomerType.b2c],
    ['Bestellungen Geschäftskunden', stats.byCustomerType.b2b],
    [],
    ['Datum', 'Umsatz Privat (€)', 'Umsatz Geschäft (€)', 'Umsatz gesamt (€)', 'Bestellungen'],
    ...stats.revenueByDay.map((d) => [formatDate(d.date, 'short'), e(d.b2c), e(d.b2b), e(d.b2c + d.b2b), d.orders]),
    [],
    ['Kategorie', 'Umsatz (€)'],
    ...stats.byCategory.map((c) => [c.name, e(c.revenue)]),
    [],
    ['Rang', 'Artikel', 'Menge (Gebinde)', 'Umsatz (€)'],
    ...stats.topProducts.map((p, i) => [i + 1, p.name, p.qty, e(p.revenue)]),
    [],
    ['Uhrzeit', 'Bestellungen'],
    ...stats.ordersByHour.map((n, h) => [`${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`, n]),
  ];
  downloadCsv(rows, `Auswertung-${stats.days}-Tage-${today}.csv`);
  toast.success('Auswertung als CSV exportiert', { description: 'Öffnet sich direkt in Excel (Semikolon, Dezimalkomma).' });
}

export default function StatsPage() {
  const { params, set: setUrl } = useUrlState();
  const raw = Number(params.get('tage'));
  const days = (RANGES as readonly number[]).includes(raw) ? raw : 30;
  const { data: stats, isLoading, error, refetch, isFetching, isPlaceholderData } = useAdminStats(days);
  const prev = usePreviousPeriod(days, stats?.ordersTotal);
  const products = useProductMap();

  const setDays = (v: string) => setUrl({ tage: v === '30' ? null : v });

  const revenueSplit = useMemo(() => {
    if (!stats) return { b2c: 0, b2b: 0 };
    return stats.revenueByDay.reduce((s, d) => ({ b2c: s.b2c + d.b2c, b2b: s.b2b + d.b2b }), { b2c: 0, b2b: 0 });
  }, [stats]);

  const rangeLabel = stats ? `${formatDate(stats.revenueByDay[0]?.date ?? todayString(), 'short')} – ${formatDate(todayString(), 'short')}` : '';

  return (
    <>
      <PageHeader
        title="Auswertungen"
        documentTitle="Statistik · Markt"
        subtitle={stats ? `Zeitraum ${rangeLabel} · Umsatz = Warenwert brutto ohne Pfand, ohne Stornos` : 'Umsatz, Bestellungen und Sortiment im Überblick'}
        actions={
          <>
            <SegmentedControl
              aria-label="Zeitraum"
              value={String(days)}
              onChange={setDays}
              options={RANGES.map((d) => ({ value: String(d), label: `${d} Tage` }))}
            />
            <Button variant="outline" icon={Download} onClick={() => stats && exportCsv(stats)} disabled={!stats}>
              CSV
            </Button>
          </>
        }
      />

      {isLoading ? (
        <>
          <StatsSkeleton className="mb-4" />
          <StatsSkeleton count={3} className="mb-6 lg:grid-cols-3" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </>
      ) : error || !stats ? (
        <Card>
          <ErrorState error={error ?? new Error('Die Auswertung konnte nicht geladen werden.')} onRetry={() => void refetch()} />
        </Card>
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && isPlaceholderData && 'opacity-60')} aria-busy={isFetching && isPlaceholderData ? true : undefined}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Umsatz" value={formatEuro(stats.revenueTotal)} trend={trend(stats.revenueTotal, prev?.revenue)} hint={!prev ? `in ${days} Tagen` : undefined} icon={Euro} tone="brand" />
            <StatCard label="Bestellungen" value={formatCount(stats.ordersTotal)} trend={trend(stats.ordersTotal, prev?.orders)} hint={!prev ? `Ø ${formatCount(Math.round(stats.ordersTotal / days))} pro Tag` : undefined} icon={ShoppingCart} tone="brand" />
            <StatCard label="Ø Warenkorb" value={formatEuro(stats.avgOrderValue)} trend={trend(stats.avgOrderValue, prev?.avg)} hint={!prev ? 'je Bestellung' : undefined} icon={ShoppingBasket} tone="success" />
            <StatCard
              label="Ø Bewertung"
              value={stats.ratingCount ? `${stats.ratingAvg.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5` : '–'}
              hint={`${formatCount(stats.ratingCount)} Bewertungen insgesamt`}
              icon={Star}
              tone="accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <StatCard label="Neukunden" value={formatCount(stats.newCustomers)} hint={`registriert in ${days} Tagen`} icon={UserPlus} tone="success" />
            <StatCard label="Pfand im Umlauf" value={formatEuro(stats.depositOutstanding)} hint="Leergut bei Kunden" icon={Recycle} tone="neutral" />
            <Link to="/admin/rechnungen" className="col-span-2 block rounded-2xl lg:col-span-1">
              <StatCard
                label="Offene Posten"
                value={formatEuro(stats.openInvoicesAmount)}
                hint={stats.overdueInvoicesAmount ? <span className="font-semibold text-red-600">davon {formatEuro(stats.overdueInvoicesAmount)} überfällig</span> : 'nichts überfällig'}
                icon={Receipt}
                tone={stats.overdueInvoicesAmount ? 'danger' : 'warning'}
                className="h-full transition-shadow hover:shadow-raised"
              />
            </Link>
          </div>

          <ChartCard
            title="Umsatz je Tag"
            subtitle="nach Liefer-/Abholtag, gestapelt nach Kundenart"
            legend={
              <>
                <LegendItem color={SERIES.b2c}>Privatkunden</LegendItem>
                <LegendItem color={SERIES.b2b}>Geschäftskunden</LegendItem>
              </>
            }
          >
            {stats.ordersTotal ? <RevenueByDayChart data={stats.revenueByDay} days={days} /> : <EmptyState icon={BarChart3} title="Keine Umsätze im Zeitraum" />}
          </ChartCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <ChartCard title="Bestellungen nach Uhrzeit" subtitle="Zeitpunkt des Bestelleingangs (Uhr)">
              <OrdersByHourChart hours={stats.ordersByHour} />
            </ChartCard>
            <ChartCard title="Anteile" subtitle="Lieferart und Kundenart im Zeitraum">
              <div className="space-y-6 pt-1">
                <ShareBar
                  title="Bestellungen nach Lieferart"
                  unit="Anzahl Bestellungen"
                  segments={[
                    { label: 'Lieferung', value: stats.byFulfillment.delivery, color: SERIES.delivery },
                    { label: 'Abholung', value: stats.byFulfillment.pickup, color: SERIES.pickup },
                  ]}
                />
                <ShareBar
                  title="Bestellungen nach Kundenart"
                  unit="Anzahl Bestellungen"
                  segments={[
                    { label: 'Privatkunden', value: stats.byCustomerType.b2c, color: SERIES.b2c },
                    { label: 'Geschäftskunden', value: stats.byCustomerType.b2b, color: SERIES.b2b },
                  ]}
                />
                <ShareBar
                  title="Umsatz nach Kundenart"
                  unit="Warenwert brutto"
                  segments={[
                    { label: 'Privatkunden', value: revenueSplit.b2c, color: SERIES.b2c, format: formatEuro },
                    { label: 'Geschäftskunden', value: revenueSplit.b2b, color: SERIES.b2b, format: formatEuro },
                  ]}
                />
                {stats.byCustomerType.b2b && stats.byCustomerType.b2c ? (
                  <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
                    Ø Warenkorb Privat <strong className="tabular-nums text-slate-900">{formatEuro(Math.round(revenueSplit.b2c / stats.byCustomerType.b2c))}</strong> · Geschäft{' '}
                    <strong className="tabular-nums text-slate-900">{formatEuro(Math.round(revenueSplit.b2b / stats.byCustomerType.b2b))}</strong>
                  </p>
                ) : null}
              </div>
            </ChartCard>
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Card padding="none" className="min-w-0 overflow-hidden">
              <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                <CardHeader title="Top-Artikel" subtitle="nach Umsatz im Zeitraum" icon={Trophy} className="mb-3" />
              </div>
              {stats.topProducts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-y border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="w-10 py-2.5 pl-4 pr-2 sm:pl-5">#</th>
                        <th className="px-2 py-2.5">Artikel</th>
                        <th className="px-2 py-2.5 text-right">Menge</th>
                        <th className="px-2 py-2.5 text-right">Umsatz</th>
                        <th className="hidden py-2.5 pl-2 pr-5 sm:table-cell">Anteil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.topProducts.map((p, i) => {
                        const product = products.get(p.productId);
                        const share = stats.revenueTotal ? (p.revenue / stats.revenueTotal) * 100 : 0;
                        const maxShare = stats.revenueTotal ? (stats.topProducts[0].revenue / stats.revenueTotal) * 100 : 1;
                        return (
                          <tr key={p.productId}>
                            <td className="py-2.5 pl-4 pr-2 font-semibold tabular-nums text-slate-400 sm:pl-5">{i + 1}</td>
                            <td className="px-2 py-2">
                              <div className="flex min-w-0 items-center gap-3">
                                {product ? (
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                                    <ProductImage product={product} size={36} />
                                  </span>
                                ) : null}
                                {product ? (
                                  <Link to={`/admin/sortiment/${encodeURIComponent(product.id)}`} className="min-w-0 max-w-[15rem] hover:text-brand-700">
                                    <span className="block truncate font-medium text-slate-900">{p.name}</span>
                                    <span className="block truncate text-xs text-slate-500">{product.packaging}</span>
                                  </Link>
                                ) : (
                                  <span className="font-medium text-slate-900">{p.name}</span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-700">{formatCount(p.qty)}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums text-slate-900">{formatEuro(p.revenue)}</td>
                            <td className="hidden py-2 pl-2 pr-5 sm:table-cell">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-12 overflow-hidden rounded-full bg-slate-100 2xl:w-20">
                                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(share / maxShare) * 100}%` }} />
                                </span>
                                <span className="w-11 whitespace-nowrap text-right text-xs tabular-nums text-slate-500">{formatPercent(share, 1)}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={Trophy} title="Noch keine Verkäufe im Zeitraum" />
              )}
            </Card>
            <div className="min-w-0 space-y-6">
              <ChartCard title="Umsatz nach Kategorie" subtitle="Warenwert brutto">
                {stats.byCategory.length ? <CategoryChart data={stats.byCategory} /> : <EmptyState icon={BarChart3} title="Keine Umsätze im Zeitraum" />}
              </ChartCard>
            {stats.lowStock.length ? (
              <Card>
                <CardHeader
                  title="Unter Meldebestand"
                  subtitle="Diese Artikel sollten nachbestellt werden"
                  icon={AlertTriangle}
                  action={
                    <Link to="/admin/sortiment?meldebestand=1" className="text-sm font-semibold text-brand-700 hover:underline">
                      Im Sortiment öffnen
                    </Link>
                  }
                />
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {stats.lowStock.map((p) => (
                    <li key={p.id}>
                      <Link to={`/admin/sortiment/${encodeURIComponent(p.id)}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/30">
                        <ProductImage product={p} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">
                            {p.brand} {p.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">{p.packaging}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-sm">
                          <StockDot level={p.stock <= 0 || p.stock < p.minStock / 2 ? 'critical' : 'low'} />
                          <span className="font-semibold tabular-nums text-slate-900">{p.stock}</span>
                          <span className="text-slate-400">/ {p.minStock}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
