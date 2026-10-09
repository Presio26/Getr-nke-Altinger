import { FileSignature, Recycle } from 'lucide-react';
import type { DepositType, EmptiesLine, Order } from '@shared/types';
import { formatDateTime, formatEuro } from '@shared/format';
import { Card, CardHeader } from '@/components/ui';
import { cn } from '@/lib/cn';

function typeName(types: DepositType[], id: string): string {
  return types.find((t) => t.id === id)?.shortName ?? id;
}

/** Angekündigtes vs. tatsächlich mitgenommenes Leergut */
export function EmptiesCard({ order, depositTypes }: { order: Order; depositTypes: DepositType[] }) {
  const announced = order.emptiesReturn;
  const collected: EmptiesLine[] | undefined = order.proof?.emptiesCollected;
  const ids = Array.from(new Set([...announced.map((l) => l.depositTypeId), ...(collected ?? []).map((l) => l.depositTypeId)]));
  if (!ids.length) return null;
  const qty = (list: EmptiesLine[] | undefined, id: string) => list?.find((l) => l.depositTypeId === id)?.qty ?? 0;
  const amount = (id: string) => depositTypes.find((t) => t.id === id)?.amount ?? 0;
  const done = !!collected;
  return (
    <Card>
      <CardHeader
        title="Leergut-Rückgabe"
        subtitle={done ? 'Angekündigt und tatsächlich mitgenommen' : order.fulfillment === 'pickup' ? 'Bringen Sie Ihr Leergut zur Abholung mit.' : 'Bitte stellen Sie das Leergut bereit – der Fahrer nimmt es mit.'}
        icon={Recycle}
      />
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
        {ids.map((id) => {
          const a = qty(announced, id);
          const c = qty(collected, id);
          return (
            <li key={id} className="flex items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-slate-800">{typeName(depositTypes, id)}</span>
              <span className="shrink-0 text-right text-sm leading-snug">
                <span className="block tabular-nums text-slate-600">{a}× angekündigt</span>
                {done ? (
                  <span className={cn('block font-semibold tabular-nums', c === a ? 'text-emerald-700' : 'text-amber-700')}>{c}× mitgenommen</span>
                ) : (
                  <span className="block font-semibold tabular-nums text-emerald-700">{formatEuro(-a * amount(id))}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {done ? (
        <p className="mt-3 text-sm text-slate-600">
          Gutgeschrieben: <span className="font-semibold text-emerald-700">{formatEuro(order.totals.depositRefund)}</span>
          {ids.some((id) => qty(announced, id) !== qty(collected, id)) ? ' – die Gutschrift wurde an das tatsächlich mitgenommene Leergut angepasst.' : ''}
        </p>
      ) : null}
    </Card>
  );
}

/** Zustellnachweis: Empfänger, Unterschrift, Foto, kassierter Betrag */
export function ProofCard({ order }: { order: Order }) {
  const proof = order.proof;
  if (!proof) return null;
  return (
    <Card>
      <CardHeader title="Zustellnachweis" subtitle={`Zugestellt am ${formatDateTime(proof.at)} Uhr`} icon={FileSignature} />
      <dl className="grid gap-3 text-[15px] sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 px-3.5 py-3">
          <dt className="text-[13px] font-medium text-slate-500">Entgegengenommen von</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{proof.receivedBy || '–'}</dd>
        </div>
        {proof.amountCollected !== undefined ? (
          <div className="rounded-xl bg-slate-50 px-3.5 py-3">
            <dt className="text-[13px] font-medium text-slate-500">Kassiert</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{formatEuro(proof.amountCollected)}</dd>
          </div>
        ) : null}
      </dl>
      {proof.signatureDataUrl || proof.photoDataUrl ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {proof.signatureDataUrl ? (
            <figure className="rounded-xl border border-slate-200 bg-white p-3">
              <img src={proof.signatureDataUrl} alt="Unterschrift des Empfängers" className="h-28 w-full object-contain" />
              <figcaption className="mt-2 border-t border-dashed border-slate-200 pt-2 text-center text-xs text-slate-500">Unterschrift</figcaption>
            </figure>
          ) : null}
          {proof.photoDataUrl ? (
            <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <img src={proof.photoDataUrl} alt="Foto vom Abstellort" className="h-40 w-full object-cover" />
              <figcaption className="px-3 py-2 text-center text-xs text-slate-500">Foto vom Abstellort</figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}
      {proof.note && proof.note !== 'Demo-Simulation' ? <p className="mt-3 text-sm text-slate-600">Notiz des Fahrers: {proof.note}</p> : null}
    </Card>
  );
}
