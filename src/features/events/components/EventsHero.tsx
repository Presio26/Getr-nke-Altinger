import { ArrowDown, Calculator, Snowflake, Truck, Undo2 } from 'lucide-react';
import type { Product } from '@shared/types';
import { formatEuro } from '@shared/format';
import { usePrice, useProducts } from '@/api/hooks';
import { ProductImage } from '@/components/product';
import { cn } from '@/lib/cn';

/** Weiß-blaues Rautenband (bayerische Festdeko) */
export function RautenBand({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={cn('h-3 w-full', className)} preserveAspectRatio="none">
      <defs>
        <pattern id="rauten" width="24" height="12" patternUnits="userSpaceOnUse">
          <rect width="24" height="12" fill="#ffffff" />
          <path d="M0 6 L6 0 L12 6 L6 12 Z M12 6 L18 0 L24 6 L18 12 Z" fill="#3d76be" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#rauten)" />
    </svg>
  );
}

function ShowcaseItem({ product, className, tag, big }: { product?: Product; className?: string; tag: string; big?: boolean }) {
  if (!product) return null;
  return <ShowcaseCard product={product} className={className} tag={tag} big={big} />;
}

function ShowcaseCard({ product, className, tag, big }: { product: Product; className?: string; tag: string; big?: boolean }) {
  const price = usePrice(product);
  return (
    <div className={cn('rounded-2xl bg-white p-3 text-slate-900 shadow-pop ring-1 ring-slate-900/5', className)}>
      <div className={cn('w-full overflow-hidden rounded-xl bg-slate-50', big ? 'aspect-[4/5]' : 'aspect-[4/3]')}>
        <ProductImage product={product} className="h-full w-full p-2" />
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-tight">{product.isRental ? product.name : `${product.brand} ${product.name}`}</p>
      <p className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="truncate">{tag}</span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatEuro(price.displayUnit)}</span>
      </p>
    </div>
  );
}

export function EventsHero() {
  const { data } = useProducts();
  const byId = (id: string) => data?.find((p) => p.id === id);
  const garnituren = byId('bierzeltgarnitur');
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white shadow-raised">
      <RautenBand className="opacity-90" />
      <div aria-hidden className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="relative grid gap-8 px-5 pb-8 pt-7 sm:px-8 sm:pb-10 sm:pt-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-6 lg:px-12 lg:pb-12 lg:pt-12">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-300">Festservice · Verleih · Kommission</p>
          <h1 className="mt-3 text-[2rem] font-bold leading-[1.1] tracking-tight sm:text-5xl">
            Ihr Fest.
            <br />
            Wir kümmern uns um <span className="text-accent-300">die Getränke.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/80 sm:text-lg">
            Vom Gartenfest bis zur Vereinsfeier: Fassbier mit Zapfanlage, Bierzeltgarnituren, Kühlung und Getränke auf Kommission – geliefert in Garching und Umgebung oder
            abholbereit im Markt.
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={() => scrollTo('planer')}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent-500 px-5 text-base font-semibold text-brand-950 shadow-sm transition-colors hover:bg-accent-400"
            >
              <Calculator size={19} aria-hidden /> Party-Planer starten
            </button>
            <button
              type="button"
              onClick={() => scrollTo('verleih')}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 px-5 text-base font-semibold text-white ring-1 ring-inset ring-white/25 transition-colors hover:bg-white/15"
            >
              Leihartikel ansehen <ArrowDown size={18} aria-hidden />
            </button>
          </div>
          <ul className="mt-7 grid gap-3 text-sm text-white/85 sm:grid-cols-3">
            {[
              { icon: Undo2, text: 'Volle Kästen zurück – Sie zahlen nur, was getrunken wurde' },
              { icon: Snowflake, text: 'Zapfanlagen, Kühlschränke & Kühlanhänger' },
              { icon: Truck, text: 'Lieferung, Aufbau-Tipps & Abholung' },
            ].map((f) => (
              <li key={f.text} className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent-300 ring-1 ring-white/10">
                  <f.icon size={16} aria-hidden />
                </span>
                <span className="leading-snug">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative hidden lg:block" aria-hidden>
          <div className="grid h-full grid-cols-2 gap-4 pl-6">
            <ShowcaseItem product={byId('augustiner-hell-fass-30')} tag="Fass für ca. 60 Halbe" className="row-span-2 -rotate-2 self-center" big />
            <ShowcaseItem product={byId('zapfanlage-1')} tag="inkl. CO₂ & Einweisung" className="rotate-2" />
            <ShowcaseItem product={garnituren} tag="für 6–8 Personen" className="-rotate-1" />
          </div>
          {garnituren ? (
            <div className="absolute -bottom-2 left-2 rounded-2xl bg-accent-500 px-4 py-3 text-brand-950 shadow-pop">
              <p className="text-2xl font-bold leading-none tabular-nums">{garnituren.stock}</p>
              <p className="mt-1 text-xs font-semibold">Bierzeltgarnituren im Verleih</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
