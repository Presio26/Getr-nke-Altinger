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
import { useUi } from '@/stores/ui';
import { cn } from '@/lib/cn';
import { ProductImage, productTint } from '@/components/product';
import { Badge, Button, Card, Input, QuantityStepper, SegmentedControl, Skeleton, Switch, toast } from '@/components/ui';
import { ChipGroup } from '@/features/account/components/ChipGroup';
import { BEER_OPTIONS, buildPlan, DEFAULT_INPUT, MIX_PRESETS, RATES, rebalance, type BeerChoice, type Mix, type PlanGroup, type PlannerInput } from '../lib/planner';
import { isValidEventDate, useRentalAvailability } from '../lib/useRentalAvailability';

const MIX_META: { key: keyof Mix; label: string; icon: LucideIcon; color: string; accent: string }[] = [
  { key: 'beer', label: 'Bier', icon: Beer, color: '#d97706', accent: 'accent-amber-600' },
  { key: 'wine', label: 'Wein & Sekt', icon: Wine, color: '#9f1239', accent: 'accent-rose-700' },
  { key: 'soft', label: 'Alkoholfrei', icon: CupSoda, color: '#0d9488', accent: 'accent-teal-600' },
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

function Range({ value, min, max, step = 1, onChange, label, className }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void; label: string; className?: string }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('h-2 w-full cursor-pointer accent-brand-700', className)}
    />
  );
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
  const line = price.showNet ? price.price.lineNet : price.price.lineGross;
  const off = qty === 0;
  const max = product.isRental ? Math.max(0, limit?.available ?? product.stock) : 999;
  return (
    <li className={cn('flex items-center gap-3 py-3', off && 'opacity-55')}>
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ background: productTint(product) }}>
        <ProductImage product={product} className="absolute inset-0 p-0.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
          {product.isRental ? product.name : `${product.brand} ${product.name}`}
        </span>
        <span className="line-clamp-2 text-xs text-slate-500">{reason}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-semibold tabular-nums text-slate-800">{off ? 'nicht übernommen' : formatEuro(line)}</span>
          {!off && qty > 1 ? <span className="hidden tabular-nums text-slate-400 sm:inline">{qty} × {formatEuro(price.displayUnit)}</span> : null}
          {qty !== recommended && !off ? <span className="text-slate-400">· Empfehlung {recommended}</span> : null}
        </span>
        {limit && limit.available < recommended ? (
          <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700">
            <AlertTriangle size={12} aria-hidden />
            {limit.available ? `nur noch ${limit.available} von ${limit.total} frei` : 'an diesem Tag ausgebucht'}
          </span>
        ) : null}
      </span>
      <QuantityStepper value={qty} onChange={onChange} min={0} max={max} size="sm" removeAtMin label={product.name} />
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
  const [input, setInput] = useState<PlannerInput>(DEFAULT_INPUT);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const availability = useRentalAvailability(eventDate);
  const tomorrow = addDays(todayString(), 1);
  const demoBar = useUi((st) => st.demoBarVisible);

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
          <Field label="Jahreszeit" icon={input.season === 'summer' ? Sun : Snowflake}>
            <SegmentedControl
              block
              aria-label="Jahreszeit"
              value={input.season}
              onChange={(v) => set('season', v as PlannerInput['season'])}
              options={[
                { value: 'summer', label: 'Sommer', icon: Sun },
                { value: 'winter', label: 'Winter', icon: Snowflake },
              ]}
            />
          </Field>
        </div>

        <Field label="Gäste" icon={Users} aside={`${input.guests} Personen`}>
          <div className="flex items-center gap-4">
            <Range value={Math.min(300, input.guests)} min={10} max={300} step={5} onChange={(n) => set('guests', n)} label="Anzahl Gäste" />
            <QuantityStepper value={input.guests} onChange={(n) => set('guests', Math.max(5, n))} min={5} max={999} size="sm" label="Gäste" />
          </div>
        </Field>

        <Field label="Dauer" icon={Clock} aside={`${input.hours} Stunden`}>
          <div className="flex items-center gap-4">
            <Range value={input.hours} min={2} max={12} onChange={(n) => set('hours', n)} label="Dauer in Stunden" />
            <QuantityStepper value={input.hours} onChange={(n) => set('hours', Math.max(1, n))} min={1} max={24} size="sm" label="Stunden" />
          </div>
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
              <div key={m.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3rem] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_3rem]">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${m.color}1a`, color: m.color }}>
                    <m.icon size={15} aria-hidden />
                  </span>
                  {m.label}
                </span>
                <Range value={input.mix[m.key]} min={0} max={100} onChange={(n) => set('mix', rebalance(input.mix, m.key, n))} label={`Anteil ${m.label}`} className={m.accent} />
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
            size="sm"
            options={(Object.keys(BEER_OPTIONS) as BeerChoice[]).map((k) => ({
              value: k,
              label: BEER_OPTIONS[k].label,
              hint: productMap.get(BEER_OPTIONS[k].keg)?.packaging ?? '',
            }))}
          />
        </Field>

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
          <Switch
            checked={input.outdoor}
            onChange={(v) => set('outdoor', v)}
            className="py-2"
            label={
              <span className="inline-flex items-center gap-2">
                <Tent size={16} aria-hidden className="text-slate-400" /> Feier im Freien
              </span>
            }
            description="Wir planen Partyzelte ein – im Winter auch Heizstrahler."
          />
          <Switch
            checked={input.sekt}
            onChange={(v) => set('sekt', v)}
            className="py-2"
            label={
              <span className="inline-flex items-center gap-2">
                <Sparkles size={16} aria-hidden className="text-slate-400" /> Sekt zum Anstoßen
              </span>
            }
            description="Ein Glas zur Begrüßung für alle Gäste."
          />
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
        <div
          className="fixed inset-x-0 z-20 px-3 animate-fade-in lg:hidden"
          style={{ bottom: `calc(env(safe-area-inset-bottom) + ${demoBar ? '8rem' : '5.25rem'})` }}
        >
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-brand-950/95 p-2.5 pl-4 text-white shadow-pop ring-1 ring-white/10 backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-white/70">
                {input.guests} Gäste · {selected.length} Positionen{totals.showNet ? ' · netto' : ''}
              </p>
              <p className="text-lg font-bold leading-tight tabular-nums">{formatEuro(totals.total + totals.deposit)}</p>
            </div>
            <Button variant="accent" icon={ShoppingCart} onClick={addAll}>
              In den Warenkorb
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
