/**
 * Unterschriftenfeld (Canvas + Pointer-Events): gestochen scharf dank devicePixelRatio,
 * Striche bleiben bei Größenänderung erhalten, Ergebnis als PNG-Data-URL.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, PenLine } from 'lucide-react';
import { cn } from '@/lib/cn';
import { hasFinePointer } from '@/lib/platform';
import { Button } from '@/components/ui';

interface Point {
  x: number;
  y: number;
}

export interface SignaturePadProps {
  /** wird nach jedem Strich mit der PNG-Data-URL aufgerufen (null = leer) */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** Höhe in CSS-Pixeln */
  height?: number;
  /** Name unter der Linie (z. B. Empfänger) */
  signerName?: string;
}

const INK = '#0f172a';
const LINE_WIDTH = 2.6;

function drawStroke(ctx: CanvasRenderingContext2D, pts: Point[]) {
  if (pts.length === 0) return;
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0].x, pts[0].y, LINE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  // geglättet: quadratische Kurven durch die Mittelpunkte
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

export function SignaturePad({ onChange, disabled = false, invalid = false, className, height = 190, signerName }: SignaturePadProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const active = useRef<{ id: number; points: Point[] } | null>(null);
  const [empty, setEmpty] = useState(true);
  const cb = useRef(onChange);
  cb.current = onChange;

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = LINE_WIDTH;
    ctx.strokeStyle = INK;
    return ctx;
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = setup();
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (const s of strokes.current) drawStroke(ctx, s);
  }, [setup]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    redraw();
    let last = wrap.clientWidth;
    const ro = new ResizeObserver(() => {
      if (wrap.clientWidth === last) return;
      last = wrap.clientWidth;
      // Striche proportional mitskalieren (z. B. Drehung des Handys)
      const prevW = Number(canvasRef.current?.style.width.replace('px', '')) || last;
      const f = last / prevW;
      if (f !== 1) strokes.current = strokes.current.map((s) => s.map((p) => ({ x: p.x * f, y: p.y })));
      redraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.current.length === 0) {
      cb.current(null);
      return;
    }
    cb.current(canvas.toDataURL('image/png'));
  };

  const pointFrom = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || active.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    active.current = { id: e.pointerId, points: [p] };
    strokes.current.push(active.current.points);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawStroke(ctx, [p]);
    setEmpty(false);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cur = active.current;
    if (!cur || cur.id !== e.pointerId) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    // zusammengefasste Ereignisse (iPad Pencil, schnelle Bewegungen) für glatte Linien
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    const rect = e.currentTarget.getBoundingClientRect();
    const pts = events.length ? events.map((ev) => ({ x: ev.clientX - rect.left, y: ev.clientY - rect.top })) : [pointFrom(e)];
    for (const p of pts) {
      const prev = cur.points[cur.points.length - 1];
      if (prev && Math.abs(prev.x - p.x) < 0.6 && Math.abs(prev.y - p.y) < 0.6) continue;
      cur.points.push(p);
      if (ctx && prev) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  };

  const end = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cur = active.current;
    if (!cur || cur.id !== e.pointerId) return;
    active.current = null;
    // sauber geglättet neu zeichnen
    redraw();
    exportPng();
  };

  const clear = () => {
    strokes.current = [];
    active.current = null;
    setEmpty(true);
    redraw();
    cb.current(null);
  };

  return (
    <div className={className}>
      <div
        ref={wrapRef}
        style={{ height }}
        className={cn(
          'relative overflow-hidden rounded-2xl border-2 border-dashed bg-white transition-colors',
          invalid ? 'border-red-400 bg-red-50/30' : empty ? 'border-slate-300' : 'border-brand-300',
          disabled && 'opacity-60',
        )}
      >
        {/* Unterschriftslinie */}
        <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-12 flex items-end gap-2 border-b-2 border-slate-300 pb-1 text-xl font-light text-slate-400">
          ×
        </div>
        {signerName ? (
          <p aria-hidden className="pointer-events-none absolute inset-x-6 bottom-5 truncate text-xs font-medium text-slate-400">
            {signerName}
          </p>
        ) : null}
        {empty ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 flex items-center justify-center gap-2 text-[15px] font-medium text-slate-400">
            <PenLine size={18} />
            {hasFinePointer() ? 'Hier unterschreiben' : 'Hier mit dem Finger unterschreiben'}
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={empty ? 'Unterschriftenfeld (leer)' : 'Unterschriftenfeld (unterschrieben)'}
          data-testid="signature-pad"
          className="absolute inset-0 touch-none select-none"
          style={{ cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className={cn('text-sm', empty ? 'text-slate-500' : 'font-medium text-emerald-700')}>{empty ? 'Noch keine Unterschrift' : 'Unterschrift erfasst'}</p>
        <Button variant="ghost" size="sm" icon={Eraser} onClick={clear} disabled={empty || disabled}>
          Löschen
        </Button>
      </div>
    </div>
  );
}
