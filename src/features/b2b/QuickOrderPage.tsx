import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardPaste,
  CreditCard,
  Eye,
  History,
  Info,
  Keyboard,
  MapPin,
  PackageSearch,
  RotateCcw,
  ShoppingCart,
  Tag,
  X,
  Zap,
} from 'lucide-react';
import type { CheckoutInput, Customer, ID, Order, Product, Quote, QuoteMessage } from '@shared/types';
import { formatDate, formatEuro } from '@shared/format';
import { computePrice, useDepositTypes, useMyCustomer, useMyOrders, useProductMap, useProducts, useQuote, type PriceInfo } from '@/api/hooks';
import { MAX_QTY, useCart, type CartData } from '@/stores/cart';
import { useUser } from '@/stores/session';
import { readJson, writeJson } from '@/lib/storage';
import { useIsDesktop } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Notice,
  PageHeader,
  QuantityStepper,
  Select,
  Skeleton,
  Spinner,
  toast,
} from '@/components/ui';
import { StickyActionBar } from '@/components/layout';
import { BusinessNav } from './components/BusinessNav';
import { PasteImportModal } from './components/PasteImportModal';
import { ProductSearch } from './components/ProductSearch';
import { betterTier, ProductThumb } from './components/ProductLine';
import { lastOrder, reorderableLines, usualItems, type UsualItem } from './lib/b2b';

// ───────────────────────────── Typen & Hilfen ─────────────────────────────

interface Row {
  productId: ID;
  qty: number;
  /** per Suche/Einfügen hinzugefügt (nicht aus der Historie) */
  added?: boolean;
}

interface Draft {
  rows: Row[];
  hidden: ID[];
}

interface Line {
  row: Row;
  product: Product;
  price: PriceInfo;
  lineNet: number;
  lineGross: number;
  deposit: number;
  usual?: UsualItem;
  tier?: { minQty: number; priceNet: number };
}

const draftKey = (userId: string) => `altinger.b2b.quickorder.${userId}`;
const clampQty = (n: number) => Math.max(0, Math.min(MAX_QTY, Math.floor(Number.isFinite(n) ? n : 0)));
const isOrderable = (p: Product | undefined): p is Product => !!p && p.active && !p.isRental;

/** Passt das (entprellte) Angebot des Cores zu den aktuellen Mengen? */
function quoteMatches(quote: Quote | undefined, items: { productId: ID; qty: number }[]): quote is Quote {
  if (!quote) return false;
  if (quote.lines.length !== items.length) return false;
  const map = new Map(items.map((i) => [i.productId, i.qty]));
  return quote.lines.every((l) => map.get(l.productId) === l.qty);
}

const HIDDEN_ERRORS = new Set(['empty', 'payment']);
const HIDDEN_WARNINGS = new Set(['slot']);

// ───────────────────────────── Mengenfeld (Matrix) ─────────────────────────────

function QtyCell({
  value,
  onChange,
  disabled,
  label,
  inputRef,
  onNavigate,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label: string;
  inputRef: (el: HTMLInputElement | null) => void;
  onNavigate: (dir: 1 | -1) => void;
}) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  useEffect(() => setDraft(value ? String(value) : ''), [value]);

  const commit = (raw: string) => {
    const n = clampQty(Number.parseInt(raw.replace(/\D/g, '') || '0', 10));
    if (n !== value) onChange(n);
    setDraft(n ? String(n) : '');
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      onNavigate(e.shiftKey ? -1 : 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      commit(draft);
      onNavigate(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      commit(draft);
      onNavigate(-1);
    } else if (e.key === '+') {
      e.preventDefault();
      onChange(clampQty(value + 1));
    } else if (e.key === '-') {
      e.preventDefault();
      onChange(clampQty(value - 1));
    } else if (e.key === 'Escape') {
      setDraft(value ? String(value) : '');
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={`Menge – ${label}`}
      placeholder="–"
      disabled={disabled}
      value={draft}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, '').slice(0, 3);
        setDraft(next);
        const n = clampQty(Number.parseInt(next || '0', 10));
        if (n !== value) onChange(n);
      }}
      onBlur={(e) => commit(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={onKeyDown}
      className={cn(
        'h-10 w-20 rounded-xl border text-center text-base font-semibold tabular-nums shadow-xs transition-[border-color,box-shadow,background-color] placeholder:font-normal placeholder:text-slate-300 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50',
        value > 0 ? 'border-brand-400 bg-brand-50/60 text-brand-900 focus:border-brand-500 focus:ring-brand-500/15' : 'border-slate-300 bg-white text-slate-900 hover:border-slate-400 focus:border-brand-500 focus:ring-brand-500/15',
      )}
    />
  );
}

// ───────────────────────────── Preis-Zelle ─────────────────────────────

function PriceCell({ line, align = 'right' }: { line: Line; align?: 'left' | 'right' }) {
  const { price, tier } = line;
  return (
    <div className={cn('leading-tight', align === 'right' ? 'text-right' : 'text-left')}>
      <span className="font-bold tabular-nums text-slate-900">{formatEuro(price.unitNet)}</span>
      {price.discounted ? (
        <s className="ml-1.5 text-xs tabular-nums text-slate-400">
          <span className="sr-only">statt </span>
          {formatEuro(price.regularUnitNet)}
        </s>
      ) : null}
      {tier ? (
        <span className="mt-1 block text-xs font-semibold text-brand-700">
          ab {tier.minQty}: {formatEuro(tier.priceNet)}
        </span>
      ) : null}
    </div>
  );
}

function LineMeta({ line }: { line: Line }) {
  const { price, usual, row } = line;
  const tierActive = price.price.priceSource === 'tier';
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {price.isOffer && price.discounted ? (
        <Badge tone="accent" icon={Tag}>
          {price.note ?? 'Angebot'}
        </Badge>
      ) : tierActive && price.note ? (
        <Badge tone="success">{price.note}</Badge>
      ) : null}
      {row.added ? (
        <Badge tone="info">hinzugefügt</Badge>
      ) : usual ? (
        <span className="text-xs text-slate-500">
          {usual.orderCount}× bestellt · meist {usual.typicalQty}
        </span>
      ) : null}
    </span>
  );
}

function StockHint({ line }: { line: Line }) {
  const { product, row } = line;
  if (product.stock <= 0) return <span className="mt-1 block text-xs font-semibold text-red-600">ausverkauft</span>;
  if (row.qty > product.stock) return <span className="mt-1 block text-xs font-semibold text-red-600">nur {product.stock} verfügbar</span>;
  return null;
}

// ───────────────────────────── Zusammenfassung ─────────────────────────────

interface SummaryRow {
  label: string;
  /** Cent oder Text (z. B. „frei Haus“) */
  value: number | string;
  muted?: boolean;
}

/** Summen der Schnellbestellung – ausschließlich aus dem Core (api.quote), nichts wird nachgerechnet */
interface QuickSummary {
  rows: SummaryRow[];
  vat: SummaryRow[];
  total: number;
  /** MwSt. nur als „darin enthalten“ (ohne Netto-Aufschlüsselung des Cores) */
  vatIncluded?: boolean;
}

function quoteSummary(q: Quote): QuickSummary {
  const t = q.totals;
  const np = t.netParts;
  const fees = t.deliveryFee + t.carryFee;
  const breakdown = (t.vatBreakdown ?? []).filter((v) => v.vat !== 0 || v.net !== 0).sort((a, b) => b.rate - a.rate);
  const breakdownOk = breakdown.length > 0 && breakdown.reduce((s, v) => s + v.vat, 0) === t.vat;
  const vat: SummaryRow[] = breakdownOk
    ? breakdown.map((v) => ({ label: `zzgl. MwSt. ${v.rate}\u00a0%`, value: v.vat }))
    : [{ label: 'zzgl. MwSt.', value: t.vat }];
  if (np) {
    const rows: SummaryRow[] = [{ label: 'Warenwert netto', value: np.items }];
    if (np.discount) rows.push({ label: 'Rabatt netto', value: -np.discount });
    rows.push(fees > 0 ? { label: 'Lieferung netto', value: np.deliveryFee + np.carryFee } : { label: 'Lieferung', value: 'frei Haus' });
    rows.push({ label: 'Pfand netto', value: np.deposit });
    if (np.depositRefund) rows.push({ label: 'Leergut netto', value: -np.depositRefund });
    return { rows, vat, total: t.total };
  }
  // ältere Daten ohne Netto-Aufschlüsselung: Bruttowerte, MwSt. als enthaltener Betrag
  const rows: SummaryRow[] = [{ label: 'Warenwert brutto', value: t.itemsGross }];
  if (t.discount) rows.push({ label: 'Rabatt', value: -t.discount });
  rows.push(fees > 0 ? { label: 'Lieferung', value: fees } : { label: 'Lieferung', value: 'frei Haus' });
  rows.push({ label: 'Pfand', value: t.deposit });
  if (t.depositRefund) rows.push({ label: 'Leergut', value: -t.depositRefund });
  return { rows, vat: [{ label: 'darin enthaltene MwSt.', value: t.vat, muted: true }], total: t.total, vatIncluded: true };
}

interface SummaryProps {
  customer: Customer | null;
  positions: number;
  units: number;
  /** Summe der Positionen netto (sofort, ohne Core-Antwort) */
  goodsNet: number;
  /** Summen des Cores (null = noch nicht berechnet) */
  summary: QuickSummary | null;
  calculating: boolean;
  /** Preisberechnung fehlgeschlagen (z. B. keine Verbindung) */
  failed?: boolean;
  messages: { errors: QuoteMessage[]; warnings: QuoteMessage[] };
  costCenter: string;
  onCostCenter: (v: string) => void;
  reference: string;
  onReference: (v: string) => void;
  onAddToCart: () => void;
  onCheckout: () => void;
  onReset: () => void;
  addButtonRef?: (el: HTMLButtonElement | null) => void;
  className?: string;
}

function SummaryCard({
  customer,
  positions,
  units,
  goodsNet,
  summary,
  calculating,
  failed = false,
  messages,
  costCenter,
  onCostCenter,
  reference,
  onReference,
  onAddToCart,
  onCheckout,
  onReset,
  addButtonRef,
  className,
}: SummaryProps) {
  const address = customer?.addresses.find((a) => a.id === customer.defaultAddressId) ?? customer?.addresses[0];
  const costCenters = customer?.b2b?.costCenters ?? [];
  const empty = positions === 0;
  const blocking = messages.errors.length > 0;

  const row = (label: string, value: string, opts: { strong?: boolean; muted?: boolean } = {}) => (
    <div key={label} className={cn('flex items-baseline justify-between gap-3', opts.strong ? 'text-base font-bold text-slate-900' : 'text-[15px] text-slate-600')}>
      <dt className={cn(opts.muted && 'text-slate-500')}>{label}</dt>
      <dd className={cn('tabular-nums', opts.strong ? 'text-lg' : opts.muted ? 'text-slate-500' : 'font-medium text-slate-900')}>{value}</dd>
    </div>
  );
  const money = (v: number | string) => (typeof v === 'string' ? v : formatEuro(v));
  // ohne Mengen bzw. vor der ersten Berechnung: nur der Warenwert, Rest offen
  const shown = empty ? null : summary;

  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <div className="px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Ihre Bestellung</h2>
          {calculating ? <Spinner size={16} label="Wird berechnet" /> : null}
        </div>
        <p className="text-sm text-slate-500">
          {empty ? 'Noch keine Mengen erfasst' : `${positions} ${positions === 1 ? 'Position' : 'Positionen'} · ${units} Gebinde`}
        </p>
      </div>

      <dl className={cn('space-y-1.5 border-t border-slate-100 px-5 py-3.5 transition-opacity', calculating && shown && 'opacity-60')} aria-busy={calculating || undefined}>
        {shown ? (
          <>
            {shown.rows.map((r) => row(r.label, money(r.value), { muted: r.muted }))}
            {!shown.vatIncluded ? shown.vat.map((r) => row(r.label, money(r.value))) : null}
            <div className="!mt-2.5 border-t border-dashed border-slate-200 pt-2.5">{row('Gesamt brutto', formatEuro(shown.total), { strong: true })}</div>
            {shown.vatIncluded ? shown.vat.map((r) => row(r.label, money(r.value), { muted: true })) : null}
          </>
        ) : (
          <>
            {row('Warenwert netto', formatEuro(goodsNet))}
            {row('Lieferung, Pfand, MwSt.', empty ? '–' : failed ? 'derzeit nicht berechenbar' : 'wird berechnet …', { muted: true })}
            <div className="!mt-2.5 border-t border-dashed border-slate-200 pt-2.5">{row('Gesamt brutto', empty ? formatEuro(0) : '…', { strong: true })}</div>
          </>
        )}
      </dl>

      {messages.errors.length || messages.warnings.length ? (
        <div className="space-y-2 px-5 pb-3.5">
          {messages.errors.map((m) => (
            <Notice key={`e-${m.code}-${m.message}`} tone="danger" className="p-3 text-[13px]">
              {m.message}
            </Notice>
          ))}
          {messages.warnings.map((m) => (
            <Notice key={`w-${m.code}-${m.message}`} tone="warning" className="p-3 text-[13px]">
              {m.message}
            </Notice>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 px-5 pb-4">
        <Button ref={addButtonRef} block size="lg" icon={ShoppingCart} onClick={onAddToCart} disabled={empty}>
          In den Warenkorb
        </Button>
        <Button block variant="accent" iconRight={ArrowRight} onClick={onCheckout} disabled={empty || blocking}>
          Direkt zur Kasse
        </Button>
        {!empty ? (
          <button type="button" onClick={onReset} className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:text-slate-800">
            <RotateCcw size={14} aria-hidden />
            Alle Mengen leeren
          </button>
        ) : null}
      </div>
      <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Angaben zur Bestellung</p>
        {costCenters.length ? (
          <Select
            label="Kostenstelle"
            value={costCenter}
            onChange={(e) => onCostCenter(e.target.value)}
            options={[{ value: '', label: 'Keine Kostenstelle' }, ...costCenters.map((c) => ({ value: c, label: c }))]}
          />
        ) : null}
        <Input label="Ihre Bestellreferenz" placeholder="z. B. Bestellung KW 41" value={reference} maxLength={60} onChange={(e) => onReference(e.target.value)} />
        {address ? (
          <p className="flex items-start gap-2 text-[13px] leading-snug text-slate-500" title="Adresse und Termin wählen Sie an der Kasse.">
            <MapPin size={15} aria-hidden className="mt-px shrink-0 text-slate-400" />
            <span>
              Lieferung an <span className="font-semibold text-slate-700">{address.label}</span>, {address.street} – Termin wählen Sie an der Kasse.
            </span>
          </p>
        ) : null}
      </div>

    </Card>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

/** B2B-Schnellbestellung: Bestellmatrix mit Tastaturbedienung */
export default function QuickOrderPage() {
  const user = useUser();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const customerQ = useMyCustomer();
  const ordersQ = useMyOrders();
  const productsQ = useProducts();
  const productMap = useProductMap();
  const depositTypes = useDepositTypes();
  const cartAdd = useCart((s) => s.add);
  const cartSet = useCart((s) => s.set);
  const cartCostCenter = useCart((s) => s.costCenter);
  const cartReference = useCart((s) => s.reference);

  const customer = customerQ.data ?? null;
  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);
  const products = useMemo(() => (productsQ.data ?? []).filter((p) => p.active && !p.isRental), [productsQ.data]);
  const usual = useMemo(() => usualItems(orders, productMap, 40), [orders, productMap]);
  const usualById = useMemo(() => new Map(usual.map((u) => [u.productId, u])), [usual]);
  const last = useMemo(() => lastOrder(orders), [orders]);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [hidden, setHidden] = useState<ID[]>([]);
  const [restored, setRestored] = useState(false);
  const [fallbackList, setFallbackList] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState<string | undefined>(undefined);
  const [confirmLast, setConfirmLast] = useState(false);
  const [costCenter, setCostCenter] = useState(cartCostCenter ?? '');
  const [reference, setReference] = useState(cartReference ?? '');

  const inputs = useRef(new Map<ID, HTMLInputElement>());
  const mobileSummary = useRef<HTMLDivElement | null>(null);
  const [summaryInView, setSummaryInView] = useState(false);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Liste aufbauen: gespeicherter Entwurf + „Meine Artikel“ (Historie) bzw. Bestseller ohne Historie
  const ready = ordersQ.isSuccess && productsQ.isSuccess && !!user;
  useEffect(() => {
    if (rows !== null || !ready || !user) return;
    const draft = readJson<Draft | null>(draftKey(user.id), null);
    const draftRows = (draft?.rows ?? [])
      .filter((r) => r && isOrderable(productMap.get(r.productId)))
      .map((r) => ({ productId: r.productId, qty: clampQty(r.qty), added: !!r.added }));
    const hiddenIds = Array.isArray(draft?.hidden) ? draft.hidden : [];
    const seen = new Set(draftRows.map((r) => r.productId));
    let base = usual.map((u) => u.productId);
    if (!base.length) {
      base = products.filter((p) => p.tags.includes('bestseller')).slice(0, 10).map((p) => p.id);
      setFallbackList(true);
    }
    const extra = base.filter((id) => !seen.has(id) && !hiddenIds.includes(id)).map((id) => ({ productId: id, qty: 0 }));
    setRows([...draftRows, ...extra]);
    setHidden(hiddenIds);
    if (draftRows.some((r) => r.qty > 0)) setRestored(true);
  }, [ready, rows, user, productMap, usual, products]);

  // Entwurf merken (pro Nutzer), damit nichts verloren geht
  useEffect(() => {
    if (rows && user) writeJson(draftKey(user.id), { rows, hidden } satisfies Draft);
  }, [rows, hidden, user]);

  const lines: Line[] = useMemo(() => {
    const out: Line[] = [];
    for (const row of rows ?? []) {
      const product = productMap.get(row.productId);
      if (!isOrderable(product)) continue;
      const qty = Math.max(1, row.qty);
      const price = computePrice(product, customer, qty, depositTypes);
      out.push({
        row,
        product,
        price,
        lineNet: row.qty ? price.price.lineNet : 0,
        lineGross: row.qty ? price.price.lineGross : 0,
        deposit: row.qty ? price.price.depositTotal : 0,
        usual: usualById.get(row.productId),
        tier: betterTier(product, price.unitNet, row.qty),
      });
    }
    return out;
  }, [rows, productMap, customer, depositTypes, usualById]);

  const selected = useMemo(() => lines.filter((l) => l.row.qty > 0), [lines]);
  const items = useMemo(() => selected.map((l) => ({ productId: l.product.id, qty: l.row.qty })), [selected]);
  const units = items.reduce((s, i) => s + i.qty, 0);

  const quoteInput: CheckoutInput | null = useMemo(() => {
    if (!items.length) return null;
    const input: CheckoutInput = { items, fulfillment: 'delivery', emptiesReturn: [], carryService: false, paymentMethod: 'cash' };
    if (customer?.defaultAddressId) input.addressId = customer.defaultAddressId;
    return input;
  }, [items, customer?.defaultAddressId]);
  const quoteQ = useQuote(quoteInput, !!customer);
  const quote = quoteMatches(quoteQ.data, items) ? quoteQ.data : undefined;

  // Summen: Positionen sofort (priceProduct wie im Core); MwSt., Pfand, Gebühren und Gesamt nur aus api.quote.
  // Während der Neuberechnung bleibt die letzte Core-Summe (abgeblendet) stehen.
  const goodsNet = useMemo(() => selected.reduce((s, l) => s + l.lineNet, 0), [selected]);
  const summary = useMemo(() => (quote ? quoteSummary(quote) : null), [quote]);
  const [lastSummary, setLastSummary] = useState<QuickSummary | null>(null);
  useEffect(() => {
    if (summary) setLastSummary(summary);
    else if (!items.length) setLastSummary(null);
  }, [summary, items.length]);
  const shownSummary = summary ?? (items.length ? lastSummary : null);

  const messages = useMemo(
    () => ({
      errors: quote ? quote.errors.filter((m) => !HIDDEN_ERRORS.has(m.code)) : [],
      warnings: quote ? quote.warnings.filter((m) => !HIDDEN_WARNINGS.has(m.code)) : [],
    }),
    [quote],
  );

  // ── Zeilen ändern ──
  const setQty = useCallback((productId: ID, qty: number) => {
    setRows((rs) => (rs ?? []).map((r) => (r.productId === productId ? { ...r, qty: clampQty(qty) } : r)));
  }, []);

  const focusRow = useCallback(
    (index: number) => {
      if (index >= lines.length) {
        addButton.current?.focus();
        return;
      }
      if (index < 0) {
        searchRef.current?.focus();
        return;
      }
      const el = inputs.current.get(lines[index].product.id);
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    },
    [lines],
  );

  const addProduct = (p: Product) => {
    const exists = (rows ?? []).some((r) => r.productId === p.id);
    if (!exists) {
      setRows((rs) => [{ productId: p.id, qty: 1, added: true }, ...(rs ?? [])]);
      setHidden((h) => h.filter((id) => id !== p.id));
    }
    // nach dem Rendern Menge fokussieren
    window.setTimeout(() => {
      const el = inputs.current.get(p.id);
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'nearest' });
      } else {
        document.getElementById(`qo-${p.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 40);
    if (exists) toast.info(`${p.brand} ${p.name} steht bereits in Ihrer Liste.`, { id: 'qo-exists', duration: 2500 });
  };

  const removeRow = (productId: ID) => {
    const row = (rows ?? []).find((r) => r.productId === productId);
    setRows((rs) => (rs ?? []).filter((r) => r.productId !== productId));
    if (row && !row.added) setHidden((h) => [...new Set([...h, productId])]);
  };

  const showHidden = () => {
    setRows((rs) => [...(rs ?? []), ...hidden.filter((id) => isOrderable(productMap.get(id))).map((id) => ({ productId: id, qty: 0 }))]);
    setHidden([]);
  };

  const applyItems = (list: { productId: ID; qty: number }[], mode: 'replace-all' | 'set') => {
    setRows((rs) => {
      const current = (rs ?? []).map((r) => (mode === 'replace-all' ? { ...r, qty: 0 } : r));
      const byId = new Map(current.map((r) => [r.productId, r]));
      const fresh: Row[] = [];
      for (const item of list) {
        const r = byId.get(item.productId);
        if (r) r.qty = clampQty(item.qty);
        else fresh.push({ productId: item.productId, qty: clampQty(item.qty), added: true });
      }
      return [...fresh, ...current];
    });
    setHidden((h) => h.filter((id) => !list.some((i) => i.productId === id)));
  };

  const takeLastOrder = (o: Order) => {
    const list = reorderableLines(o, productMap);
    if (!list.length) {
      toast.info('Die Artikel dieser Bestellung sind derzeit nicht erhältlich.');
      return;
    }
    applyItems(list, 'replace-all');
    if (o.costCenter && (customer?.b2b?.costCenters ?? []).includes(o.costCenter)) setCostCenter(o.costCenter);
    toast.success(`Mengen aus ${o.number} übernommen`, { description: `${list.length} Artikel vom ${formatDate(o.createdAt, 'short')} – Sie können die Mengen jetzt anpassen.` });
  };

  const onLastOrder = () => {
    if (!last) return;
    if (units > 0) setConfirmLast(true);
    else takeLastOrder(last);
  };

  const resetAll = () => {
    setRows((rs) => (rs ?? []).map((r) => ({ ...r, qty: 0 })));
    setRestored(false);
  };

  // ── In den Warenkorb / zur Kasse ──
  const transfer = (): number => {
    const before = useCart.getState().items.length;
    for (const i of items) cartAdd(i.productId, i.qty);
    const patch: Partial<CartData> = {};
    if (costCenter) patch.costCenter = costCenter;
    else if (cartCostCenter && !(customer?.b2b?.costCenters ?? []).includes(cartCostCenter)) patch.costCenter = undefined;
    patch.reference = reference.trim() || undefined;
    if (useCart.getState().fulfillment === 'delivery' && !useCart.getState().addressId && customer?.defaultAddressId) patch.addressId = customer.defaultAddressId;
    cartSet(patch);
    resetAll();
    return before;
  };

  const onAddToCart = () => {
    if (!items.length) return;
    const positions = items.length;
    const u = units;
    transfer();
    toast.success(`${positions} ${positions === 1 ? 'Position' : 'Positionen'} · ${u} Gebinde im Warenkorb`, {
      description: 'Mengen wurden zu Ihrem Warenkorb addiert.',
      href: '/warenkorb',
      actionLabel: 'Zum Warenkorb',
    });
  };

  const onCheckout = () => {
    if (!items.length) return;
    const otherBefore = useCart.getState().items.filter((i) => !items.some((x) => x.productId === i.productId)).length;
    transfer();
    if (otherBefore > 0) {
      toast.info('Ihr Warenkorb enthielt bereits weitere Artikel', { description: 'Diese sind ebenfalls in der Bestellung – Sie können sie an der Kasse prüfen.', id: 'qo-cart-merge' });
    }
    navigate('/kasse');
  };

  // Mobil: schwebende Summe ausblenden, solange die Zusammenfassung sichtbar ist
  const hasMobileSummary = !desktop && lines.length > 0;
  useEffect(() => {
    const el = mobileSummary.current;
    if (!hasMobileSummary || !el || typeof IntersectionObserver === 'undefined') {
      setSummaryInView(false);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setSummaryInView(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMobileSummary]);

  // Strg+V auf der Seite (außerhalb von Eingabefeldern) öffnet die Einfügen-Vorschau
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, [contenteditable="true"]') || t.closest('[role="dialog"]'))) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!/\d/.test(text) || !/[;\t,\n ]/.test(text.trim())) return;
      e.preventDefault();
      setPasteText(text);
      setPasteOpen(true);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const listed = useMemo(() => new Set((rows ?? []).map((r) => r.productId)), [rows]);
  const loading = !rows && !ordersQ.isError && !productsQ.isError;
  const loadError = ordersQ.error ?? productsQ.error;

  const summaryProps: SummaryProps = {
    customer,
    positions: items.length,
    units,
    goodsNet,
    summary: shownSummary,
    calculating: !!quoteInput && !quote && !quoteQ.isError,
    failed: quoteQ.isError,
    messages,
    costCenter,
    onCostCenter: setCostCenter,
    reference,
    onReference: setReference,
    onAddToCart,
    onCheckout,
    onReset: resetAll,
  };

  return (
    <div>
      <BusinessNav />
      <PageHeader
        title="Schnellbestellung"
        subtitle={
          desktop
            ? 'Mengen eintragen, mit Enter zur nächsten Zeile – Ihre Netto-Konditionen sind bereits eingerechnet.'
            : 'Ihre Artikel mit Netto-Konditionen – Menge antippen oder eintragen.'
        }
        actions={
          <>
            <Button variant="outline" icon={ClipboardPaste} onClick={() => { setPasteText(undefined); setPasteOpen(true); }} className="flex-1 sm:flex-none">
              Einfügen
            </Button>
            <Button variant="outline" icon={History} onClick={onLastOrder} disabled={!last} className="flex-1 sm:flex-none" title={last ? `${last.number} vom ${formatDate(last.createdAt, 'short')}` : undefined}>
              <span className="sm:hidden">Letzte Bestellung</span>
              <span className="hidden sm:inline">Letzte Bestellung übernehmen</span>
            </Button>
          </>
        }
      />

      {customer?.b2b?.status === 'pending' ? (
        <Notice tone="warning" title="Ihr Konto wird geprüft" className="mb-5">
          Bis zur Freischaltung gelten Privatkundenkonditionen (Listenpreise netto) – Kauf auf Rechnung ist noch nicht möglich.
        </Notice>
      ) : null}
      {restored ? (
        <Notice
          tone="info"
          icon={Info}
          className="mb-5"
          action={
            <Button size="sm" variant="ghost" onClick={resetAll}>
              Verwerfen
            </Button>
          }
        >
          Ihre zuletzt erfassten Mengen wurden wiederhergestellt.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <ProductSearch
              ref={searchRef}
              products={products}
              customer={customer}
              depositTypes={depositTypes}
              listed={listed}
              onPick={addProduct}
              className="flex-1"
            />
          </div>

          {loadError ? (
            <Card>
              <ErrorState error={loadError} onRetry={() => void Promise.all([ordersQ.refetch(), productsQ.refetch()])} />
            </Card>
          ) : loading ? (
            <Card padding="none" className="divide-y divide-slate-100">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-10 w-20 rounded-xl" />
                </div>
              ))}
            </Card>
          ) : !lines.length ? (
            <Card>
              <EmptyState
                icon={PackageSearch}
                title="Ihre Bestellliste ist leer"
                description="Fügen Sie Artikel über die Suche hinzu oder fügen Sie eine Liste „Art.-Nr.;Menge“ aus der Zwischenablage ein."
                action={
                  <>
                    <Button icon={ClipboardPaste} variant="secondary" onClick={() => setPasteOpen(true)}>
                      Liste einfügen
                    </Button>
                    {hidden.length ? (
                      <Button icon={Eye} variant="ghost" onClick={showHidden}>
                        Meine Artikel einblenden
                      </Button>
                    ) : null}
                  </>
                }
              />
            </Card>
          ) : desktop ? (
            <Card padding="none" className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{fallbackList ? 'Beliebte Artikel' : 'Meine Artikel'}</h2>
                  <p className="text-[13px] text-slate-500">
                    {fallbackList ? 'Noch keine Bestellhistorie – unsere meistgekauften Artikel als Startpunkt' : 'Nach Häufigkeit aus Ihren Bestellungen'}
                    {customer?.b2b && customer.b2b.discountPercent > 0 ? (
                      <span className="font-medium text-brand-700"> · inkl. {String(customer.b2b.discountPercent).replace('.', ',')} % Kundenrabatt bzw. Staffelpreis</span>
                    ) : null}
                  </p>
                </div>
                <p className="hidden items-center gap-1.5 text-xs text-slate-400 xl:flex">
                  <Keyboard size={15} aria-hidden />
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 font-sans">Enter</kbd> nächste Zeile ·
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 font-sans">+</kbd>
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 font-sans">−</kbd> Menge
                </p>
              </div>
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col />
                  <col className="w-[8.5rem]" />
                  <col className="w-[7.5rem]" />
                  <col className="w-[4.75rem]" />
                  <col className="w-[6.5rem]" />
                  <col className="w-[6.75rem]" />
                  <col className="w-11" />
                </colgroup>
                <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Artikel</th>
                    <th scope="col" className="px-3 py-2.5">
                      Art.-Nr. <span className="font-medium normal-case tracking-normal text-slate-400">/ Gebinde</span>
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right">Netto-Preis</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Pfand</th>
                    <th scope="col" className="px-3 py-2.5 text-center">Menge</th>
                    <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right">Zeile netto</th>
                    <th scope="col" className="px-1 py-2.5">
                      <span className="sr-only">Entfernen</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, index) => {
                    const { product, row } = line;
                    const name = `${product.brand} ${product.name}`;
                    return (
                      <tr key={product.id} id={`qo-${product.id}`} className={cn('transition-colors', row.qty > 0 ? 'bg-brand-50/40' : 'hover:bg-slate-50/70')}>
                        <td className="px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-3">
                            <ProductThumb product={product} size={44} />
                            <div className="min-w-0">
                              <Link to={`/produkt/${product.id}`} tabIndex={-1} className="line-clamp-2 font-semibold leading-snug text-slate-900 hover:text-brand-700">
                                {name}
                              </Link>
                              <LineMeta line={line} />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="block font-mono text-[13px] text-slate-700">{product.sku}</span>
                          <span className="block truncate text-xs text-slate-500" title={product.packaging}>
                            {product.packaging}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <PriceCell line={line} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">{line.price.depositUnit ? formatEuro(line.price.depositUnit) : '–'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <QtyCell
                            value={row.qty}
                            label={name}
                            disabled={product.stock <= 0}
                            onChange={(n) => setQty(product.id, n)}
                            inputRef={(el) => {
                              if (el) inputs.current.set(product.id, el);
                              else inputs.current.delete(product.id);
                            }}
                            onNavigate={(dir) => focusRow(index + dir)}
                          />
                          <StockHint line={line} />
                        </td>
                        <td className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', row.qty ? 'font-semibold text-slate-900' : 'text-slate-300')}>
                          {row.qty ? formatEuro(line.lineNet) : '–'}
                        </td>
                        <td className="px-1 py-2.5">
                          <IconButton icon={X} label={`${name} aus der Liste entfernen`} size="sm" tabIndex={-1} onClick={() => removeRow(product.id)} className="text-slate-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hidden.length ? (
                <div className="border-t border-slate-100 px-4 py-2.5">
                  <button type="button" onClick={showHidden} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-700">
                    <Eye size={15} aria-hidden />
                    {hidden.length} ausgeblendete {hidden.length === 1 ? 'Artikel' : 'Artikel'} wieder einblenden
                  </button>
                </div>
              ) : null}
            </Card>
          ) : (
            <section aria-label={fallbackList ? 'Beliebte Artikel' : 'Meine Artikel'}>
              <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-base font-bold text-slate-900">{fallbackList ? 'Beliebte Artikel' : 'Meine Artikel'}</h2>
                <span className="text-[13px] text-slate-500">{fallbackList ? 'Bestseller' : 'nach Häufigkeit'}</span>
              </div>
              <ul className="space-y-3">
                {lines.map((line) => {
                  const { product, row, usual } = line;
                  const name = `${product.brand} ${product.name}`;
                  return (
                    <li
                      key={product.id}
                      id={`qo-${product.id}`}
                      className={cn('rounded-2xl border bg-white p-3.5 shadow-card transition-colors', row.qty > 0 ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200/70')}
                    >
                      <div className="flex gap-3">
                        <ProductThumb product={product} size={56} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-semibold leading-snug text-slate-900">{name}</p>
                          <p className="mt-0.5 truncate text-[13px] text-slate-500">
                            <span className="font-mono">{product.sku}</span> · {product.packaging}
                          </p>
                          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
                            <span className="font-bold tabular-nums text-slate-900">{formatEuro(line.price.unitNet)}</span>
                            <span className="text-slate-500">netto{line.price.depositUnit ? ` + ${formatEuro(line.price.depositUnit)} Pfand` : ''}</span>
                            {line.tier ? (
                              <span className="font-semibold text-brand-700">
                                · ab {line.tier.minQty}: {formatEuro(line.tier.priceNet)}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <IconButton icon={X} label={`${name} aus der Liste entfernen`} size="sm" onClick={() => removeRow(product.id)} className="-mr-1 -mt-1 text-slate-400" />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 text-[13px]">
                          {row.qty > 0 ? (
                            <span className="block font-semibold tabular-nums text-slate-900">= {formatEuro(line.lineNet)} netto</span>
                          ) : usual && !row.added ? (
                            <button
                              type="button"
                              onClick={() => setQty(product.id, usual.typicalQty)}
                              disabled={product.stock <= 0}
                              className="inline-flex h-9 items-center gap-1 rounded-xl bg-brand-50 px-3 font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-50"
                            >
                              Übliche Menge: {usual.typicalQty}
                            </button>
                          ) : (
                            <span className="text-slate-500">{row.added ? 'hinzugefügt' : 'Menge wählen'}</span>
                          )}
                          <StockHint line={line} />
                        </div>
                        <QuantityStepper value={row.qty} onChange={(n) => setQty(product.id, n)} label={name} disabled={product.stock <= 0} max={MAX_QTY} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {hidden.length ? (
                <button type="button" onClick={showHidden} className="mt-3 flex items-center gap-1.5 px-1 text-sm font-medium text-slate-500 hover:text-brand-700">
                  <Eye size={15} aria-hidden />
                  {hidden.length} ausgeblendete Artikel wieder einblenden
                </button>
              ) : null}
            </section>
          )}

          {!desktop && lines.length ? (
            <div ref={mobileSummary} className="mt-6">
              <SummaryCard {...summaryProps} />
            </div>
          ) : null}
        </div>

        {desktop ? (
          <aside className="sticky top-[8.5rem] max-h-[calc(100dvh-9.5rem)] space-y-4 overflow-y-auto overscroll-contain rounded-2xl pb-1">
            <SummaryCard {...summaryProps} addButtonRef={(el) => (addButton.current = el)} />
            {customer?.b2b?.allowInvoice && customer.b2b.status === 'active' ? (
              <p className="flex items-start gap-2 px-1 text-[13px] leading-snug text-slate-500">
                <CreditCard size={15} aria-hidden className="mt-px shrink-0 text-slate-400" />
                Kauf auf Rechnung mit {customer.b2b.paymentTermsDays} Tagen Zahlungsziel – Auswahl an der Kasse.
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>

      {/* Mobile: Summe als feste Aktionsleiste über der Tab-Leiste (das Layout hält per --sticky-bar-h Abstand) */}
      {!desktop && items.length > 0 && !summaryInView ? (
        <StickyActionBar className="animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-slate-500">{units} Gebinde · brutto</p>
              <p className={cn('text-lg font-bold leading-tight tabular-nums text-slate-900 transition-opacity', !quote && 'opacity-60')}>
                {shownSummary ? formatEuro(shownSummary.total) : '…'}
              </p>
            </div>
            <Button icon={ShoppingCart} onClick={onAddToCart}>
              In den Warenkorb
            </Button>
          </div>
        </StickyActionBar>
      ) : null}

      <PasteImportModal open={pasteOpen} onClose={() => setPasteOpen(false)} products={productsQ.data ?? []} initialText={pasteText} onApply={(list) => {
        applyItems(list, 'set');
        if (list.length) toast.success(`${list.length} ${list.length === 1 ? 'Position' : 'Positionen'} übernommen`, { description: 'Prüfen Sie die Mengen und legen Sie sie in den Warenkorb.' });
      }} />

      <ConfirmModal
        open={confirmLast}
        onClose={() => setConfirmLast(false)}
        onConfirm={() => {
          setConfirmLast(false);
          if (last) takeLastOrder(last);
        }}
        title="Aktuelle Mengen ersetzen?"
        message={last ? `Die erfassten Mengen werden durch die Mengen aus ${last.number} vom ${formatDate(last.createdAt, 'short')} ersetzt.` : undefined}
        confirmLabel="Mengen übernehmen"
      />

      {!desktop ? null : (
        <p className="mt-6 flex items-center gap-2 text-[13px] text-slate-400">
          <Zap size={14} aria-hidden />
          Tipp: Mit <kbd className="rounded border border-slate-200 bg-white px-1.5">Strg</kbd> + <kbd className="rounded border border-slate-200 bg-white px-1.5">V</kbd> fügen Sie eine kopierte Bestellliste direkt
          ein.
          <ButtonLink to="/warenkorb" variant="ghost" size="sm" className="ml-auto" iconRight={ArrowRight}>
            Zum Warenkorb
          </ButtonLink>
        </p>
      )}
    </div>
  );
}
