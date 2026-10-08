/**
 * Gemeinsames Verhalten für Modal & Drawer: Esc schließt (nur oberstes Overlay),
 * Fokusfalle, Fokus zurückgeben, Scroll-Sperre des Hintergrunds.
 */
import { useEffect, useRef, type RefObject } from 'react';

const stack: symbol[] = [];
let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

function lockScroll() {
  if (lockCount === 0) {
    const body = document.body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  lockCount += 1;
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('data-focus-skip') && (el.offsetParent !== null || el === document.activeElement),
  );
}

export function useOverlay(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = Symbol('overlay');
    stack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockScroll();

    // Fokus ins Overlay setzen (erstes Feld mit autoFocus, sonst Panel selbst)
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const auto = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      (auto ?? panel).focus({ preventScroll: true });
    }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const items = focusables(panel);
        if (items.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (!panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      unlockScroll();
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);
}
