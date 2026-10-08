# Getränke Altinger App – Hinweise für die Entwicklung

- Verbindliches Briefing: `docs/ARCHITECTURE.md` (Stack, Modi, Modulgrenzen, Routen, Design-System, UI-Kit-API).
- Vertrag: `shared/types.ts` (Domänenmodell) und `shared/api.ts` (Api-Interface). Nur additiv ändern.
- Geld immer in Cent (Integer); Anzeige über `formatEuro` aus `shared/format.ts`.
- Datum/Uhrzeit-Logik immer über `shared/time.ts` (Zeitzone Europe/Berlin).
- `shared/` und `server/`: nur relative Imports. `src/`: Aliase `@/…` und `@shared/…`.
- UI-Texte deutsch, Sie-Form, echte Umlaute. Mobile first (iPhone 390×844) und Desktop (1440×900).
- Prüfen vor Abgabe: `npm run typecheck`, `npm test`, bei UI-Änderungen `npm run build`.
- App starten: `npm run dev` (Server :8787 + Vite :5173). Produktion: `npm run build && npm start` (Port 8787, liefert `dist/` aus).
- Playwright-Chromium liegt unter `/opt/pw-browsers` (`playwright install` NICHT ausführen).
- Keine Git-Commits durch Sub-Agenten, außer der Auftrag sagt es ausdrücklich.
