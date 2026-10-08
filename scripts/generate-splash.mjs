#!/usr/bin/env node
/**
 * Erzeugt iOS-Startbilder (apple-touch-startup-image) und – optional – die Manifest-Screenshots der PWA.
 *
 *   node scripts/generate-splash.mjs                          # nur Startbilder
 *   node scripts/generate-splash.mjs --screenshots http://localhost:5173   # zusätzlich Screenshots der laufenden App
 *
 * Ergebnis (public/):
 *   splash/<breite>x<höhe>.png   – Startbild je iPhone/iPad-Größe (hochkant), Aussehen wie der Ladebildschirm
 *                                  in index.html (heller Hintergrund, Signet, „Getränke Altinger“)
 *   screenshots/narrow-*.jpg     – 390 × 844 (Handy) für „Richer Install UI“
 *   screenshots/wide-*.jpg       – 1440 × 900 (Desktop)
 *
 * Die <link rel="apple-touch-startup-image">-Einträge in index.html entsprechen der Liste DEVICES.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

/** CSS-Breite × -Höhe @ Pixeldichte (hochkant) */
export const DEVICES = [
  [375, 667, 2], // iPhone SE / 8
  [414, 736, 3], // iPhone 8 Plus
  [375, 812, 3], // iPhone X/XS/11 Pro/12 mini/13 mini
  [414, 896, 2], // iPhone XR/11
  [414, 896, 3], // iPhone XS Max/11 Pro Max
  [390, 844, 3], // iPhone 12/13/14
  [428, 926, 3], // iPhone 12/13 Pro Max, 14 Plus
  [393, 852, 3], // iPhone 14 Pro/15/15 Pro/16
  [430, 932, 3], // iPhone 14 Pro Max/15 Plus/15 Pro Max/16 Plus
  [402, 874, 3], // iPhone 16 Pro
  [440, 956, 3], // iPhone 16 Pro Max
  [810, 1080, 2], // iPad 10,2"
  [820, 1180, 2], // iPad Air / iPad 10. Gen.
  [834, 1194, 2], // iPad Pro 11"
  [1024, 1366, 2], // iPad Pro 12,9"
];

const ICON = fs.readFileSync(path.join(PUBLIC, 'icons', 'icon.svg'), 'utf8');

async function launchBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (err) {
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

function splashHtml(width) {
  const logo = Math.round(Math.min(120, width * 0.24));
  return `<!doctype html><html><head><style>
    html,body{margin:0;height:100%;background:#f8fafc}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(logo * 0.3)}px;
      font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',Roboto,sans-serif;color:#64748b}
    svg{width:${logo}px;height:${logo}px;filter:drop-shadow(0 8px 20px rgba(22,51,90,.18))}
    p{margin:0;font-size:${Math.round(logo * 0.19)}px;font-weight:600;letter-spacing:.02em}
  </style></head><body>${ICON.replace('width="512" height="512"', '')}<p>Getränke Altinger</p></body></html>`;
}

async function splash(browser) {
  const dir = path.join(PUBLIC, 'splash');
  fs.mkdirSync(dir, { recursive: true });
  for (const [w, h, dpr] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await page.setContent(splashHtml(w));
    const file = path.join(dir, `${w * dpr}x${h * dpr}.png`);
    await page.screenshot({ path: file });
    await ctx.close();
    console.log('  ', path.relative(ROOT, file));
  }
}

async function screenshots(browser, base) {
  const dir = path.join(PUBLIC, 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const shots = [
    { name: 'narrow-start', path: '/', viewport: { width: 390, height: 844 }, mobile: true },
    { name: 'narrow-sortiment', path: '/sortiment', viewport: { width: 390, height: 844 }, mobile: true },
    { name: 'wide-start', path: '/', viewport: { width: 1440, height: 900 }, mobile: false },
  ];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile, locale: 'de-DE' });
    // Demo-Pille/Install-Hinweis sollen auf den Bildern nicht erscheinen
    await ctx.addInitScript(() => {
      localStorage.setItem('altinger.ui', JSON.stringify({ state: { demoPill: 'hide', adminSidebarCollapsed: false, installDismissedAt: Date.now(), dismissedAnnouncement: null }, version: 2 }));
    });
    const page = await ctx.newPage();
    await page.goto(base + s.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const file = path.join(dir, `${s.name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 78 });
    await ctx.close();
    console.log('  ', path.relative(ROOT, file));
  }
}

const browser = await launchBrowser();
try {
  console.log('Startbilder:');
  await splash(browser);
  const i = process.argv.indexOf('--screenshots');
  if (i !== -1) {
    const base = (process.argv[i + 1] || 'http://localhost:5173').replace(/\/+$/, '');
    console.log(`Screenshots von ${base}:`);
    await screenshots(browser, base);
  }
} finally {
  await browser.close();
}
