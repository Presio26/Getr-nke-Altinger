# syntax=docker/dockerfile:1
#
# Getränke Altinger – Produktions-Image (Server + gebaute Oberfläche in einem Container)
#
#   docker build -t getraenke-altinger .
#   docker run -d -p 8787:8787 -v altinger-data:/app/data --name altinger getraenke-altinger
#
# Der Server wird mit tsx direkt aus TypeScript gestartet (tsx ist eine Laufzeit-Abhängigkeit),
# die Oberfläche wird in der Build-Stufe mit Vite gebaut und aus dist/ ausgeliefert.
# Die Oberfläche läuft fest im Server-Modus (VITE_API_MODE=remote): Server und App liegen zusammen,
# ein stiller Wechsel auf lokale Browser-Daten ist ausgeschlossen.
# HTTPS (Pflicht für GPS und Kamera auf dem iPhone) übernimmt der Hoster bzw. ein Reverse-Proxy – siehe docs/DEPLOYMENT.md.

# ───────────────────────────── Build ─────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Abhängigkeiten zuerst (besseres Layer-Caching); devDependencies werden für den Build gebraucht
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Build-Zeit-Konfiguration der Oberfläche (Vite liest sie beim Build):
#   VITE_API_MODE  remote (Standard für dieses Image) – nur für Sonderfälle überschreiben (--build-arg)
#   VITE_API_URL   leer = gleiche Herkunft (Server und Oberfläche im selben Container)
ARG VITE_API_MODE=remote
ARG VITE_API_URL=
ENV VITE_API_MODE=${VITE_API_MODE} \
    VITE_API_URL=${VITE_API_URL}
# Typprüfung + Vite-Build → dist/
RUN npm run build

# ───────────────────────────── Laufzeit ─────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_FILE=/app/data/db.json \
    DEMO_MODE=true \
    RESEED_STALE=true

# nur Produktionsabhängigkeiten (express, socket.io, tsx …)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared

# Datenverzeichnis für den nicht privilegierten Nutzer "node"
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 8787
VOLUME ["/app/data"]

# Healthcheck: /api/health antwortet {"ok":true,"mode":"remote",…}; start-period deckt den ersten Start (Demo-Daten erzeugen) ab
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

# entspricht "npm start", aber Node direkt als Hauptprozess (SIGTERM → Daten werden gespeichert)
CMD ["node", "--import", "tsx", "server/index.ts"]
