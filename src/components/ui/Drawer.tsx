import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOverlay } from './useOverlay';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  side?: 'right' | 'left';
  /** CSS-Breite, Default "min(28rem, 100vw)" */
  width?: string;
  footer?: ReactNode;
  /** Klassen für den Inhaltsbereich */
  bodyClassName?: string;
}

/** Seitenleiste über dem Inhalt (z. B. Bestelldetails im Admin, mobile Navigation) */
export function Drawer({ open, onClose, title, children, side = 'right', width = 'min(28rem, 100vw)', footer, bodyClassName }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, panelRef);
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={{ width }}
        className={cn(
          'absolute inset-y-0 flex max-w-full flex-col bg-white shadow-pop outline-none',
          side === 'right' ? 'right-0 animate-slide-in-right' : 'left-0 animate-slide-in-left',
        )}
      >
        {title !== undefined ? (
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 pb-3 pt-safe">
            <h2 id={titleId} className="min-w-0 flex-1 truncate pt-4 text-lg font-bold text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="-mr-2 mt-3 flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X size={20} aria-hidden />
            </button>
          </div>
        ) : null}
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4', bodyClassName)}>{children}</div>
        {footer ? <div className="border-t border-slate-100 px-5 pb-safe-4 pt-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
