/**
 * Umsatz der letzten Tage, gestapelt nach Privat- (B2C) und Geschäftskunden (B2B).
 */
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import type { Stats } from '@shared/types';
import { WEEKDAY_SHORT, formatDate, formatEuro } from '@shared/format';
import { todayString, weekdayOf } from '@shared/time';

/** Serienfarben (validiert: CVD-Abstand ausreichend; Legende + Tooltip als Zweitkodierung) */
export const SERIES = { b2c: '#1d58a0', b2b: '#d08300' } as const;

interface Row {
  date: string;
  label: string;
  b2c: number;
  b2b: number;
  orders: number;
  today: boolean;
}

function euroShort(cents: number): string {
  return formatEuro(Math.round(cents / 10000) * 10000).replace(/,00\s/, ' ');
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="min-w-48 rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-raised backdrop-blur">
      <p className="mb-2 font-semibold text-slate-900">
        {formatDate(row.date, 'long')}
        {row.today ? <span className="ml-1 font-normal text-slate-500">(heute)</span> : null}
      </p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES.b2c }} aria-hidden />
            Privatkunden
          </dt>
          <dd className="font-medium tabular-nums text-slate-900">{formatEuro(row.b2c)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES.b2b }} aria-hidden />
            Geschäftskunden
          </dt>
          <dd className="font-medium tabular-nums text-slate-900">{formatEuro(row.b2b)}</dd>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-slate-100 pt-1.5">
          <dt className="font-semibold text-slate-700">Gesamt · {row.orders} Best.</dt>
          <dd className="font-bold tabular-nums text-slate-900">{formatEuro(row.b2c + row.b2b)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function RevenueChart({ data, height = 260 }: { data: Stats['revenueByDay']; height?: number | string }) {
  const today = todayString();
  const rows = useMemo<Row[]>(
    () =>
      data.map((d) => ({
        ...d,
        today: d.date === today,
        label: `${WEEKDAY_SHORT[weekdayOf(d.date)]} ${d.date.slice(8, 10)}.`,
      })),
    [data, today],
  );
  return (
    <div style={{ height }} className="w-full min-h-[240px] flex-1" role="img" aria-label="Balkendiagramm: Umsatz je Tag, gestapelt nach Privat- und Geschäftskunden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fill: '#64748b', fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={(v: number) => euroShort(v)}
            width={64}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Bar dataKey="b2c" name="Privatkunden" stackId="rev" fill={SERIES.b2c} maxBarSize={24} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="b2b" name="Geschäftskunden" stackId="rev" fill={SERIES.b2b} maxBarSize={24} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES.b2c }} aria-hidden />
        Privatkunden (B2C)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES.b2b }} aria-hidden />
        Geschäftskunden (B2B)
      </span>
    </div>
  );
}
