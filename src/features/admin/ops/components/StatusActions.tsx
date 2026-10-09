/**
 * Statusaktionen einer Bestellung gemäß erlaubten Übergängen (ORDER_TRANSITIONS/canTransition),
 * inkl. Stornieren bzw. „Zustellung fehlgeschlagen“ mit Begründung.
 */
import { useState } from 'react';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import type { Order, OrderStatus, Tour } from '@shared/types';
import { orderStatusLabel } from '@shared/format';
import { Button, Modal, Textarea, type ButtonVariant } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useOrderStatus } from '../api';
import { allowedTransitions, primaryStep, stepLabel, type StepAction } from '../model';

const CANCEL_REASONS = ['Auf Wunsch des Kunden', 'Artikel nicht lieferbar', 'Doppelte Bestellung', 'Kunde nicht erreichbar'];
const FAIL_REASONS = ['Kunde nicht angetroffen', 'Adresse nicht auffindbar', 'Annahme verweigert', 'Zufahrt nicht möglich'];

function variantFor(step: StepAction['tone']): ButtonVariant {
  if (step === 'success') return 'success';
  if (step === 'danger') return 'danger';
  if (step === 'neutral') return 'outline';
  return 'primary';
}

export function ReasonModal({
  open,
  onClose,
  order,
  kind,
  loading,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
  kind: 'cancelled' | 'failed';
  loading?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const presets = kind === 'cancelled' ? CANCEL_REASONS : FAIL_REASONS;
  const submit = () => {
    const r = reason.trim();
    if (r.length < 3) {
      setError('Bitte geben Sie einen kurzen Grund an – er wird dem Kunden mitgeteilt.');
      return;
    }
    onConfirm(r);
  };
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      size="sm"
      title={kind === 'cancelled' ? `${order.number} stornieren` : 'Zustellung fehlgeschlagen'}
      description={
        kind === 'cancelled'
          ? 'Die Bestellung wird storniert, reservierte Ware geht zurück in den Bestand. Der Kunde wird benachrichtigt.'
          : 'Die Bestellung wird als nicht zustellbar markiert. Sie können sie danach erneut verladen oder stornieren.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button variant="danger" icon={XCircle} loading={loading} onClick={submit}>
            {kind === 'cancelled' ? 'Stornieren' : 'Als fehlgeschlagen markieren'}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm font-medium text-slate-700">Häufige Gründe</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setReason(p);
              setError(null);
            }}
            className={cn(
              'min-h-9 rounded-full border px-3 text-sm font-medium transition-colors',
              reason === p ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <Textarea
        label="Grund"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
        }}
        maxLength={300}
        placeholder={kind === 'cancelled' ? 'z. B. Kunde hat telefonisch storniert' : 'z. B. Niemand zu Hause, Nachbar nicht erreichbar'}
        error={error}
        rows={3}
      />
    </Modal>
  );
}

/** Ein-Klick-Schaltfläche zum nächsten Status (Board-Karten, Listen) */
export function QuickStepButton({
  order,
  className,
  size = 'sm',
  block = false,
  arrow = true,
}: {
  order: Order;
  className?: string;
  size?: 'sm' | 'md';
  block?: boolean;
  arrow?: boolean;
}) {
  const step = primaryStep(order);
  const mutation = useOrderStatus();
  if (!step) return null;
  const busy = mutation.isPending;
  return (
    <Button
      size={size}
      variant={variantFor(step.tone)}
      iconRight={busy || !arrow ? undefined : ArrowRight}
      loading={busy}
      block={block}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate({ order, to: step.to });
      }}
    >
      {step.label}
    </Button>
  );
}

export interface StatusActionsProps {
  order: Order;
  tour?: Pick<Tour, 'status'> | null;
  className?: string;
  /** volle Breite (Seitenleiste) */
  stacked?: boolean;
}

/** Alle erlaubten Statusaktionen: Hauptaktion groß, weitere als Umriss, Storno abgesetzt */
export function StatusActions({ order, tour, className, stacked = false }: StatusActionsProps) {
  const mutation = useOrderStatus();
  const [reasonFor, setReasonFor] = useState<'cancelled' | 'failed' | null>(null);
  const [pendingTo, setPendingTo] = useState<OrderStatus | null>(null);
  const allowed = allowedTransitions(order, tour);
  const primary = primaryStep(order);
  const primaryTo = primary && allowed.includes(primary.to) ? primary.to : null;
  const others = allowed.filter((s) => s !== primaryTo && s !== 'cancelled' && s !== 'failed');
  const canCancel = allowed.includes('cancelled');
  const canFail = allowed.includes('failed');

  const run = (to: OrderStatus, note?: string) => {
    setPendingTo(to);
    mutation.mutate(
      { order, to, note },
      {
        onSettled: () => setPendingTo(null),
        onSuccess: () => setReasonFor(null),
      },
    );
  };

  if (!allowed.length) {
    return (
      <p className={cn('flex items-center gap-2 text-sm text-slate-500', className)}>
        <CheckCircle2 size={16} aria-hidden className="text-emerald-600" />
        Keine weiteren Statusänderungen möglich ({orderStatusLabel(order.status, order.fulfillment)}).
      </p>
    );
  }

  return (
    <div className={cn('flex flex-wrap gap-2', stacked && 'flex-col items-stretch', className)}>
      {primaryTo && primary ? (
        <Button
          variant={variantFor(primary.tone)}
          icon={stepLabel(order, primaryTo).icon}
          loading={pendingTo === primaryTo}
          disabled={mutation.isPending}
          onClick={() => run(primaryTo)}
          block={stacked}
        >
          {stepLabel(order, primaryTo).label}
        </Button>
      ) : null}
      {others.map((to) => {
        const s = stepLabel(order, to);
        return (
          <Button
            key={to}
            variant={primaryTo ? 'outline' : 'primary'}
            icon={s.icon}
            loading={pendingTo === to}
            disabled={mutation.isPending}
            onClick={() => run(to)}
            block={stacked}
          >
            {s.label}
          </Button>
        );
      })}
      {canFail ? (
        <Button variant="outline" icon={stepLabel(order, 'failed').icon} disabled={mutation.isPending} onClick={() => setReasonFor('failed')} block={stacked}>
          Zustellung fehlgeschlagen
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          variant="ghost"
          icon={XCircle}
          disabled={mutation.isPending}
          onClick={() => setReasonFor('cancelled')}
          className="text-red-700 hover:bg-red-50 hover:text-red-800"
          block={stacked}
        >
          Stornieren
        </Button>
      ) : null}
      {reasonFor ? (
        <ReasonModal
          open
          order={order}
          kind={reasonFor}
          loading={mutation.isPending}
          onClose={() => setReasonFor(null)}
          onConfirm={(reason) => run(reasonFor, reason)}
        />
      ) : null}
    </div>
  );
}
