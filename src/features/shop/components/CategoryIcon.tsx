import {
  Apple,
  Beer,
  BeerOff,
  Citrus,
  Coffee,
  CupSoda,
  Droplets,
  Flame,
  Gift,
  GlassWater,
  Grape,
  Leaf,
  Martini,
  Milk,
  Package,
  PartyPopper,
  ShoppingBasket,
  Snowflake,
  Sparkles,
  Tent,
  Wine,
  type LucideIcon,
} from 'lucide-react';

/**
 * Lucide-Symbole für Category.icon. Bewusst eine feste Auswahl (statt aller Icons),
 * damit das Bundle klein bleibt; unbekannte Namen fallen auf ein neutrales Symbol zurück.
 */
const ICONS: Record<string, LucideIcon> = {
  Apple,
  Beer,
  BeerOff,
  Citrus,
  Coffee,
  CupSoda,
  Droplets,
  Flame,
  Gift,
  GlassWater,
  Grape,
  Leaf,
  Martini,
  Milk,
  Package,
  PartyPopper,
  ShoppingBasket,
  Snowflake,
  Sparkles,
  Tent,
  Wine,
};

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Package;
}

export function CategoryIcon({ name, size = 20, className }: { name: string | undefined; size?: number; className?: string }) {
  const Icon = categoryIcon(name);
  return <Icon size={size} aria-hidden className={className} />;
}

/** Hintergrund/Vordergrund einer Kategorie-Kachel aus der Kategoriefarbe */
export function categoryTint(color: string, strength = 12): string {
  return `color-mix(in srgb, ${color} ${strength}%, #ffffff)`;
}
