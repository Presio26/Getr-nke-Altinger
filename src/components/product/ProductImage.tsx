import { memo, useId } from 'react';
import type { Product } from '@shared/types';
import { cn } from '@/lib/cn';
import { Crate } from './illustrations/Crate';
import { Sixpack, SingleBottle } from './illustrations/Bottles';
import { CanTray, PetPack, TetraPack } from './illustrations/Packs';
import { SteelKeg, WoodenBarrel } from './illustrations/Kegs';
import { RentalItem } from './illustrations/Rental';

export type ProductIllustrationKind = 'crate' | 'sixpack' | 'bottle' | 'cans' | 'keg' | 'barrel' | 'tetra' | 'petpack' | 'rental';

/** Welche Illustration passt zum Gebinde? */
export function illustrationKind(p: Product): ProductIllustrationKind {
  const text = `${p.name} ${p.packaging}`.toLowerCase();
  if (p.isRental || p.material === 'sonstiges') return 'rental';
  if (p.material === 'fass') return /holzfass/.test(text) ? 'barrel' : 'keg';
  if (p.material === 'dose') return 'cans';
  if (p.material === 'tetra') return 'tetra';
  if (p.material === 'pet' && (/einweg/.test(text) || p.depositTypeId?.startsWith('einweg'))) return 'petpack';
  if (p.unitCount <= 1) return 'bottle';
  if (p.unitCount === 6 && p.material === 'glas' && (p.categoryId === 'bier' || p.categoryId === 'alkoholfrei' || /sixpack/.test(text))) {
    return 'sixpack';
  }
  return 'crate';
}

export interface ProductImageProps {
  product: Product;
  /** Kantenlänge in px (sonst füllt die Grafik den Container) */
  size?: number;
  className?: string;
}

/**
 * Detailreiche SVG-Illustration je Gebinde-Art (Kasten mit Flaschen, Sixpack, Flasche, Dosen, Fass,
 * Tetra-Karton, Leihartikel). Farben aus product.color/accent, Marke als Etikett-Textband – keine Logos.
 */
export const ProductImage = memo(function ProductImage({ product, size, className }: ProductImageProps) {
  const raw = useId();
  const uid = `pi${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const kind = illustrationKind(product);
  const props = { product, uid };
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`${product.brand} ${product.name}, ${product.packaging}`}
      className={cn(!size && 'h-full w-full', 'select-none', className)}
    >
      {kind === 'crate' ? <Crate {...props} /> : null}
      {kind === 'sixpack' ? <Sixpack {...props} /> : null}
      {kind === 'bottle' ? <SingleBottle {...props} /> : null}
      {kind === 'cans' ? <CanTray {...props} /> : null}
      {kind === 'keg' ? <SteelKeg {...props} /> : null}
      {kind === 'barrel' ? <WoodenBarrel {...props} /> : null}
      {kind === 'tetra' ? <TetraPack {...props} /> : null}
      {kind === 'petpack' ? <PetPack {...props} /> : null}
      {kind === 'rental' ? <RentalItem {...props} /> : null}
    </svg>
  );
});

/** Dezent eingefärbter Hintergrund passend zur Produktfarbe */
export function productTint(product: Product, strength = 0.08): string {
  return `color-mix(in srgb, ${product.color} ${Math.round(strength * 100)}%, #f8fafc)`;
}
