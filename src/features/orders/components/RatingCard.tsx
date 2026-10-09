import { useState } from 'react';
import { Send, Star } from 'lucide-react';
import type { Order } from '@shared/types';
import { formatDate } from '@shared/format';
import { api } from '@/api/client';
import { qk, useApiMutation } from '@/api/hooks';
import { Button, Card, CardHeader, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

const LABELS = ['', 'Nicht zufrieden', 'Geht so', 'In Ordnung', 'Gut', 'Ausgezeichnet!'];

function Stars({ value, size = 22, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-0.5', className)} aria-label={`${value} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} aria-hidden className={n <= value ? 'fill-accent-400 text-accent-500' : 'fill-slate-100 text-slate-300'} />
      ))}
    </span>
  );
}

/** Bewertung nach Zustellung/Abholung (Sterne + Kommentar); readOnly für den Markt */
export function RatingCard({ order, readOnly = false }: { order: Order; readOnly?: boolean }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const rate = useApiMutation((vars: { stars: number; comment: string }) => api.rateOrder(order.id, vars.stars, vars.comment || undefined), {
    invalidate: [qk.order(order.id), qk.orders],
    success: 'Danke für Ihre Bewertung!',
  });

  if (order.rating) {
    return (
      <Card id="bewertung" className="scroll-mt-24 lg:scroll-mt-40">
        <CardHeader title="Ihre Bewertung" subtitle={`Abgegeben am ${formatDate(order.rating.at, 'short')}`} icon={Star} />
        <div className="flex items-center gap-3">
          <Stars value={order.rating.stars} size={24} />
          <span className="text-sm font-semibold text-slate-700">{LABELS[order.rating.stars]}</span>
        </div>
        {order.rating.comment ? (
          <blockquote className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-[15px] italic leading-relaxed text-slate-700">„{order.rating.comment}“</blockquote>
        ) : null}
        {!readOnly ? <p className="mt-3 text-sm text-slate-500">Vielen Dank – Ihr Feedback hilft uns, noch besser zu werden.</p> : null}
      </Card>
    );
  }

  if (readOnly) return null;

  const shown = hover || stars;
  return (
    <Card id="bewertung" className="scroll-mt-24 border-accent-200 bg-gradient-to-br from-white to-accent-50/60 lg:scroll-mt-40">
      <CardHeader
        title={order.fulfillment === 'pickup' ? 'Wie war Ihre Abholung?' : 'Wie war Ihre Lieferung?'}
        subtitle="Ihre Meinung hilft uns und unserem Team."
        icon={Star}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (stars) rate.mutate({ stars, comment: comment.trim() });
        }}
        className="space-y-4"
      >
        <div>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Sterne vergeben" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
                onClick={() => setStars(n)}
                onMouseEnter={() => setHover(n)}
                className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  size={32}
                  aria-hidden
                  className={cn('transition-colors', n <= shown ? 'fill-accent-400 text-accent-500' : 'fill-white text-slate-300')}
                />
              </button>
            ))}
          </div>
          <p className="mt-1 h-5 text-sm font-semibold text-slate-700">{shown ? LABELS[shown] : 'Tippen Sie auf die Sterne'}</p>
        </div>
        {stars ? (
          <Textarea
            label="Kommentar (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={stars >= 4 ? 'Was hat Ihnen besonders gefallen?' : 'Was können wir besser machen?'}
          />
        ) : null}
        <Button type="submit" icon={Send} disabled={!stars} loading={rate.isPending}>
          Bewertung senden
        </Button>
      </form>
    </Card>
  );
}
