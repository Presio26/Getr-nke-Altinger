import { NavLink } from 'react-router-dom';
import { CalendarClock, FileText, LayoutDashboard, MapPin, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/business', label: 'Übersicht', icon: LayoutDashboard, end: true },
  { to: '/business/schnellbestellung', label: 'Schnellbestellung', icon: Zap },
  { to: '/business/rechnungen', label: 'Rechnungen', icon: FileText },
  { to: '/business/dauerauftraege', label: 'Daueraufträge', icon: CalendarClock },
  { to: '/business/standorte', label: 'Standorte & Kostenstellen', icon: MapPin },
];

/** Bereichsnavigation des Geschäftskunden-Portals (mobil horizontal scrollbar) */
export function BusinessNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Geschäftskunden-Portal" className={cn('no-print -mx-4 mb-5 sm:mx-0 sm:mb-7', className)}>
      <ul className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:flex-wrap sm:px-0">
        {ITEMS.map((item) => (
          <li key={item.to} className="shrink-0">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors',
                  isActive
                    ? 'bg-brand-700 text-white ring-brand-700 shadow-sm shadow-brand-900/10'
                    : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <item.icon size={16} aria-hidden />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
