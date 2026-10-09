/**
 * Versionsnummer der App – einzige Quelle ist package.json (per Vite `define` eingesetzt,
 * siehe vite.config.ts). /api/health meldet dieselbe Nummer.
 */
const injected: unknown = import.meta.env.VITE_APP_VERSION;

export const APP_VERSION: string = typeof injected === 'string' && injected ? injected : '0.0.0';
