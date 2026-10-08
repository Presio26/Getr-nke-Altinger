import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useOverlay } from './useOverlay';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** kurzer Text unter dem Titel */
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Klassen für den Inhaltsbereich */
  bodyClassName?: string;
  /** Schließen-Kreuz ausblenden */
  hideClose?: boolean;
}

const SIZE = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

/**
 * Dialog: auf dem Desktop zentriert, auf dem Handy als Bottom-Sheet.
 * Esc und Klick auf den Hintergrund schließen; Fokus bleibt im Dialog.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', bodyClassName, hideClose = false }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, panelRef);
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col bg-white shadow-pop outline-none',
          'rounded-t-3xl animate-sheet-up sm:rounded-2xl sm:animate-pop-in',
          SIZE[size],
        )}
      >
        {/* Griff (nur Bottom-Sheet) */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        {title || !hideClose ? (
          <div className="flex items-start gap-3 px-5 pb-1 pt-3 sm:px-6 sm:pt-5">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 id={titleId} className="text-lg font-bold leading-snug text-slate-900">
                  {title}
                </h2>
              ) : null}
              {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
            </div>
            {!hideClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Schließen"
                className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={20} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6', !footer && 'pb-safe-4 sm:pb-6', bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 pb-safe-4 pt-3 sm:flex-row sm:justify-end sm:px-6 sm:pb-5 sm:pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  tone = 'primary',
  loading = false,
}: ConfirmModalProps) {
  const Icon = tone === 'danger' ? AlertTriangle : HelpCircle;
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      size="sm"
      hideClose
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading} className="sm:min-w-28" data-autofocus={tone === 'danger' ? true : undefined}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus={tone === 'danger' ? undefined : true} className="sm:min-w-28">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4 pt-2">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
            tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700',
          )}
        >
          <Icon size={22} aria-hidden />
        </div>
        <div className="min-w-0 pt-1">
          <h2 className="text-lg font-bold leading-snug text-slate-900">{title}</h2>
          {message ? <div className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{message}</div> : null}
        </div>
      </div>
    </Modal>
  );
}
