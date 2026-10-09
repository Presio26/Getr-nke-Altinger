import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Beer,
  CalendarDays,
  Clock,
  CupSoda,
  Info,
  PartyPopper,
  ShoppingCart,
  Snowflake,
  Sparkles,
  Sun,
  Tent,
  Undo2,
  Users,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import type { Product } from '@shared/types';
import { formatDate, formatEuro, formatLiters } from '@shared/format';
import { addDays, todayString } from '@shared/time';
import { computePrice, useDepositTypes, useMyCustomer, useProducts, usePrice } from '@/api/hooks';
import { useCart } from '@/stores/cart';
import { cn } from '@/lib/cn';
import { ProductImage, productTint, useTouchStepperSize } from '@/components/product';
import { Badge, Button, Card, Input, QuantityStepper, SegmentedControl, Skeleton, toast } from '@/components/ui';
import { StickyActionBar } from '@/components/layout/StickyActionBar';
import { ChipGroup } from '@/features/account/components/ChipGroup';
import { BEER_OPTIONS, buildPlan, DEFAULT_INPUT, MIX_PRESETS, RATES, rebalance, type BeerChoice, type Mix, type PlanGroup, type PlannerInput } from '../lib/planner';
import { isValidEventDate, useRentalAvailability } from '../lib/useRentalAvailability';

const MIX_META: { key: keyof Mix; label: string; icon: LucideIcon; color: string }[] = [
  { key: 'beer', label: 'Bier', icon: Beer, color: '#d97706' },
  { key: 'wine', label: 'Wein & Sekt', icon: Wine, color: '#9f1239' },
  { key: 'soft', label: 'Alkoholfrei', icon: CupSoda, color: '#0d9488' },
];

const GROUP_TITLE: Record<PlanGroup, string> = {
  drinks: 'Getränke (auf Kommission)',
  extras: 'Dazu',
  rental: 'Leihartikel',
};

function Field({ label, aside, children, icon: Icon }: { label: string; aside?: ReactNode; children: ReactNode; icon?: LucideIcon }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {Icon ? <Icon size={16} aria-hidden className="text-slate-400" /> : null}
          {label}
        </span>
        {aside ? <span className="text-sm font-semibold tabular-nums text-brand-700">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Schieberegler mit großer Trefferfläche (44 px) und Daumen (28 px); Füllfarbe je Getränk */
function Range({ value, min, max, step = 1, onChange, label, color = 'var(--color-brand-700)', className }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void; label: string; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--range-fill' as string]: color, ['--range-pct' as string]: `${pct}%` }}
      className={cn(
        'h-11 w-full cursor-pointer touch-pan-y appearance-none bg-transparent focus-visible:outline-none',
        '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full',
        '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--range-fill)_var(--range-pct),var(--color-slate-200)_var(--range-pct))]',
        '[&::-webkit-slider-thumb]:-mt-2.5 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
        '[&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-[var(--range-fill)] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md',
        'focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-brand-200',
        '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-slate-200',
        '[&::-moz-range-progress]:h-2 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-[var(--range-fill)]',
        '[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-[var(--range-fill)] [&::-moz-range-thumb]:bg-white',
        className,
      )}
    />
  );
}

/** Ganze Zeile als Schalter (Beschriftung und Beschreibung sind klickbar, Trefferfläche ≥ 44 px) */
function ToggleRow({ checked, onChange, icon: Icon, label, description }: { checked: boolean; onChange: (v: boolean) => void; icon: LucideIcon; label: string; description: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[15px] font-medium text-slate-800">
          <Icon size={16} aria-hidden className="shrink-0 text-slate-400" /> {label}
        </span>
        <span className="mt-0.5 block text-sm text-slate-500">{description}</span>
      </span>
      <span aria-hidden className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200', checked ? 'bg-brand-700' : 'bg-slate-300')}>
        <span
          className={cn(
            'inline-block h-5.5 w-5.5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-200',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-[0.25rem]',
          )}
        />
      </span>
    </button>
  );
}

/** Jahreszeit aus dem Festdatum: Mai–September = Sommer */
function seasonFor(day: string): PlannerInput['season'] {
  const month = Number(day.slice(5, 7));
  return month >= 5 && month <= 9 ? 'summer' : 'winter';
}

interface RowProps {
  product: Product;
  qty: number;
  recommended: number;
  reason: string;
  limit?: { available: number; total: number };
  onChange: (n: number) => void;
}

function PlanRow({ product, qty, recommended, reason, limit, onChange }: RowProps) {
  const price = usePrice(product, Math.max(1, qty));
  const stepper = useTouchStepperSize();
  const line = price.showNet ? price.price.lineNet : price.price.lineGross;
  const off = qty === 0;
  const max = product.isRental ? Math.max(0, limit?.available ?? product.stock) : 999;
  return (
    <li className="py-3">
      <div className={cn('flex gap-3', off && 'opacity-55')}>
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: productTint(product) }}>
          <ProductImage product={product} className="absolute inset-0 p-0.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold leading-snug text-slate-900">
            {product.isRental ? product.name : `${product.brand} ${product.name}`}
          </span>
          <span className="block text-xs leading-snug text-slate-500">{reason}</span>
          {limit && limit.available < recommended ? (
            <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700">
              <AlertTriangle size={12} aria-hidden />
              {limit.available ? `nur noch ${limit.available} von ${limit.total} frei` : 'an diesem Tag ausgebucht'}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 pl-15">
        <span className="min-w-0 text-xs">
          <span className={cn('block font-semibold tabular-nums text-slate-800', off && 'opacity-55')}>{off ? 'nicht übernommen' : formatEuro(line)}</span>
          {!off && qty > 1 ? <span className="block tabular-nums text-slate-400">{qty} × {formatEuro(price.displayUnit)}</span> : null}
          {qty !== recommended && !off ? <span className="block text-slate-400">Empfehlung {recommended}</span> : null}
        </span>
        <QuantityStepper value={qty} onChange={onChange} min={0} max={max} size={stepper} removeAtMin label={product.name} className="shrink-0" />
      </div>
    </li>
  );
}

function LitersBar({ liters }: { liters: { beer: number; wine: number; soft: number; water: number; total: number } }) {
  const parts = [
    { key: 'beer', label: 'Bier', value: liters.beer, color: '#d97706' },
    { key: 'wine', label: 'Wein', value: liters.wine, color: '#9f1239' },
    { key: 'soft', label: 'Alkoholfrei', value: liters.soft, color: '#0d9488' },
    { key: 'water', label: 'Wasser', value: liters.water, color: '#0284c7' },
  ].filter((p) => p.value > 0.05);
  const total = liters.total || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/10" aria-hidden>
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="h-full first:rounded-l-full last:rounded-r-full" />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.label} <span className="font-semibold tabular-nums text-white">{formatLiters(Math.round(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface PartyPlannerProps {
  eventDate: string;
  onEventDateChange: (date: string) => void;
}

/** Party-Planer: Eingaben → Empfehlung (Getränke + Leihartikel) → alles in den Warenkorb */
export function PartyPlanner({ eventDate, onEventDateChange }: PartyPlannerProps) {
  const { data: products, isLoading } = useProducts();
  const { data: customer } = useMyCustomer();
  const depositTypes = useDepositTypes();
  const navigate = useNavigate();
  const [input, setInput] = useState<PlannerInput>(() => ({
    ...DEFAULT_INPUT,
    season: seasonFor(isValidEventDate(eventDate) ? eventDate : todayString()),
  }));
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const availability = useRentalAvailability(eventDate);
  const tomorrow = addDays(todayString(), 1);
  const stepper = useTouchStepperSize();

  // Mobil: schwebende Zusammenfassung, solange der Planer sichtbar ist und der Abschluss-Bereich noch nicht
  const rootRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const footer = footerRef.current;
    if (!root || !footer || typeof IntersectionObserver === 'undefined') return;
    let inRoot = false;
    let footerVisible = false;
    const update = () => setShowBar(inRoot && !footerVisible);
    const o1 = new IntersectionObserver(([e]) => {
      inRoot = e.isIntersecting;
      update();
    }, { rootMargin: '-35% 0px -35% 0px' });
    const o2 = new IntersectionObserver(([e]) => {
      footerVisible = e.isIntersecting;
      update();
    });
    o1.observe(root);
    o2.observe(footer);
    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  const productMap = useMemo(() => new Map((products ?? []).filter((p) => p.active).map((p) => [p.id, p])), [products]);
  const plan = useMemo(() => buildPlan(input, productMap), [input, productMap]);

  // Jahreszeit folgt dem Festdatum (bleibt danach von Hand änderbar)
  const [seasonFromDate, setSeasonFromDate] = useState(isValidEventDate(eventDate));
  useEffect(() => {
    if (!isValidEventDate(eventDate)) return;
    setInput((prev) => (prev.season === seasonFor(eventDate) ? prev : { ...prev, season: seasonFor(eventDate) }));
    setSeasonFromDate(true);
  }, [eventDate]);

  // Eigene Mengen gelten nur für die aktuelle Empfehlung
  const inputKey = JSON.stringify(input);
  useEffect(() => setOverrides({}), [inputKey]);

  const set = <K extends keyof PlannerInput>(key: K, value: PlannerInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));

  const rows = plan.lines
    .map((l) => {
      const product = productMap.get(l.productId);
      if (!product) return null;
      const limit = product.isRental && availability.valid ? availability.map.get(product.id) : undefined;
      const recommended = limit ? Math.min(l.qty, limit.available) : l.qty;
      const qty = overrides[l.productId] ?? recommended;
      return { ...l, product, limit, recommended, qty };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);

  const totals = (() => {
    let drinks = 0;
    let rental = 0;
    let deposit = 0;
    let showNet = customer?.type === 'b2b';
    for (const r of rows) {
      if (r.qty <= 0) continue;
      const p = computePrice(r.product, customer ?? null, r.qty, depositTypes);
      showNet = p.showNet;
      const value = p.showNet ? p.price.lineNet : p.price.lineGross;
      if (r.product.isRental) rental += value;
      else drinks += value;
      deposit += p.price.depositTotal;
    }
    return { drinks, rental, deposit, showNet, total: drinks + rental };
  })();

  const selected = rows.filter((r) => r.qty > 0);
  const presetId = MIX_PRESETS.find((p) => p.mix.beer === input.mix.beer && p.mix.wine === input.mix.wine && p.mix.soft === input.mix.soft)?.id ?? null;
  const dateOk = isValidEventDate(eventDate);

  const addAll = () => {
    if (!dateOk) {
      toast.error('Bitte wählen Sie das Datum Ihres Festes (frühestens morgen).');
      document.getElementById('planner-date')?.focus();
      return;
    }
    if (!selected.length) return;
    const cart = useCart.getState();
    for (const r of selected) cart.add(r.product.id, r.qty);
    cart.set({ eventDate, commission: true });
    toast.success('Ihr Fest ist im Warenkorb', {
      description: `${selected.length} Positionen für den ${formatDate(eventDate, 'short')} – volle Kästen nehmen wir nach dem Fest zurück.`,
      id: 'planner-cart',
    });
    navigate('/warenkorb');
  };

  return (
    <div ref={rootRef} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
      {/* ── Eingaben ── */}
      <Card padding="lg" className="space-y-7">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            id="planner-date"
            type="date"
            label="Datum Ihres Festes"
            icon={CalendarDays}
            min={tomorrow}
            value={eventDate}
            onChange={(e) => onEventDateChange(e.target.value)}
            error={eventDate && !dateOk ? 'Bitte ein Datum ab morgen wählen.' : undefined}
            hint={dateOk ? formatDate(eventDate, 'long') : 'Für Leihartikel und Kommissionsware'}
          />
          <Field
            label="Jahreszeit"
            icon={input.season === 'summer' ? Sun : Snowflake}
            aside={seasonFromDate && dateOk ? <span className="text-xs font-medium text-slate-500">nach Festdatum</span> : undefined}
          >
            <SegmentedControl
              block
              aria-label="Jahreszeit"
              value={input.season}
              onChange={(v) => {
                setSeasonFromDate(false);
                set('season', v as PlannerInput['season']);
              }}
              options={[
                { value: 'summer', label: 'Sommer', icon: Sun },
                { value: 'winter', label: 'Winter', icon: Snowflake },
              ]}
            />
          </Field>
        </div>

        <Field
          label="Gäste"
          icon={Users}
          aside={<QuantityStepper value={input.guests} onChange={(n) => set('guests', Math.max(5, n))} min={5} max={999} size={stepper} label="Gäste" className="shrink-0" />}
        >
          <Range value={Math.min(300, input.guests)} min={10} max={300} step={5} onChange={(n) => set('guests', n)} label="Anzahl Gäste" />
        </Field>

        <Field
          label="Dauer in Stunden"
          icon={Clock}
          aside={<QuantityStepper value={input.hours} onChange={(n) => set('hours', Math.max(1, n))} min={1} max={24} size={stepper} label="Stunden" className="shrink-0" />}
        >
          <Range value={Math.min(12, input.hours)} min={2} max={12} onChange={(n) => set('hours', n)} label="Dauer in Stunden" />
        </Field>

        <Field label="Getränke-Mix" icon={PartyPopper}>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {MIX_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set('mix', { ...p.mix })}
                aria-pressed={presetId === p.id}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                  presetId === p.id ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-3.5">
            {MIX_META.map((m) => (
              <div key={m.key} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 sm:grid-cols-[9rem_minmax(0,1fr)_3rem]">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}>
                    <m.icon size={15} aria-hidden />
                  </span>
                  {m.label}
                </span>
                <Range
                  value={input.mix[m.key]}
                  min={0}
                  max={100}
                  onChange={(n) => set('mix', rebalance(input.mix, m.key, n))}
                  label={`Anteil ${m.label}`}
                  color={m.color}
                  className="order-last col-span-2 -mt-1 sm:order-none sm:col-span-1 sm:mt-0"
                />
                <span className="text-right text-sm font-semibold tabular-nums text-slate-900">{input.mix[m.key]} %</span>
              </div>
            ))}
          </div>
        </Field>

        <Field label="Bier vom Fass bzw. aus dem Kasten" icon={Beer}>
          <ChipGroup<BeerChoice>
            aria-label="Biersorte"
            value={input.beer}
            onChange={(v) => set('beer', v)}
            columns={3}
            stackBelow={400}
            size="sm"
            options={(Object.keys(BEER_OPTIONS) as BeerChoice[]).map((k) => ({
              value: k,
              label: BEER_OPTIONS[k].label,
              hint: productMap.get(BEER_OPTIONS[k].keg)?.packaging ?? '',
            }))}
          />
        </Field>

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
          <ToggleRow
            checked={input.outdoor}
            onChange={(v) => set('outdoor', v)}
            icon={Tent}
            label="Feier im Freien"
            description="Wir planen Partyzelte ein – im Winter auch Heizstrahler."
          />
          <ToggleRow checked={input.sekt} onChange={(v) => set('sekt', v)} icon={Sparkles} label="Sekt zum Anstoßen" description="Ein Glas zur Begrüßung für alle Gäste." />
        </div>

        <p className="flex gap-2 text-xs leading-relaxed text-slate-500">
          <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
          Faustregeln pro Person und Stunde: Bier {formatLiters(RATES.beer)}, Alkoholfreies {formatLiters(RATES.soft)}, Wein {formatLiters(RATES.wine)} – jeweils für den
          gewählten Anteil der Gäste, dazu Wasser für alle. Im Sommer rechnen wir 15 % mehr. Ab {RATES.kegFromLiters} l Bier empfehlen wir Fass statt Kästen.
        </p>
      </Card>

      {/* ── Empfehlung ── */}
      <section
        aria-label="Ihre Empfehlung"
        className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-raised lg:sticky lg:top-36 lg:flex lg:max-h-[calc(100dvh-10rem)] lg:flex-col"
      >
        <div className="shrink-0 bg-gradient-to-br from-brand-800 to-brand-950 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-300">Ihre Empfehlung</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">
            ≈ {formatLiters(Math.round(plan.liters.total))} Getränke
          </p>
          <p className="text-sm text-white/75">
            für {input.guests} Gäste · {input.hours} Stunden
            {plan.kegs ? ` · ${plan.kegs} ${plan.kegs === 1 ? 'Fass' : 'Fässer'}` : ''}
            {plan.crates ? ` · ${plan.crates} Kästen` : ''}
            {plan.bottles ? ` · ${plan.bottles} Flaschen` : ''}
          </p>
          <div className="mt-4">
            <LitersBar liters={plan.liters} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-5 lg:min-h-0 lg:flex-1">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <div className="px-5 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
            {(['drinks', 'extras', 'rental'] as PlanGroup[]).map((group) => {
              const list = rows.filter((r) => r.group === group);
              if (!list.length) return null;
              return (
                <div key={group} className="pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{GROUP_TITLE[group]}</h3>
                    {group === 'rental' && dateOk ? <span className="text-xs text-slate-500">für {formatDate(eventDate, 'medium')}</span> : null}
                    {group === 'rental' && availability.isFetching ? <span className="text-xs text-slate-400">Verfügbarkeit wird geprüft …</span> : null}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {list.map((r) => (
                      <PlanRow
                        key={r.productId}
                        product={r.product}
                        qty={r.qty}
                        recommended={r.recommended}
                        reason={r.reason}
                        limit={r.limit}
                        onChange={(n) => setOverrides((o) => ({ ...o, [r.productId]: n }))}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div ref={footerRef} className="shrink-0 border-t border-slate-100 bg-slate-50/70 p-5">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Getränke & Zubehör</dt>
              <dd className="font-medium tabular-nums text-slate-900">{formatEuro(totals.drinks)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Leihartikel</dt>
              <dd className="font-medium tabular-nums text-slate-900">{formatEuro(totals.rental)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Pfand (wird bei Rückgabe erstattet)</dt>
              <dd className="font-medium tabular-nums text-slate-900">{formatEuro(totals.deposit)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-900">Gesamt ca.{totals.showNet ? ' (netto)' : ''}</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{formatEuro(totals.total + totals.deposit)}</dd>
            </div>
          </dl>
          <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-800">
            <Undo2 size={13} aria-hidden className="mt-0.5 shrink-0" />
            Kommission: Volle, ungeöffnete Kästen nehmen wir nach dem Fest zurück – Sie zahlen nur, was getrunken wurde.
          </p>
          <Button size="lg" block icon={ShoppingCart} className="mt-4" onClick={addAll} disabled={!selected.length || isLoading}>
            Alles in den Warenkorb
          </Button>
          {!dateOk ? (
            <p className="mt-2 text-center text-xs font-medium text-amber-700">Bitte wählen Sie oben das Datum Ihres Festes.</p>
          ) : (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
              <Badge tone="brand">Fest am {formatDate(eventDate, 'short')}</Badge> Lieferung oder Abholung wählen Sie an der Kasse.
            </p>
          )}
        </div>
      </section>

      {showBar && selected.length ? (
        <StickyActionBar className="animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-xs leading-tight text-slate-500">
                {input.guests} Gäste · {selected.length} Pos.{totals.showNet ? ' · netto' : ''}
              </p>
              <p className="whitespace-nowrap text-lg font-bold leading-tight tabular-nums text-slate-900">ca. {formatEuro(totals.total + totals.deposit)}</p>
            </div>
            <div className="min-w-0 flex-1">
              <Button icon={ShoppingCart} onClick={addAll} block className="h-12 px-3">
                <span className="block whitespace-normal text-center text-[15px] leading-tight">In den Warenkorb</span>
              </Button>
            </div>
          </div>
        </StickyActionBar>
      ) : null}
    </div>
  );
}
