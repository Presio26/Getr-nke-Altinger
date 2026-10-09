/**
 * Marker-Grafiken als HTML/SVG-Strings für Leaflet-divIcons (keine externen Bilder).
 */
import L from 'leaflet';
import type { StopStatus } from '@shared/types';
import { signetGlyph } from '@/components/brand/signet';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Pin-Form (Tropfen) mit Inhalt */
function pinSvg(fill: string, inner: string, w = 44, h = 52): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 44 52">` +
    `<path d="M22 51c-1.2 0-2.2-.6-2.9-1.6L9.6 36.3A18.6 18.6 0 0 1 3 22C3 11.5 11.5 3 22 3s19 8.5 19 19c0 5.6-2.5 10.7-6.6 14.3l-9.5 13.1c-.7 1-1.7 1.6-2.9 1.6z" fill="${fill}" stroke="#fff" stroke-width="2.5"/>` +
    inner +
    `</svg>`
  );
}

export function storeIcon(): L.DivIcon {
  const inner = `<g transform="translate(9.5 9) scale(0.39)">` + `<rect width="64" height="64" rx="16" fill="#194782"/>` + signetGlyph() + `</g>`;
  return L.divIcon({
    className: 'alt-marker',
    html: `<div class="alt-store">${pinSvg('#194782', inner)}</div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 51],
    tooltipAnchor: [0, -46],
    popupAnchor: [0, -46],
  });
}

const HOUSE =
  '<path d="M14 21.5 22 14.5l8 7V30a1.2 1.2 0 0 1-1.2 1.2h-4.6v-5.6h-4.4v5.6h-4.6A1.2 1.2 0 0 1 14 30z" fill="#fff"/>';

export function homeIcon(color = '#f2a900'): L.DivIcon {
  return L.divIcon({
    className: 'alt-marker',
    html: `<div class="alt-home">${pinSvg(color, HOUSE, 40, 48)}</div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 47],
    tooltipAnchor: [0, -42],
    popupAnchor: [0, -42],
  });
}

const TRUCK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 6.5h10.5v9H3z" fill="currentColor" fill-opacity=".25"/><path d="M13.5 9.5h4l3 3.2v2.8h-7z"/><circle cx="7" cy="17.5" r="1.8" fill="currentColor"/><circle cx="17" cy="17.5" r="1.8" fill="currentColor"/>' +
  '</svg>';

const ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 16 12"><path d="M8 0 16 12 8 8.5 0 12z" fill="VAR" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export function driverIcon(color: string, label?: string, pulse = true): L.DivIcon {
  const c = escapeHtml(color);
  return L.divIcon({
    className: 'alt-marker',
    html:
      `<div class="alt-driver" style="--drv-color:${c}">` +
      (pulse ? '<span class="alt-driver__pulse"></span>' : '') +
      `<span class="alt-driver__heading">${ARROW.replace('VAR', c)}</span>` +
      `<span class="alt-driver__body">${TRUCK}</span>` +
      (label ? `<span class="alt-driver__label">${escapeHtml(label)}</span>` : '') +
      `</div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    tooltipAnchor: [0, -26],
    popupAnchor: [0, -26],
  });
}

export const STOP_COLORS: Record<StopStatus, string> = {
  pending: '#1d58a0',
  arrived: '#d97706',
  delivered: '#059669',
  failed: '#dc2626',
};

const CHECK = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17l9-10"/></svg>';
const CROSS = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function stopIcon(index: number, status: StopStatus = 'pending', current = false): L.DivIcon {
  const color = STOP_COLORS[status] ?? STOP_COLORS.pending;
  const content = status === 'delivered' ? CHECK : status === 'failed' ? CROSS : String(index);
  return L.divIcon({
    className: 'alt-marker',
    html: `<div class="alt-stop${current ? ' alt-stop--current' : ''}" style="background:${color}">${content}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    tooltipAnchor: [0, -18],
    popupAnchor: [0, -18],
  });
}
