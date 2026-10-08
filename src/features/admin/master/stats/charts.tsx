/**
 * Diagramme der Auswertung (recharts 2.15). Farben: B2C = Altinger-Blau, B2B = Bier-Gold (dunkler Ton, validiert
 * auf Farbsehschwäche-Abstand); Text immer in Grautönen, Identität über Legende + Farbmarke.
 */
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import type { Stats } from '@shared/types';
import { formatDate, formatEuro, WEEKDAY_SHORT } from '@shared/format';
import { weekdayOf } from '@shared/time';
import { cn } from '@/lib/cn';
import { formatCount, formatPercent } from '../lib';

export const SERIES = {
  b2c: '#1d58a0',
  b2b: '#d08300',
  single: '#1d58a0',
  delivery: '#1d58a0',
  pickup: '#d08300',
} as const;

const AXIS = { fontSize: 12, fill: '#64748b' };
const GRID = '#e2e8f0';

/** Euro-Achse ohne Cent: 1.250 € */
function euroAxis(cents: number): string {
  return `${Math.round(cents / 100).toLocaleString('de-DE')} €`;
}

export function LegendItem({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}

function TooltipBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-44 rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 text-sm shadow-raised backdrop-blur">
      <p className="mb-1.5 font-semibold text-slate-900">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function TooltipRow({ color, label, value, strong }: { color?: string; label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-4', strong ? 'border-t border-slate-100 pt-1 font-semibold text-slate-900' : 'text-slate-600')}>
      <span className="inline-flex items-center gap-2">
        {color ? <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} /> : null}
        {label}
      </span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

// ───────────────────────────── Umsatz je Tag ─────────────────────────────

type DayRow = Stats['revenueByDay'][number];

function RevenueTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as DayRow;
  return (
    <TooltipBox title={formatDate(row.date, 'long')}>
      <TooltipRow color={SERIES.b2c} label="Privatkunden" value={formatEuro(row.b2c)} />
      <TooltipRow color={SERIES.b2b} label="Geschäftskunden" value={formatEuro(row.b2b)} />
      <TooltipRow label="Umsatz gesamt" value={formatEuro(row.b2c + row.b2b)} strong />
      <TooltipRow label="Bestellungen" value={formatCount(row.orders)} />
    </TooltipBox>
  );
}

export function RevenueByDayChart({ data, days }: { data: DayRow[]; days: number }) {
  const tick = (d: string) => (days <= 7 ? `${WEEKDAY_SHORT[weekdayOf(d)]} ${d.slice(8, 10)}.${d.slice(5, 7)}.` : `${d.slice(8, 10)}.${d.slice(5, 7)}.`);
  const interval = days <= 7 ? 0 : 'preserveStartEnd';
  return (
    <div className="h-72 w-full sm:h-80" role="img" aria-label="Umsatz je Tag, gestapelt nach Privat- und Geschäftskunden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={days <= 7 ? '30%' : '18%'}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="date" tickFormatter={tick} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={interval} minTickGap={18} />
          <YAxis tickFormatter={euroAxis} tick={AXIS} tickLine={false} axisLine={false} width={64} />
          <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Bar dataKey="b2c" name="Privatkunden" stackId="rev" fill={SERIES.b2c} maxBarSize={24} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="b2b" name="Geschäftskunden" stackId="rev" fill={SERIES.b2b} maxBarSize={24} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────────────────────── Bestellungen nach Uhrzeit ─────────────────────────────

function HourTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { hour: number; orders: number };
  return (
    <TooltipBox title={`${String(row.hour).padStart(2, '0')}:00–${String(row.hour + 1).padStart(2, '0')}:00 Uhr`}>
      <TooltipRow label="Bestellungen" value={formatCount(row.orders)} />
    </TooltipBox>
  );
}

export function OrdersByHourChart({ hours }: { hours: number[] }) {
  const first = Math.min(6, Math.max(0, hours.findIndex((n) => n > 0)));
  const lastIdx = hours.length - 1 - [...hours].reverse().findIndex((n) => n > 0);
  const last = Math.max(22, lastIdx >= 0 ? lastIdx : 22);
  const data = hours.map((orders, hour) => ({ hour, orders })).filter((r) => r.hour >= first && r.hour <= last);
  const max = Math.max(...data.map((d) => d.orders));
  return (
    <div className="h-64 w-full" role="img" aria-label="Bestellungen nach Uhrzeit des Bestelleingangs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: -12 }} barCategoryGap="18%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}`} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={1} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<HourTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Bar dataKey="orders" name="Bestellungen" fill={SERIES.single} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="orders" position="top" fontSize={11} fill="#475569" formatter={(v: number) => (v === max && v > 0 ? String(v) : '')} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────────────────────── Umsatz nach Kategorie ─────────────────────────────

function CategoryTooltip({ active, payload, total }: TooltipProps<number, string> & { total: number }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { name: string; revenue: number };
  return (
    <TooltipBox title={row.name}>
      <TooltipRow label="Umsatz" value={formatEuro(row.revenue)} />
      <TooltipRow label="Anteil" value={formatPercent(total ? (row.revenue / total) * 100 : 0, 1)} />
    </TooltipBox>
  );
}

export function CategoryChart({ data }: { data: Stats['byCategory'] }) {
  const total = data.reduce((s, c) => s + c.revenue, 0);
  const height = Math.max(160, data.length * 38 + 16);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label="Umsatz nach Kategorie">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 84, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: '#334155' }} tickLine={false} axisLine={false} width={150} />
          <Tooltip content={<CategoryTooltip total={total} />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Bar dataKey="revenue" name="Umsatz" fill={SERIES.single} maxBarSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="revenue" position="right" fontSize={12} fill="#334155" formatter={(v: number) => formatEuro(v)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────────────────────── Anteile (100 %-Balken) ─────────────────────────────

export interface ShareSegment {
  label: string;
  value: number;
  color: string;
  /** Anzeige des Werts (z. B. formatEuro) */
  format?: (v: number) => string;
}

export function ShareBar({ title, unit, segments }: { title: string; unit: string; segments: ShareSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{unit}</p>
      </div>
      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${title}: ${segments.map((s) => `${s.label} ${formatPercent(total ? (s.value / total) * 100 : 0)}`).join(', ')}`}>
        {total
          ? segments.map((s) =>
              s.value ? <span key={s.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}: ${s.format ? s.format(s.value) : formatCount(s.value)}`} /> : null,
            )
          : null}
      </div>
      <div className="mt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1">
        {segments.map((s) => (
          <LegendItem key={s.label} color={s.color}>
            {s.label}{' '}
            <strong className="font-semibold tabular-nums text-slate-900">{formatPercent(total ? (s.value / total) * 100 : 0)}</strong>
            <span className="tabular-nums text-slate-500">({s.format ? s.format(s.value) : formatCount(s.value)})</span>
          </LegendItem>
        ))}
      </div>
    </div>
  );
}
