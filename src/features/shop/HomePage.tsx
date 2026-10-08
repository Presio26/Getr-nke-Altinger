import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgePercent,
  Building2,
  CalendarClock,
  ChevronRight,
  FileText,
  MapPinned,
  PartyPopper,
  Recycle,
  Repeat2,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Product } from '@shared/types';
import { PRICE_GROUP_LABEL, formatEuro } from '@shared/format';
import { useCategories, useMyCustomer, useProducts, useSettings } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { ProductCard, ProductImage } from '@/components/product';
import { Badge, ButtonLink, Card, ErrorState, Notice, Section, Skeleton } from '@/components/ui';
import { todayString } from '@shared/time';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/hooks';
import { HeroArt, TEASER_ART } from './components/HeroArt';
import { CategoryIcon, categoryTint } from './components/CategoryIcon';
import { ProductCardSkeleton, ProductRail } from './components/ProductRail';
import { ZipCheck } from './components/ZipCheck';
import { OpenBadge, StoreMapCard } from './components/store';
import { ReorderCard, useLastOrder } from './components/ReorderCard';
import { popularity } from './components/catalog';
import { hasActiveOffer } from './components/offers';

// ───────────────────────────── Hero ─────────────────────────────

function Hero() {
  const user = useSession((s) => s.user);
  const business = user?.role === 'business';
  const settings = useSettings();
  const home = settings.zones.find((z) => z.zips.includes(settings.zip));
  const greeting = user && (user.role === 'customer' || business) ? `Willkommen zurück, ${user.name}` : null;

  return (
    <section
      aria-labelledby="hero-title"
      className={cn(
        'relative -mx-4 -mt-5 overflow-hidden bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950 pb-16 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:pb-20 lg:pb-16',
        business && 'max-sm:pb-14',
      )}
    >
      {/* dezentes Muster */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]">
        <defs>
          <pattern id="hero-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill="#fff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-dots)" />
      </svg>
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" aria-hidden />

      <div className="relative grid items-center gap-2 px-5 pt-7 sm:px-10 sm:pt-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-6 lg:px-14 lg:pt-14">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <OpenBadge onDark />
            {greeting ? (
              <span className="hidden rounded-full bg-accent-400/15 px-3 py-1 text-[13px] font-semibold text-accent-200 ring-1 ring-inset ring-accent-300/25 sm:inline-flex">
                {greeting}
              </span>
            ) : null}
          </div>
          <h1 id="hero-title" className="mt-4 text-[1.9rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Ihr Getränkemarkt in Garching –{' '}
            <span className="bg-gradient-to-r from-accent-300 to-accent-500 bg-clip-text text-transparent">geliefert oder zum Abholen bereit</span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/80 sm:mt-4 sm:text-lg">
            {business ? (
              <>Nettopreise, Ihre Konditionen und die Schnellbestellung für Ihren Betrieb – pünktlich geliefert oder zur Abholung bereitgestellt.</>
            ) : (
              <>
                Bier, Wasser, Limo und Festbedarf aus der Region – {home && home.fee === 0 ? 'in Garching liefern wir kostenlos' : 'wir liefern'} bis an Ihre Tür, auf
                Wunsch mit Live-Verfolgung. Oder Sie reservieren online und holen im Markt ab.
              </>
            )}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:flex sm:flex-wrap">
            {business ? (
              <>
                <ButtonLink to="/business/schnellbestellung" variant="accent" size="lg" icon={Zap} className="max-sm:col-span-2 max-sm:h-12">
                  Schnellbestellung
                </ButtonLink>
                <ButtonLink to="/business" size="lg" iconRight={ArrowRight} className="bg-white/10 ring-1 ring-inset ring-white/25 hover:bg-white/20 max-sm:col-span-2 max-sm:h-12">
                  Zum Portal
                </ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink to="/sortiment" variant="accent" size="lg" iconRight={ArrowRight} className="max-sm:h-12 max-sm:px-3">
                  <span className="sm:hidden">Sortiment</span>
                  <span className="hidden sm:inline">Sortiment entdecken</span>
                </ButtonLink>
                <ButtonLink to="/angebote" size="lg" icon={BadgePercent} className="bg-white/10 ring-1 ring-inset ring-white/25 hover:bg-white/20 max-sm:h-12 max-sm:px-3">
                  <span className="sm:hidden">Angebote</span>
                  <span className="hidden sm:inline">Angebote der Woche</span>
                </ButtonLink>
              </>
            )}
          </div>
        </div>
        <HeroArt
          className={cn(
            'mx-auto -mb-6 -mt-2 aspect-[16/11] w-full max-w-[21rem] sm:mt-0 sm:max-w-md lg:-mb-4 lg:max-w-none',
            business && 'max-sm:hidden',
          )}
        />
      </div>
    </section>
  );
}

// ───────────────────────────── PLZ-Check ─────────────────────────────

function ZipCard() {
  return (
    <Card padding="none" className="relative z-10 mx-0 -mt-10 shadow-raised sm:mx-6 lg:mx-10">
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <Truck size={22} aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Liefern wir zu Ihnen?</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-500">Postleitzahl eingeben – wir zeigen Liefergebühr, Mindestbestellwert und ab wann die Lieferung kostenlos ist.</p>
          </div>
        </div>
        <ZipCheck />
      </div>
    </Card>
  );
}

// ───────────────────────────── Vorteile ─────────────────────────────

function Benefits() {
  const settings = useSettings();
  const home = settings.zones.find((z) => z.zips.includes(settings.zip));
  const items: { icon: LucideIcon; title: string; text: string; to: string }[] = [
    {
      icon: Truck,
      title: 'Kostenlose Lieferung in Garching',
      text: home
        ? `Ab ${formatEuro(home.minOrder)} Warenwert bringen wir Ihre Getränke gratis bis an die Haustür.`
        : 'Wir bringen Ihre Getränke bis an die Haustür – auf Wunsch mit Tragservice.',
      to: '/markt',
    },
    { icon: MapPinned, title: 'Live-Verfolgung', text: 'Sehen Sie auf der Karte, wo Ihr Fahrer gerade ist – inklusive voraussichtlicher Ankunft.', to: '/bestellungen' },
    {
      icon: ShoppingBag,
      title: 'Click & Collect',
      text: `Online reservieren, im Markt abholen – Ihre Bestellung liegt ${settings.pickupHoldHours} Stunden für Sie bereit.`,
      to: '/sortiment',
    },
    { icon: Recycle, title: 'Leergut-Abholung', text: 'Leere Kästen nimmt der Fahrer gleich mit – das Pfand schreiben wir Ihnen gut.', to: '/warenkorb' },
    { icon: PartyPopper, title: 'Festservice', text: 'Fassbier, Zapfanlage, Garnituren und Kühlung – alles für Ihr Fest aus einer Hand.', to: '/fest' },
  ];
  return (
    <Section className="!mt-8">
      <h2 className="sr-only">Ihre Vorteile</h2>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {items.map((b) => (
          <li key={b.title} className="w-[16rem] shrink-0 snap-start lg:w-auto">
            <Link
              to={b.to}
              className="group flex h-full flex-col rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-raised"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm shadow-brand-900/20">
                <b.icon size={21} aria-hidden />
              </span>
              <span className="mt-3 text-[15px] font-semibold leading-snug text-slate-900">{b.title}</span>
              <span className="mt-1 text-sm leading-relaxed text-slate-500">{b.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ───────────────────────────── Geschäftskunden-Portal ─────────────────────────────

function BusinessPortal({ overlap = false }: { overlap?: boolean }) {
  const { data: customer, isLoading } = useMyCustomer();
  const b2b = customer?.b2b;
  const tiles: { to: string; icon: LucideIcon; title: string; text: string; primary?: boolean }[] = [
    { to: '/business/schnellbestellung', icon: Zap, title: 'Schnellbestellung', text: 'Bestellmatrix mit Ihren Stammartikeln', primary: true },
    { to: '/business/dauerauftraege', icon: Repeat2, title: 'Daueraufträge', text: 'Regelmäßige Lieferungen verwalten' },
    { to: '/business/rechnungen', icon: FileText, title: 'Rechnungen', text: 'Offene Posten & Belege' },
    { to: '/business/standorte', icon: MapPinned, title: 'Standorte', text: 'Lieferadressen & Kostenstellen' },
  ];
  return (
    <section aria-label="Geschäftskunden-Portal" className={overlap ? 'relative z-10 -mt-10 sm:mx-6 lg:mx-10' : 'mt-8'}>
      <Card padding="none" className={cn('overflow-hidden', overlap && 'shadow-raised')}>
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white p-4 sm:flex-row sm:items-center sm:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-white">
            <Building2 size={24} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">Geschäftskunden-Portal</p>
            {isLoading ? (
              <Skeleton className="mt-1.5 h-6 w-64" />
            ) : (
              <h2 className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900">{customer?.name ?? 'Ihr Unternehmen'}</h2>
            )}
            {b2b ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="neutral">Kd.-Nr. {b2b.customerNumber}</Badge>
                <Badge tone="brand">
                  Preisgruppe {PRICE_GROUP_LABEL[b2b.priceGroup]}
                  {b2b.discountPercent ? ` · ${String(b2b.discountPercent).replace('.', ',')} % Rabatt` : ''}
                </Badge>
                {b2b.allowInvoice ? <Badge tone="success">Kauf auf Rechnung · {b2b.paymentTermsDays} Tage</Badge> : null}
                {b2b.freeDelivery ? <Badge tone="accent">Lieferung frei Haus</Badge> : null}
              </div>
            ) : null}
          </div>
          <ButtonLink to="/business/schnellbestellung" variant="accent" size="lg" icon={Zap} className="sm:self-center">
            Jetzt schnell bestellen
          </ButtonLink>
        </div>
        {b2b?.status === 'pending' ? (
          <Notice tone="warning" className="m-4 sm:m-6" title="Ihr Geschäftskundenkonto wird gerade geprüft">
            Sie können bereits bestellen und sehen Nettopreise. Rechnungskauf und Ihre Konditionen schalten wir nach der Prüfung frei.
          </Notice>
        ) : null}
        <ul className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
          {tiles.map((t) => (
            <li key={t.to} className="bg-white">
              <Link to={t.to} className="group flex h-full items-start gap-3 p-4 transition-colors hover:bg-slate-50 sm:p-5">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    t.primary ? 'bg-accent-100 text-accent-800' : 'bg-slate-100 text-slate-600 group-hover:bg-brand-50 group-hover:text-brand-700',
                  )}
                >
                  <t.icon size={20} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[15px] font-semibold text-slate-900">
                    {t.title}
                    <ChevronRight size={16} aria-hidden className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{t.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

// ───────────────────────────── Nochmal bestellen ─────────────────────────────

function Reorder() {
  const { order, loading } = useLastOrder();
  if (loading) return <Skeleton className="mt-8 h-40 w-full rounded-2xl sm:mt-10" />;
  if (!order) return null;
  return (
    <Section
      title="Nochmal bestellen"
      subtitle="Ihre letzte Bestellung – mit einem Klick wieder im Warenkorb."
      action={
        <Link to="/bestellungen" className="inline-flex h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
          Alle Bestellungen <ChevronRight size={16} aria-hidden />
        </Link>
      }
    >
      <ReorderCard order={order} />
    </Section>
  );
}

// ───────────────────────────── Kategorien ─────────────────────────────

function Categories({ products }: { products: Product[] | undefined }) {
  const categories = useCategories();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products ?? []) if (p.active) m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
    return m;
  }, [products]);
  const sorted = [...categories].sort((a, b) => a.sort - b.sort);
  return (
    <Section
      title="Unser Sortiment"
      subtitle="Von Münchner Hell bis Bierzeltgarnitur – stöbern Sie nach Kategorien."
      action={
        <Link to="/sortiment" className="hidden h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800 sm:inline-flex">
          Alle Artikel <ChevronRight size={16} aria-hidden />
        </Link>
      }
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4">
        {sorted.map((c) => {
          const n = counts.get(c.id);
          return (
            <li key={c.id}>
              <Link
                to={`/sortiment/${c.id}`}
                className="group relative flex h-full items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-3 shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-raised sm:p-4 lg:items-start lg:gap-4 lg:p-5"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 lg:h-14 lg:w-14 lg:rounded-2xl"
                  style={{ background: categoryTint(c.color, 14), color: c.color }}
                >
                  <CategoryIcon name={c.icon} size={24} className="lg:h-7 lg:w-7" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-3 text-sm font-semibold leading-snug text-slate-900 [hyphens:auto] sm:line-clamp-2 sm:text-[15px] lg:text-base">{c.name}</span>
                  <span className="mt-1 hidden text-sm leading-snug text-slate-500 lg:line-clamp-2">{c.description}</span>
                  <span className="mt-0.5 block text-xs font-medium text-slate-400 lg:mt-2">{n !== undefined ? `${n} Artikel` : ' '}</span>
                </span>
                <ChevronRight size={18} aria-hidden className="hidden shrink-0 self-center text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 sm:block" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ───────────────────────────── Teaser ─────────────────────────────

function Teasers({ products }: { products: Product[] | undefined }) {
  const role = useSession((s) => s.user?.role ?? null);
  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const garnitur = byId.get('bierzeltgarnitur') ?? TEASER_ART.KEG;
  const zapf = byId.get('zapfanlage-1') ?? TEASER_ART.KEG;
  const keg = byId.get('augustiner-hell-fass-30') ?? TEASER_ART.KEG;
  const b2bTarget = role === 'business' ? '/business' : '/geschaeftskunde';

  return (
    <Section title="Mehr als ein Getränkemarkt">
      <div className="grid gap-4 lg:grid-cols-2">
        <Link
          to="/fest"
          className="group relative flex min-h-[15rem] flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-accent-400 via-accent-500 to-accent-600 p-6 text-brand-950 shadow-card transition-shadow hover:shadow-raised sm:p-8"
        >
          <div className="relative z-10 sm:max-w-[55%]">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-950/70">
              <PartyPopper size={15} aria-hidden /> Festservice &amp; Verleih
            </p>
            <h3 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-[1.7rem]">Ihr Fest – wir liefern alles</h3>
            <p className="mt-2 text-sm leading-relaxed text-brand-950/80 sm:text-[15px]">
              Fassbier, Zapfanlage, Bierzeltgarnituren und Kühlung. Mit Party-Planer und Kommissionsware.
            </p>
            <span className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-950 px-4 text-[15px] font-semibold text-white transition-colors group-hover:bg-brand-900">
              Fest planen <ArrowRight size={18} aria-hidden />
            </span>
          </div>
          <div aria-hidden className="relative -mb-6 ml-auto mt-2 h-40 w-[82%] sm:absolute sm:-right-6 sm:bottom-0 sm:mb-0 sm:mt-0 sm:h-full sm:w-[52%]">
            <div className="absolute bottom-[4%] right-[34%] aspect-square w-[62%]">
              <ProductImage product={garnitur} />
            </div>
            <div className="absolute bottom-[34%] right-[2%] aspect-square w-[48%]">
              <ProductImage product={zapf} />
            </div>
            <div className="absolute bottom-[2%] right-[4%] aspect-square w-[44%]">
              <ProductImage product={keg} />
            </div>
          </div>
        </Link>

        <Link
          to={b2bTarget}
          className="group relative flex min-h-[15rem] flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-brand-950 p-6 text-white shadow-card transition-shadow hover:shadow-raised sm:p-8"
        >
          <div className="relative z-10 sm:max-w-[55%]">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-300">
              <Building2 size={15} aria-hidden /> Für Geschäftskunden
            </p>
            <h3 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-[1.7rem]">
              {role === 'business' ? 'Ihr Portal für Gastro & Büro' : 'Gastronomie, Büro & Verein'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/75 sm:text-[15px]">
              Nettopreise, Staffelrabatte, Kauf auf Rechnung, Daueraufträge und Lieferung frei Haus.
            </p>
            <span className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[15px] font-semibold text-slate-900 transition-colors group-hover:bg-accent-100">
              {role === 'business' ? 'Zum Portal' : 'Geschäftskunde werden'} <ArrowRight size={18} aria-hidden />
            </span>
          </div>
          <div aria-hidden className="relative -mb-6 ml-auto mt-2 h-40 w-[70%] sm:absolute sm:-right-4 sm:bottom-0 sm:mb-0 sm:mt-0 sm:h-full sm:w-[52%]">
            <div className="absolute bottom-[30%] right-[6%] aspect-square w-[58%] opacity-90">
              <ProductImage product={TEASER_ART.WATER} />
            </div>
            <div className="absolute bottom-[2%] right-[22%] aspect-square w-[70%]">
              <ProductImage product={TEASER_ART.CRATE} />
            </div>
          </div>
        </Link>
      </div>
    </Section>
  );
}

// ───────────────────────────── Seite ─────────────────────────────

export default function HomePage() {
  const role = useSession((s) => s.user?.role ?? null);
  const status = useSession((s) => s.status);
  const { data: products, isLoading, isError, error, refetch } = useProducts();
  const isCustomer = role === 'customer' || role === 'business';
  useDocumentTitle(null);

  const offers = useMemo(() => {
    const today = todayString();
    return (products ?? [])
      .filter((p) => hasActiveOffer(p, today))
      .sort((a, b) => (b.priceGross - (b.offer?.priceGross ?? 0)) / b.priceGross - (a.priceGross - (a.offer?.priceGross ?? 0)) / a.priceGross);
  }, [products]);

  const bestsellers = useMemo(
    () =>
      (products ?? [])
        .filter((p) => p.active && !p.isRental && p.tags.includes('bestseller'))
        .sort((a, b) => popularity(b) - popularity(a))
        .slice(0, 8),
    [products],
  );

  return (
    <>
      <Hero />
      {role === 'business' ? (
        <BusinessPortal overlap />
      ) : (
        <>
          <ZipCard />
          <Benefits />
        </>
      )}
      {isCustomer && status === 'authenticated' ? <Reorder /> : null}

      <Section
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={20} aria-hidden className="text-accent-500" /> Angebote der Woche
          </span>
        }
        subtitle={offers.length ? `${offers.length} Aktionsartikel – nur solange der Vorrat reicht.` : 'Frisch reduziert für Sie.'}
        action={
          <Link to="/angebote" className="inline-flex h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
            Alle Angebote <ChevronRight size={16} aria-hidden />
          </Link>
        }
      >
        {isError ? (
          <Card>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </Card>
        ) : !isLoading && !offers.length ? (
          <Card className="text-sm text-slate-500">Diese Woche gibt es keine Aktionsartikel – schauen Sie bald wieder vorbei.</Card>
        ) : (
          <ProductRail products={offers} loading={isLoading} label="Angebote der Woche" />
        )}
      </Section>

      <Categories products={products} />

      <Section
        title="Beliebt in Garching"
        subtitle="Unsere meistbestellten Artikel."
        action={
          <Link to="/sortiment?sort=beliebt" className="inline-flex h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
            Mehr <ChevronRight size={16} aria-hidden />
          </Link>
        }
      >
        {isError ? null : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="flex">
                    <ProductCardSkeleton />
                  </li>
                ))
              : bestsellers.map((p, i) => (
                  <li key={p.id} className={i < 4 ? 'flex' : i < 6 ? 'hidden sm:flex' : 'hidden lg:flex'}>
                    <ProductCard product={p} className="w-full" />
                  </li>
                ))}
          </ul>
        )}
      </Section>

      <Teasers products={products} />

      <Section
        title={
          <span className="flex items-center gap-2">
            <Store size={20} aria-hidden className="text-brand-600" /> Unser Markt
          </span>
        }
        subtitle={
          <span className="flex items-center gap-1.5">
            <CalendarClock size={14} aria-hidden /> Click &amp; Collect, Leergutannahme und persönliche Beratung vor Ort.
          </span>
        }
      >
        <StoreMapCard />
      </Section>
    </>
  );
}
