import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, ExternalLink, Euro, Eye, Package, Palette, Plus, Save, Tag, Warehouse, X, Layers } from 'lucide-react';
import type { Product, ProductInput } from '@shared/types';
import { basePrice, formatDate, formatEuro } from '@shared/format';
import { addDays, todayString } from '@shared/time';
import { api } from '@/api/client';
import { qk, useCategories, useDepositTypes, useProduct } from '@/api/hooks';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmModal,
  ErrorState,
  Input,
  Notice,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  Textarea,
  errorMessage,
  toast,
} from '@/components/ui';
import { ProductImage, productTint } from '@/components/product';
import { formatPercent, netFromGross, parseDecimalInput, parseEuro, parseIntInput, stockLevel } from './master/lib';
import { ColorField, EuroField, FormSection, StockDot, stockLabel, stockTextClass } from './master/ui';
import {
  MATERIAL_OPTIONS,
  TAG_SUGGESTIONS,
  draftFromProduct,
  draftKey,
  draftToInput,
  emptyDraft,
  previewProduct,
  validateDraft,
  type ProductDraft,
} from './master/products/productDraft';
import { TierEditor } from './master/products/TierEditor';

const COLOR_PRESETS: [string, string][] = [
  ['#8c1d18', '#e5c07b'],
  ['#1d58a0', '#f2a900'],
  ['#14532d', '#facc15'],
  ['#0369a1', '#e0f2fe'],
  ['#7c2d12', '#fdba74'],
  ['#111827', '#d4af37'],
  ['#9f1239', '#fecdd3'],
  ['#4d7c0f', '#ecfccb'],
  ['#c2410c', '#fff7ed'],
  ['#6d28d9', '#ddd6fe'],
];

function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

function InfoTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-200/70">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Tags: Vorschläge zum Antippen + freie Eingabe */
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');
  const toggle = (tag: string) => onChange(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  const add = () => {
    const t = input.trim().toLowerCase().slice(0, 30);
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  };
  const custom = tags.filter((t) => !TAG_SUGGESTIONS.some((s) => s.value === t));
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">Merkmale</p>
      <div className="flex flex-wrap gap-2">
        {TAG_SUGGESTIONS.map((s) => {
          const on = tags.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.value)}
              className={cn(
                'h-9 rounded-full border px-3 text-sm font-semibold transition-colors',
                on ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              )}
            >
              {s.label}
            </button>
          );
        })}
        {custom.map((t) => (
          <span key={t} className="inline-flex h-9 items-center gap-1 rounded-full border border-brand-600 bg-brand-50 pl-3 pr-1 text-sm font-semibold text-brand-800">
            {t}
            <button type="button" onClick={() => toggle(t)} aria-label={`Merkmal ${t} entfernen`} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-brand-100">
              <X size={14} aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          aria-label="Eigenes Merkmal"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Eigenes Merkmal, z. B. „saisonal“"
          containerClassName="flex-1 sm:max-w-xs"
          maxLength={30}
        />
        <Button variant="outline" icon={Plus} onClick={add} disabled={!input.trim()}>
          Hinzufügen
        </Button>
      </div>
    </div>
  );
}

function PreviewCard({ draft, base, children }: { draft: ProductDraft; base: Product | undefined; children?: ReactNode }) {
  const p = previewProduct(draft, base);
  const price = parseEuro(draft.price);
  const offer = draft.offerOn ? parseEuro(draft.offerPrice) : null;
  const level = stockLevel(p);
  const today = todayString();
  const offerActive = offer !== null && offer > 0 && price !== null && offer < price && draft.offerUntil >= today;
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex lg:block">
        <div
          className="relative flex w-28 shrink-0 items-center justify-center p-2 sm:w-36 lg:w-auto lg:px-6 lg:pb-4 lg:pt-6"
          style={{ background: productTint(p, 0.14) }}
        >
          <ProductImage product={p} className="h-24 w-24 drop-shadow-sm sm:h-28 sm:w-28 lg:h-44 lg:w-44" />
          <div className="absolute left-3 top-3 hidden flex-col items-start gap-1.5 lg:flex">
            {offerActive ? (
              <Badge tone="accent" solid icon={Tag}>
                {draft.offerLabel.trim() || 'Angebot'}
              </Badge>
            ) : null}
            {!draft.active ? <Badge tone="neutral" solid>Inaktiv</Badge> : null}
            {draft.isRental ? <Badge tone="info" solid>Leihartikel</Badge> : null}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2 p-3.5 sm:p-4 lg:space-y-3 lg:p-5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{p.brand}</p>
            <p className="truncate text-base font-bold leading-snug text-slate-900 lg:whitespace-normal lg:text-lg">{p.name}</p>
            <p className="truncate text-sm text-slate-500">{p.packaging}</p>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <div>
              {offerActive ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular-nums text-accent-700 lg:text-2xl">{formatEuro(offer)}</span>
                  <span className="text-sm text-slate-400 line-through tabular-nums">{formatEuro(price)}</span>
                </div>
              ) : (
                <span className="text-xl font-bold tabular-nums text-slate-900 lg:text-2xl">{price !== null ? formatEuro(price) : '–'}</span>
              )}
              <p className="text-xs text-slate-500">
                {draft.isRental ? 'pro Veranstaltung' : basePrice(p, offerActive && offer ? offer : (price ?? 0)) || 'Grundpreis nach Inhalt'}
              </p>
            </div>
            <p className={cn('flex items-center gap-2 text-sm font-medium', stockTextClass(level))}>
              <StockDot level={level} />
              {p.stock} {draft.isRental ? 'Stück' : 'am Lager'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 lg:hidden">
            {offerActive ? (
              <Badge tone="accent" icon={Tag}>
                {draft.offerLabel.trim() || 'Angebot'}
              </Badge>
            ) : null}
            {!draft.active ? <Badge tone="neutral">Inaktiv</Badge> : null}
            {draft.isRental ? <Badge tone="info">Leihartikel</Badge> : null}
          </div>
        </div>
      </div>
      {children ? <div className="hidden px-5 pb-5 lg:block">{children}</div> : null}
    </Card>
  );
}

export default function ProductEditPage() {
  const { productId } = useParams();
  const isNew = productId === 'neu';
  const { data: product, isLoading, error, refetch } = useProduct(isNew ? null : productId);

  if (!isNew && !product) {
    if (isLoading) {
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
          <Skeleton className="hidden h-96 w-full rounded-2xl lg:block" />
        </div>
      );
    }
    return (
      <>
        <PageHeader title="Artikel" back="/admin/sortiment" />
        <Card>
          <ErrorState
            error={error ?? new Error('Der Artikel wurde nicht gefunden.')}
            onRetry={() => void refetch()}
            action={
              <ButtonLink to="/admin/sortiment" variant="ghost">
                Zur Artikelliste
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }
  return <ProductEditor key={product?.id ?? 'neu'} product={isNew ? undefined : product} />;
}

function ProductEditor({ product }: { product: Product | undefined }) {
  const categories = useCategories();
  const depositTypes = useDepositTypes();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const from = (location.state as { from?: string } | null)?.from ?? '';
  const backTo = `/admin/sortiment${from}`;
  const isNew = !product;

  const [initial] = useState<ProductDraft>(() => (product ? draftFromProduct(product) : emptyDraft()));
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [colorsTouched, setColorsTouched] = useState(!isNew);
  const leaving = useRef(false);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const errors = useMemo(() => validateDraft(draft, categories), [draft, categories]);
  const errorCount = Object.keys(errors).length;
  const dirty = draftKey(draft) !== draftKey(initial);
  const err = (key: keyof ProductDraft) => (showErrors ? errors[key] : undefined);

  const price = parseEuro(draft.price);
  const listNet = price !== null && price > 0 ? netFromGross(price, draft.vatRate) : null;
  const offerPrice = draft.offerOn ? parseEuro(draft.offerPrice) : null;
  const deposit = depositTypes.find((d) => d.id === draft.depositTypeId);
  const unitCount = parseIntInput(draft.unitCount) ?? 0;
  const unitVol = parseDecimalInput(draft.unitVolumeL) ?? 0;
  const liters = Math.round(unitCount * unitVol * 1000) / 1000;
  const preview = previewProduct(draft, product);

  // Ungespeicherte Änderungen: Navigation innerhalb der App und Schließen des Tabs abfangen
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const save = useMutation<Product, Error, ProductInput>({
    mutationFn: (input) => api.adminSaveProduct(input),
    async onSuccess(p) {
      qc.setQueryData<Product[]>(qk.products, (list) => {
        if (!list) return list;
        return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p];
      });
      qc.setQueryData(qk.product(p.id), p);
      void qc.invalidateQueries({ queryKey: qk.admin });
      toast.success(isNew ? `„${p.brand} ${p.name}“ wurde angelegt` : `„${p.brand} ${p.name}“ wurde gespeichert`, {
        description: p.active ? 'Die Änderungen sind sofort im Shop sichtbar.' : 'Der Artikel ist im Shop ausgeblendet.',
      });
      leaving.current = true;
      navigate(backTo);
    },
    onError(e) {
      toast.error(errorMessage(e));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (errorCount) {
      toast.error('Bitte prüfen Sie die markierten Felder.', { id: 'product-form' });
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
      }, 30);
      return;
    }
    const input = draftToInput(draft, product);
    // Bestand nicht versehentlich überschreiben: unverändert → aktuellen Stand vom Server nehmen
    const latest = product ? qc.getQueryData<Product>(qk.product(product.id)) ?? product : undefined;
    if (latest && draft.stock === initial.stock) input.stock = latest.stock;
    save.mutate(input);
  };

  const cancel = () => navigate(backTo);

  const setCategory = (id: string) => {
    setDraft((d) => {
      const next = { ...d, categoryId: id };
      const cat = categories.find((c) => c.id === id);
      if (!colorsTouched && cat) next.color = cat.color;
      if (isNew && id === 'leihartikel') {
        next.isRental = true;
        next.material = 'sonstiges';
        next.depositTypeId = '';
      }
      return next;
    });
  };

  const actions = (
    <>
      <Button variant="outline" onClick={cancel} disabled={save.isPending}>
        Abbrechen
      </Button>
      <Button type="submit" form="product-form" icon={Save} loading={save.isPending}>
        {isNew ? 'Artikel anlegen' : 'Speichern'}
      </Button>
    </>
  );

  const offerSaving = price && offerPrice && offerPrice < price ? ((price - offerPrice) / price) * 100 : null;
  const offerExpired = !!product?.offer && product.offer.validUntil < todayString() && draft.offerOn && draft.offerUntil === product.offer.validUntil;

  return (
    <>
      <PageHeader
        back={backTo}
        title={isNew ? 'Neuer Artikel' : `${product.brand} ${product.name}`}
        documentTitle={isNew ? 'Neuer Artikel · Markt' : `${product.name} · Sortiment`}
        subtitle={
          isNew ? (
            'Legen Sie einen neuen Artikel für Shop und Lager an.'
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Art.-Nr. {product.sku}</span>
              <span aria-hidden>·</span>
              <span>{product.packaging}</span>
              {dirty ? (
                <Badge tone="warning" className="ml-1">
                  Ungespeicherte Änderungen
                </Badge>
              ) : null}
            </span>
          )
        }
        actions={
          !isNew ? (
            <a
              href={`/produkt/${encodeURIComponent(product.id)}`}
              target="_blank"
              rel="noopener"
              className="hidden h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold text-brand-700 hover:bg-brand-50 sm:inline-flex"
            >
              <ExternalLink size={18} aria-hidden />
              Im Shop ansehen
            </a>
          ) : undefined
        }
      />

      <form id="product-form" onSubmit={onSubmit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        {/* Vorschau + Aktionen (Desktop: rechts, mitlaufend) */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          <PreviewCard draft={draft} base={product}>
            <div className="flex gap-2 border-t border-slate-100 pt-4 [&>*]:flex-1">{actions}</div>
          </PreviewCard>
          {showErrors && errorCount ? (
            <Notice tone="danger" title={`${errorCount} ${errorCount === 1 ? 'Angabe fehlt oder ist ungültig' : 'Angaben fehlen oder sind ungültig'}`} className="hidden lg:flex">
              Die betroffenen Felder sind rot markiert.
            </Notice>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <FormSection title="Stammdaten" subtitle="Bezeichnung, Marke und Einordnung im Sortiment" icon={Package}>
            <div className="space-y-4">
              <FieldGrid>
                <Input label="Bezeichnung" required value={draft.name} onChange={(e) => set('name', e.target.value)} error={err('name')} placeholder="z. B. Lagerbier Hell" maxLength={120} />
                <Input label="Marke / Hersteller" required value={draft.brand} onChange={(e) => set('brand', e.target.value)} error={err('brand')} placeholder="z. B. Augustiner" maxLength={80} />
                <Select
                  label="Kategorie"
                  required
                  value={draft.categoryId}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Bitte wählen"
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  error={err('categoryId')}
                />
                <Input label="Herkunft" value={draft.origin} onChange={(e) => set('origin', e.target.value)} placeholder="z. B. München, Tegernsee" maxLength={80} />
                <Input
                  label="Artikelnummer"
                  value={draft.sku}
                  onChange={(e) => set('sku', e.target.value)}
                  placeholder={isNew ? 'wird automatisch vergeben' : undefined}
                  hint={isNew ? 'Leer lassen für automatische Vergabe.' : undefined}
                  maxLength={40}
                />
                <Input label="EAN / GTIN" inputMode="numeric" value={draft.ean} onChange={(e) => set('ean', e.target.value.replace(/[^\d]/g, ''))} error={err('ean')} placeholder="optional" maxLength={14} />
              </FieldGrid>
              <Textarea
                label="Beschreibung"
                rows={4}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Geschmack, Besonderheiten, Empfehlung – erscheint im Shop auf der Produktseite."
                maxLength={2000}
                hint={`${draft.description.length} / 2000 Zeichen`}
              />
              <TagEditor tags={draft.tags} onChange={(tags) => set('tags', tags)} />
            </div>
          </FormSection>

          <FormSection title="Gebinde & Inhalt" subtitle="Grundlage für Grundpreis, Pfand und Illustration" icon={Boxes}>
            <div className="space-y-4">
              <FieldGrid className="lg:grid-cols-4">
                <Input
                  label="Gebinde"
                  required
                  value={draft.packaging}
                  onChange={(e) => set('packaging', e.target.value)}
                  error={err('packaging')}
                  placeholder="z. B. 20 × 0,5 l Glas"
                  containerClassName="sm:col-span-2"
                  maxLength={80}
                />
                <Input label="Einheiten je Gebinde" required inputMode="numeric" value={draft.unitCount} onChange={(e) => set('unitCount', e.target.value.replace(/[^\d]/g, ''))} error={err('unitCount')} suffix="Stk." />
                <Input
                  label="Inhalt je Einheit"
                  inputMode="decimal"
                  value={draft.unitVolumeL}
                  onChange={(e) => set('unitVolumeL', e.target.value)}
                  error={err('unitVolumeL')}
                  suffix="Liter"
                  placeholder={draft.isRental ? '0' : '0,5'}
                />
                <Select label="Material" value={draft.material} onChange={(e) => set('material', e.target.value as ProductDraft['material'])} options={MATERIAL_OPTIONS} />
                <Select
                  label="Pfandart"
                  value={draft.isRental ? '' : draft.depositTypeId}
                  disabled={draft.isRental}
                  onChange={(e) => set('depositTypeId', e.target.value)}
                  options={[{ value: '', label: 'Kein Pfand' }, ...depositTypes.map((d) => ({ value: d.id, label: `${d.shortName} · ${formatEuro(d.amount)}` }))]}
                  hint={draft.isRental ? 'Leihartikel sind pfandfrei.' : undefined}
                  containerClassName="sm:col-span-2 lg:col-span-2"
                />
                <Input label="Alkoholgehalt" inputMode="decimal" value={draft.alcohol} onChange={(e) => set('alcohol', e.target.value)} error={err('alcohol')} suffix="% vol" placeholder="optional" />
              </FieldGrid>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <InfoTile label="Gesamtinhalt" value={liters ? `${liters.toLocaleString('de-DE')} l` : '–'} hint={unitCount > 1 && unitVol ? `${unitCount} × ${unitVol.toLocaleString('de-DE')} l` : undefined} />
                <InfoTile label="Pfand je Gebinde" value={deposit && !draft.isRental ? formatEuro(deposit.amount) : 'kein Pfand'} hint={deposit && !draft.isRental ? deposit.shortName : undefined} />
                <InfoTile label="Grundpreis" value={price && liters ? basePrice({ unitCount, unitVolumeL: unitVol }, price) : '–'} hint="brutto, ohne Pfand" />
              </div>
            </div>
          </FormSection>

          <FormSection title="Preis & Steuer" subtitle="Privatkundenpreis brutto je Gebinde – Geschäftskunden sehen netto" icon={Euro}>
            <div className="space-y-4">
              <FieldGrid>
                <EuroField label="Verkaufspreis brutto" required value={draft.price} onChange={(e) => set('price', e.target.value)} error={err('price')} placeholder="0,00" />
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">MwSt.-Satz</p>
                  <SegmentedControl
                    block
                    aria-label="MwSt.-Satz"
                    value={String(draft.vatRate)}
                    onChange={(v) => set('vatRate', v === '7' ? 7 : 19)}
                    options={[
                      { value: '19', label: '19 % (Regelsatz)' },
                      { value: '7', label: '7 % (ermäßigt)' },
                    ]}
                  />
                </div>
              </FieldGrid>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoTile label="Netto" value={listNet !== null ? formatEuro(listNet) : '–'} hint="B2B-Listenpreis" />
                <InfoTile label="enthaltene MwSt." value={price && listNet !== null ? formatEuro(price - listNet) : '–'} hint={`${draft.vatRate} %`} />
                <InfoTile label="Brutto + Pfand" value={price ? formatEuro(price + (deposit && !draft.isRental ? deposit.amount : 0)) : '–'} hint="Kassenbetrag je Gebinde" />
                <InfoTile label="Grundpreis" value={price && liters ? basePrice({ unitCount, unitVolumeL: unitVol }, price) : '–'} />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Angebot"
            subtitle="Befristeter Aktionspreis für alle Kunden"
            icon={Tag}
            action={<Switch checked={draft.offerOn} onChange={(v) => setDraft((d) => ({ ...d, offerOn: v, offerUntil: v && !d.offerUntil ? addDays(todayString(), 7) : d.offerUntil }))} ariaLabel="Angebot aktiv" />}
          >
            {draft.offerOn ? (
              <div className="space-y-4">
                {offerExpired ? (
                  <Notice tone="warning" title="Dieses Angebot ist abgelaufen">
                    Es endete am {formatDate(product!.offer!.validUntil, 'short')}. Verlängern Sie es oder schalten Sie es aus.
                  </Notice>
                ) : null}
                <FieldGrid className="lg:grid-cols-3">
                  <EuroField
                    label="Angebotspreis brutto"
                    required
                    value={draft.offerPrice}
                    onChange={(e) => set('offerPrice', e.target.value)}
                    error={err('offerPrice')}
                    hint={offerSaving ? `${formatPercent(offerSaving, 1)} günstiger als regulär` : undefined}
                  />
                  <Input label="Gültig bis (einschließlich)" required type="date" min={todayString()} value={draft.offerUntil} onChange={(e) => set('offerUntil', e.target.value)} error={err('offerUntil')} />
                  <Input label="Bezeichnung" value={draft.offerLabel} onChange={(e) => set('offerLabel', e.target.value)} placeholder="z. B. Angebot der Woche" maxLength={40} />
                </FieldGrid>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Kein Angebot. Schalten Sie das Angebot ein, um einen Aktionspreis mit Enddatum festzulegen – er erscheint auf der Startseite und unter „Angebote“.
              </p>
            )}
          </FormSection>

          <FormSection title="Staffelpreise für Geschäftskunden" subtitle="Netto-Stückpreise ab einer Mindestmenge" icon={Layers}>
            <TierEditor tiers={draft.tiers} onChange={(tiers) => set('tiers', tiers)} listNet={listNet} vatRate={draft.vatRate} errors={errors} showErrors={showErrors} />
          </FormSection>

          <FormSection title="Lager" subtitle="Bestand, Meldebestand und Lagerplatz im Markt" icon={Warehouse}>
            <FieldGrid className="lg:grid-cols-3">
              <Input
                label={draft.isRental ? 'Vorhandene Leihartikel' : 'Bestand (Gebinde)'}
                inputMode="numeric"
                value={draft.stock}
                onChange={(e) => set('stock', e.target.value.replace(/[^\d]/g, ''))}
                error={err('stock')}
                hint={!isNew && draft.stock === initial.stock ? 'Zu- und Abgänge mit Grund buchen Sie in der Artikelliste.' : undefined}
              />
              <Input
                label="Meldebestand"
                inputMode="numeric"
                value={draft.minStock}
                onChange={(e) => set('minStock', e.target.value.replace(/[^\d]/g, ''))}
                error={err('minStock')}
                hint="Darunter erhalten Sie eine Warnung."
              />
              <Input label="Lagerplatz" value={draft.location} onChange={(e) => set('location', e.target.value)} placeholder="z. B. Gang 3" maxLength={40} />
            </FieldGrid>
            <p className={cn('mt-4 flex items-center gap-2 text-sm font-medium', stockTextClass(stockLevel(preview)))}>
              <StockDot level={stockLevel(preview)} />
              {stockLabel(stockLevel(preview))}
            </p>
          </FormSection>

          <FormSection title="Darstellung" subtitle="Farben der Produkt-Illustration im Shop" icon={Palette}>
            <div className="space-y-5">
              <FieldGrid>
                <ColorField
                  label="Hauptfarbe"
                  value={draft.color}
                  onChange={(v) => {
                    setColorsTouched(true);
                    set('color', v);
                  }}
                  error={err('color')}
                  hint="Kasten, Etikett bzw. Flasche"
                />
                <ColorField
                  label="Akzentfarbe"
                  value={draft.accent}
                  onChange={(v) => {
                    setColorsTouched(true);
                    set('accent', v);
                  }}
                  error={err('accent')}
                  hint="Schrift, Kronkorken, Details"
                />
              </FieldGrid>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Vorlagen</p>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map(([c, a]) => {
                    const on = draft.color.toLowerCase() === c && draft.accent.toLowerCase() === a;
                    return (
                      <button
                        key={`${c}${a}`}
                        type="button"
                        onClick={() => {
                          setColorsTouched(true);
                          setDraft((d) => ({ ...d, color: c, accent: a }));
                        }}
                        aria-label={`Farbvorlage ${c} / ${a}`}
                        aria-pressed={on}
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-xl border bg-white transition-shadow',
                          on ? 'border-brand-600 shadow-[0_0_0_2px_var(--color-brand-600)]' : 'border-slate-200 hover:border-slate-300',
                        )}
                      >
                        <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: c }}>
                          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-tl-full" style={{ background: a }} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection title="Sichtbarkeit & Verleih" icon={Eye}>
            <div className="divide-y divide-slate-100">
              <Switch
                checked={draft.active}
                onChange={(v) => set('active', v)}
                label="Im Shop sichtbar (aktiv)"
                description="Inaktive Artikel bleiben im Markt-Dashboard erhalten, sind aber nicht bestellbar."
                className="pb-3"
              />
              <Switch
                checked={draft.isRental}
                onChange={(v) => setDraft((d) => ({ ...d, isRental: v, depositTypeId: v ? '' : d.depositTypeId, material: v ? 'sonstiges' : d.material === 'sonstiges' ? 'glas' : d.material }))}
                label="Leihartikel für Feste"
                description="Preis gilt pro Veranstaltung, kein Pfand; der Bestand ist die Anzahl vorhandener Leihartikel."
                className="pt-3"
              />
            </div>
          </FormSection>
        </div>
      </form>

      {/* Aktionsleiste Handy/Tablet */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-slate-200 bg-white/95 pb-safe-4 pl-16 pr-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        <div className="flex gap-2 max-sm:[&>*]:flex-1 sm:justify-end">{actions}</div>
      </div>

      <ConfirmModal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        tone="danger"
        title="Änderungen verwerfen?"
        message="Sie haben Änderungen an diesem Artikel noch nicht gespeichert. Wenn Sie die Seite verlassen, gehen sie verloren."
        confirmLabel="Verwerfen"
        cancelLabel="Weiter bearbeiten"
      />
    </>
  );
}
