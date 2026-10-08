/**
 * Feste Aktionsleiste für Mobilgeräte (z. B. Summe + "Zur Kasse"), direkt über der
 * Tab-Leiste angedockt. Die Leiste meldet ihre Höhe als CSS-Variable `--sticky-bar-h`
 * am <html>-Element, damit Layout (Footer-Abstand), Demo-Pille und Toasts ausweichen
 * können. Immer diese Komponente statt eigener `fixed bottom-…`-Leisten verwenden.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StickyActionBarProps {
  children: ReactNode;
  /** 'tabbar' = über der Tab-Leiste des Shops (Default), 'none' = ganz unten (z. B. Fahrer-App ohne Tab-Leiste) */
  offset?: 'tabbar' | 'none';
  /** auch auf Desktop (lg+) anzeigen – Default: nur mobil */
  desktop?: boolean;
  className?: string;
}

const VAR = '--sticky-bar-h';

export function StickyActionBar({ children, offset = 'tabbar', desktop = false, className }: StickyActionBarProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      // display:none (Desktop) → Höhe 0
      root.style.setProperty(VAR, `${el.offsetHeight}px`);
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
      root.style.setProperty(VAR, '0px');
    };
  }, []);

  return (
    <div
      ref={ref}
      data-sticky-action-bar=""
      className={cn(
        'fixed inset-x-0 z-[35] border-t border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-bar backdrop-blur-md',
        offset === 'tabbar' ? 'bottom-[calc(env(safe-area-inset-bottom)+4rem)]' : 'bottom-0 pb-safe-4',
        !desktop && 'lg:hidden',
        className,
      )}
    >
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  );
}
