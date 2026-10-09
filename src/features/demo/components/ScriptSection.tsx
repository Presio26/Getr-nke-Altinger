import { useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Clock3, Info, Laptop, Megaphone, MonitorSmartphone, RotateCcw, Smartphone, type LucideIcon } from 'lucide-react';
import { useBootstrap } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { cn } from '@/lib/cn';
import { Badge, Button, Card } from '@/components/ui';
import { DEMO_ROLES, GUEST_ID, GUIDE_STEPS, TOTAL_MINUTES, type DemoDevice, type GuideStep, type StepLink } from '../data';
import { useOpenAs, useStepProgress } from '../hooks';

const DEVICE_ICON: Record<DemoDevice, LucideIcon> = {
  iphone: Smartphone,
  laptop: Laptop,
  tablet: MonitorSmartphone,
  any: MonitorSmartphone,
  beamer: MonitorSmartphone,
};

function useUserNames(): (id: string | undefined) => string | null {
  const { demoUsers } = useBootstrap();
  return (id) => {
    if (!id) return null;
    if (id === GUEST_ID) return 'Gast';
    return demoUsers.find((u) => u.id === id)?.name ?? DEMO_ROLES.find((r) => r.id === id)?.name ?? null;
  };
}

function StepItem({
  step,
  index,
  done,
  last,
  expanded,
  onToggleDone,
  onToggleExpanded,
  onOpen,
  pendingKey,
  nameOf,
}: {
  step: GuideStep;
  index: number;
  done: boolean;
  last: boolean;
  expanded: boolean;
  onToggleDone: () => void;
  onToggleExpanded: () => void;
  onOpen: (link: StepLink, key: string) => void;
  pendingKey: string | null;
  nameOf: (id: string | undefined) => string | null;
}) {
  const currentUserId = useSession((s) => s.user?.id ?? null);
  const DeviceIcon = DEVICE_ICON[step.device];
  const detailsId = `schritt-${step.id}-details`;
  return (
    <li className="relative flex gap-3.5 sm:gap-5">
      {!last ? (
        <span aria-hidden className={cn('absolute bottom-0 left-[19px] top-12 w-0.5 rounded-full sm:left-[21px]', done ? 'bg-emerald-300' : 'bg-slate-200')} />
      ) : null}
      <button
        type="button"
        onClick={onToggleDone}
        aria-pressed={done}
        aria-label={done ? `Schritt ${index + 1} als offen markieren` : `Schritt ${index + 1} abhaken`}
        className={cn(
          'relative z-[1] mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold tabular-nums transition-[background-color,color,box-shadow] sm:h-11 sm:w-11',
          done
            ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-700'
            : 'bg-white text-brand-700 ring-2 ring-brand-200 hover:bg-brand-50 hover:ring-brand-400',
        )}
      >
        {done ? <Check size={20} strokeWidth={3} aria-hidden /> : index + 1}
      </button>

      <div className={cn('min-w-0 flex-1', last ? 'pb-1' : 'pb-8')}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className={cn('min-w-0 text-base font-semibold leading-snug sm:text-[17px]', done ? 'text-slate-500' : 'text-slate-900')}>{step.title}</h3>
          {done ? (
            <Badge tone="success" icon={Check} className="shrink-0">
              Erledigt
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <DeviceIcon size={14} aria-hidden className="text-slate-400" />
            {step.who}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={14} aria-hidden className="text-slate-400" />
            ca. {step.minutes} Min.
          </span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{step.summary}</p>

        {expanded ? (
          <div id={detailsId} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Klickpfad</p>
              <ol className="space-y-2">
                {step.path.map((p, i) => (
                  <li key={p} className="flex gap-2.5 text-sm leading-snug text-slate-700">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0 pt-px">{p}</span>
                  </li>
                ))}
              </ol>
            </div>
            <figure className="rounded-xl border-l-4 border-accent-400 bg-accent-50 p-4 lg:self-start">
              <figcaption className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent-800">
                <Megaphone size={14} aria-hidden /> Kernbotschaft
              </figcaption>
              <blockquote className="text-sm leading-relaxed text-slate-800">„{step.message}“</blockquote>
            </figure>
            {step.note ? (
              <p className="flex gap-2 rounded-xl bg-sky-50 p-3 text-[13px] leading-relaxed text-sky-900 ring-1 ring-inset ring-sky-200 lg:col-span-2">
                <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-sky-700" />
                <span className="min-w-0">{step.note}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {step.links.map((link, i) => {
            const key = `step:${step.id}:${i}`;
            const name = nameOf(link.as);
            const switches = !!link.as && (link.as === GUEST_ID ? currentUserId !== null : currentUserId !== link.as);
            return (
              <Button
                key={key}
                size="sm"
                variant="outline"
                iconRight={ArrowUpRight}
                loading={pendingKey === key}
                disabled={!!pendingKey && pendingKey !== key}
                onClick={() => onOpen(link, key)}
                title={name ? (switches ? `Meldet als ${name} an und öffnet ${link.to}` : `Öffnet ${link.to} (${name})`) : `Öffnet ${link.to}`}
              >
                {link.label}
              </Button>
            );
          })}
          <Button size="sm" variant="ghost" iconRight={ChevronDown} onClick={onToggleExpanded} aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined} className={cn('[&>svg]:transition-transform', expanded && '[&>svg:last-child]:rotate-180')}>
            {expanded ? 'Weniger' : 'Klickpfad & Botschaft'}
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Drehbuch: Schritte zum Abhaken (lokal gespeichert) mit Direkt-Links, Klickpfad, Kernbotschaft und Hinweis */
export function ScriptSection() {
  const { done, toggle, reset } = useStepProgress();
  const { openAs, pending } = useOpenAs();
  const nameOf = useUserNames();
  const doneSet = new Set(done);
  const doneCount = GUIDE_STEPS.filter((s) => doneSet.has(s.id)).length;
  const currentIndex = GUIDE_STEPS.findIndex((s) => !doneSet.has(s.id));
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const percent = Math.round((doneCount / GUIDE_STEPS.length) * 100);

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="border-b border-slate-100 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="drehbuch-titel" className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
              Drehbuch
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {GUIDE_STEPS.length} Schritte · ca. {TOTAL_MINUTES} Minuten · Haken werden auf diesem Gerät gespeichert
            </p>
          </div>
          {doneCount > 0 ? (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>
              Haken zurücksetzen
            </Button>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={GUIDE_STEPS.length}
            aria-valuenow={doneCount}
            aria-label="Fortschritt im Drehbuch"
          >
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold text-slate-700 tabular-nums">
            {doneCount} von {GUIDE_STEPS.length}
          </span>
        </div>
      </div>

      <ol className="px-4 py-6 sm:px-6" aria-labelledby="drehbuch-titel">
        {GUIDE_STEPS.map((step, i) => (
          <StepItem
            key={step.id}
            step={step}
            index={i}
            done={doneSet.has(step.id)}
            last={i === GUIDE_STEPS.length - 1}
            expanded={overrides[step.id] ?? i === currentIndex}
            onToggleDone={() => toggle(step.id)}
            onToggleExpanded={() => setOverrides((o) => ({ ...o, [step.id]: !(o[step.id] ?? i === currentIndex) }))}
            onOpen={(link, key) => void openAs(link.as, key, { to: link.to })}
            pendingKey={pending}
            nameOf={nameOf}
          />
        ))}
      </ol>

      {doneCount === GUIDE_STEPS.length ? (
        <div className="border-t border-emerald-100 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800 sm:px-6">
          Alle Schritte gezeigt – Zeit für Fragen. Tipp: Vor der nächsten Vorführung die Demo-Daten zurücksetzen.
        </div>
      ) : null}
    </Card>
  );
}
