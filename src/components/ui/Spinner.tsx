import { cn } from '@/lib/cn';

export interface SpinnerProps {
  size?: number;
  className?: string;
  /** Screenreader-Text */
  label?: string;
}

export function Spinner({ size = 20, className, label = 'Wird geladen' }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label}
      className={cn('animate-spin text-brand-600', className)}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export interface SkeletonProps {
  className?: string;
}

/** Platzhalter während des Ladens, z. B. <Skeleton className="h-5 w-40" /> */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn('skeleton-shimmer rounded-lg', className)} />;
}
