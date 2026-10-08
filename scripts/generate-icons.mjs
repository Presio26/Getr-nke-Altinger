#!/usr/bin/env node
/**
 * Erzeugt die App-Icons der PWA aus dem Altinger-Signet (Getränkekasten mit drei Flaschen).
 *
 *   node scripts/generate-icons.mjs
 *
 * Ergebnis (public/):
 *   favicon.svg               – Signet als SVG (Browser-Tab)
 *   icons/icon.svg            – Signet als SVG (Manifest, "any")
 *   icons/icon-192.png        – 192 × 192, abgerundet, transparent
 *   icons/icon-512.png        – 512 × 512, abgerundet, transparent
 *   icons/maskable-512.png    – 512 × 512, vollflächig, Motiv in der Safe-Zone (Android)
 *   icons/apple-touch-icon.png – 180 × 180, vollflächig ohne Transparenz (iOS rundet selbst)
 *
 * Die Geometrie entspricht src/components/brand/signet.ts – bei Änderungen bitte beide anpassen.
 * Rendering mit Playwright/Chromium (PLAYWRIGHT_BROWSERS_PATH bzw. /opt/pw-browsers).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const ICONS = path.join(PUBLIC, 'icons');

const C = { blue: '#1d58a0', blueDark: '#194782', navy: '#16335a', gold: '#f2a900', glass: '#b9d3f1' };

function bottlePath(cx, top) {
  return [
    `M${cx - 3} ${top + 4}`,
    `L${cx - 3} ${top + 11.5}`,
    `C${cx - 3} ${top + 14.5} ${cx - 5.6} ${top + 15.5} ${cx - 5.6} ${top + 19}`,
    `L${cx - 5.6} 42`,
    `L${cx + 5.6} 42`,
    `L${cx + 5.6} ${top + 19}`,
    `C${cx + 5.6} ${top + 15.5} ${cx + 3} ${top + 14.5} ${cx + 3} ${top + 11.5}`,
    `L${cx + 3} ${top + 4}`,
    'Z',
  ].join(' ');
}

function glyph() {
  const bottles = [
    [20.5, 11],
    [32, 7.5],
    [43.5, 11],
  ]
    .map(
      ([cx, top]) =>
        `<path d="${bottlePath(cx, top)}" fill="${C.glass}"/>` +
        `<rect x="${cx - 1.6}" y="${top + 6}" width="1.5" height="9" rx=".75" fill="#fff" opacity=".55"/>` +
        `<rect x="${cx - 3.7}" y="${top + 0.6}" width="7.4" height="4" rx="1.3" fill="${C.gold}"/>`,
    )
    .join('');
  return (
    bottles +
    `<path d="M11 34.5a2 2 0 0 1 2-2h38a2 2 0 0 1 2 2V49a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6z" fill="#fff"/>` +
    `<rect x="23.5" y="37" width="17" height="5" rx="2.5" fill="${C.blueDark}"/>` +
    `<rect x="16" y="46.5" width="32" height="2" rx="1" fill="${C.blueDark}" opacity=".18"/>`
  );
}

const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient></defs>`;

/** abgerundetes Signet (transparente Ecken) */
function roundedSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${defs}<rect width="64" height="64" rx="16" fill="url(#g)"/>${glyph()}</svg>`;
}

/** vollflächig, Motiv skaliert (Safe-Zone für maskable / iOS) */
function fullBleedSvg(size, scale) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${defs}` +
    `<rect width="64" height="64" fill="url(#g)"/>` +
    `<g transform="translate(32 31.5) scale(${scale}) translate(-32 -31.25)">${glyph()}</g></svg>`
  );
}

async function launchBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (err) {
    // Fallback: Chromium aus /opt/pw-browsers direkt verwenden
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const candidates = fs.existsSync(base)
      ? fs
          .readdirSync(base)
          .filter((d) => /^chromium(-\d+)?$/.test(d))
          .map((d) => path.join(base, d, 'chrome-linux', 'chrome'))
          .filter((p) => fs.existsSync(p))
      : [];
    if (!candidates.length) throw err;
    return chromium.launch({ executablePath: candidates[0] });
  }
}

async function render(page, svg, size, file, transparent) {
  const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${transparent ? 'transparent' : '#16335a'}}svg{display:block}</style></head><body>${svg}</body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`✓ ${path.relative(ROOT, file)} (${size}×${size})`);
}

async function main() {
  fs.mkdirSync(ICONS, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), roundedSvg(64));
  fs.writeFileSync(path.join(ICONS, 'icon.svg'), roundedSvg(512));
  console.log('✓ public/favicon.svg, public/icons/icon.svg');

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await render(page, roundedSvg(192), 192, path.join(ICONS, 'icon-192.png'), true);
    await render(page, roundedSvg(512), 512, path.join(ICONS, 'icon-512.png'), true);
    await render(page, fullBleedSvg(512, 0.76), 512, path.join(ICONS, 'maskable-512.png'), false);
    await render(page, fullBleedSvg(180, 0.84), 180, path.join(ICONS, 'apple-touch-icon.png'), false);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Icons konnten nicht erzeugt werden:', err);
  process.exit(1);
});
