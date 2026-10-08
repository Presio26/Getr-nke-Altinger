import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import type { Order } from '@shared/types';
import { formatSlot } from '@shared/format';

const CONFETTI_COLORS = ['#f2a900', '#fbbd23', '#ffffff', '#9abce5', '#34d399', '#fde08a'];

/** Konfetti-Animation (einmalig, respektiert „Bewegung reduzieren“ über das globale CSS) */
const CONFETTI_CSS = `
@keyframes alt-confetti-fall {
  0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translate3d(var(--drift), 260px, 0) rotate(var(--spin)); opacity: 0; }
}
@keyframes alt-check-pop {
  0% { transform: scale(0.3); opacity: 0; }
  60% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); }
}
`;

/** Erfolgsbanner nach dem Bestellen („?neu=1“) */
export function SuccessBanner({ order, onClose }: { order: Order; onClose: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${(i % 9) * 0.09}s`,
        duration: `${1.6 + ((i * 7) % 10) / 10}s`,
        drift: `${((i * 53) % 80) - 40}px`,
        spin: `${((i * 97) % 540) + 180}deg`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: i % 3 === 0 ? 6 : 8,
        h: i % 3 === 0 ? 12 : 8,
        round: i % 4 === 0,
      })),
    [],
  );
  const pickup = order.fulfillment === 'pickup';
  return (
    <section
      role="status"
      aria-live="polite"
      className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-brand-900 px-5 py-6 text-white shadow-raised animate-pop-in sm:px-8 sm:py-8"
    >
      <style>{CONFETTI_CSS}</style>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="absolute top-0"
            style={{
              left: p.left,
              width: p.w,
              height: p.h,
              background: p.color,
              borderRadius: p.round ? 999 : 2,
              opacity: 0,
              animation: `alt-confetti-fall ${p.duration} cubic-bezier(.2,.6,.4,1) ${p.delay} 1 both`,
              ['--drift' as string]: p.drift,
              ['--spin' as string]: p.spin,
            }}
          />
        ))}
        <span className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
        <span className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-white/5" />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Hinweis schließen"
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X size={18} aria-hidden />
      </button>
      <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        <span className="relative flex h-16 w-16 shrink-0 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 animate-[ping_1.4s_cubic-bezier(0,0,0.2,1)_3] rounded-full bg-white/25" />
          <span
            className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg"
            style={{ animation: 'alt-check-pop 520ms cubic-bezier(.2,.9,.3,1.3) both' }}
          >
            <Check size={34} strokeWidth={3.2} />
          </span>
        </span>
        <div className="min-w-0 pr-8">
          <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-[1.7rem]">Vielen Dank für Ihre Bestellung!</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
            Ihre Bestellung <strong className="font-semibold text-white">{order.number}</strong> ist bei uns eingegangen.{' '}
            {pickup ? 'Wir legen alles für Sie bereit – Abholung' : 'Wir liefern'} <strong className="font-semibold text-white">{formatSlot(order.slot)}</strong>.
          </p>
          <p className="mt-1 text-sm text-white/70">
            {pickup
              ? 'Ihren Abholcode und QR-Code finden Sie unten. Wir melden uns, sobald alles bereitsteht.'
              : 'Sobald der Fahrer losfährt, können Sie die Lieferung hier live auf der Karte verfolgen.'}
          </p>
        </div>
      </div>
    </section>
  );
}
