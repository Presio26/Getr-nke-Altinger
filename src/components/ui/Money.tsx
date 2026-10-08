import { formatEuro } from '@shared/format';
import { cn } from '@/lib/cn';

export interface MoneyProps {
  /** Betrag in Cent */
  cents: number;
  className?: string;
  /** durchgestrichen (z. B. regulärer Preis bei Angebot) */
  strike?: boolean;
  /** Vorzeichen auch bei positiven Beträgen ("+3,10 €") */
  showSign?: boolean;
}

export function Money({ cents, className, strike = false, showSign = false }: MoneyProps) {
  const text = formatEuro(cents, { sign: showSign });
  if (strike) {
    return (
      <s className={cn('whitespace-nowrap tabular-nums text-slate-400 decoration-slate-400/80', className)}>
        <span className="sr-only">statt </span>
        {text}
      </s>
    );
  }
  return <span className={cn('whitespace-nowrap tabular-nums', className)}>{text}</span>;
}
