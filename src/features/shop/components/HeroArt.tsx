import type { Product } from '@shared/types';
import { ProductImage } from '@/components/product';
import { cn } from '@/lib/cn';

/** Minimaler Artikel nur für die dekorative Illustration (keine echten Sortimentsdaten) */
function art(p: Partial<Product> & Pick<Product, 'id' | 'brand' | 'name' | 'packaging' | 'material' | 'unitCount' | 'color' | 'accent'>): Product {
  return {
    sku: p.id,
    categoryId: 'bier',
    description: '',
    unitVolumeL: 0.5,
    priceGross: 0,
    vatRate: 19,
    tags: [],
    stock: 1,
    minStock: 0,
    active: true,
    ...p,
  };
}

const CRATE = art({ id: 'hero-crate', brand: 'Altinger', name: 'Hell', packaging: '20 × 0,5 l Glas', material: 'glas', unitCount: 20, color: '#1d58a0', accent: '#f2a900', depositTypeId: 'kasten-bier-20' });
const WATER = art({ id: 'hero-water', brand: 'Quelle', name: 'Classic', packaging: '12 × 0,75 l Glas', material: 'glas', unitCount: 12, unitVolumeL: 0.75, color: '#0284c7', accent: '#e0f2fe', categoryId: 'wasser', depositTypeId: 'kasten-glas-12' });
const KEG = art({ id: 'hero-keg', brand: 'Festbier', name: 'Hell – Fass', packaging: '30-l-Fass', material: 'fass', unitCount: 1, unitVolumeL: 30, color: '#b45309', accent: '#fcd34d', categoryId: 'fass' });
const SIXPACK = art({ id: 'hero-six', brand: 'Weissbier', name: 'Hefe Sixpack', packaging: '6 × 0,5 l Glas', material: 'glas', unitCount: 6, color: '#7a4a1d', accent: '#f59e0b' });
const WINE = art({ id: 'hero-wine', brand: 'Sekt', name: 'Trocken', packaging: '0,75 l Flasche', material: 'glas', unitCount: 1, unitVolumeL: 0.75, color: '#9f1239', accent: '#fde68a', categoryId: 'wein' });

/**
 * Komposition aus Produkt-Illustrationen für den Startseiten-Hero (ohne Fotos).
 * Füllt den Container; Größen in Prozent, damit sie mit der Breite skaliert.
 */
export function HeroArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none relative select-none', className)}>
      {/* Lichtkreise */}
      <div className="absolute left-[8%] top-[6%] h-[78%] w-[78%] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.22),rgba(255,255,255,0)_68%)]" />
      <div className="absolute bottom-[8%] right-[2%] h-[46%] w-[46%] rounded-full bg-[radial-gradient(circle_at_center,rgba(242,169,0,0.32),rgba(242,169,0,0)_70%)]" />
      {/* Bodenfläche */}
      <div className="absolute bottom-[9%] left-[6%] right-[4%] h-[14%] rounded-[50%] bg-brand-950/35 blur-xl" />

      <div className="absolute bottom-[30%] left-[3%] aspect-square w-[34%] opacity-95">
        <ProductImage product={KEG} />
      </div>
      <div className="absolute bottom-[29%] right-[1%] aspect-square w-[40%] opacity-95">
        <ProductImage product={WATER} />
      </div>
      <div className="absolute bottom-[3%] left-[19%] aspect-square w-[56%] drop-shadow-[0_18px_24px_rgba(8,20,40,0.35)]">
        <ProductImage product={CRATE} />
      </div>
      <div className="absolute bottom-[1%] left-[-3%] aspect-square w-[30%] drop-shadow-[0_12px_18px_rgba(8,20,40,0.3)]">
        <ProductImage product={SIXPACK} />
      </div>
      <div className="absolute bottom-[2%] right-[-1%] aspect-square w-[25%] drop-shadow-[0_12px_18px_rgba(8,20,40,0.3)]">
        <ProductImage product={WINE} />
      </div>
    </div>
  );
}

/** Kleine Komposition für Teaser-Kacheln (Festservice / Geschäftskunden) */
export const TEASER_ART = { CRATE, WATER, KEG, SIXPACK, WINE, art };
