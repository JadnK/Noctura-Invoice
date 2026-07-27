# Baut aus dem Repo-Wurzelkontext (siehe docker-compose.yml), nicht aus
# apps/admin-web allein - app/globals.css importiert
# ../../../packages/ui/src/tokens.css, drei Ebenen aus dem eigenen App-
# Ordner heraus bis zur Monorepo-Wurzel. Ein auf apps/admin-web
# beschraenkter Kontext kann packages/ui gar nicht erreichen, unabhaengig
# vom relativen Pfad.
#
# Die Verzeichnistiefe im Container spiegelt deshalb absichtlich die echte
# Repo-Struktur (/repo/apps/admin-web, /repo/packages/ui), damit Webpacks
# relative CSS-Aufloesung unveraendert funktioniert - kein Sonderfall fuer
# Docker, derselbe Pfad wie im echten Checkout.
FROM node:22-alpine AS build
WORKDIR /repo/apps/admin-web
COPY apps/admin-web/package.json apps/admin-web/package-lock.json* ./
# npm install statt npm ci: kein package-lock.json im Repository (siehe
# apps/license-api/Dockerfile fuer die ausfuehrliche Begruendung).
RUN npm install --ignore-scripts

WORKDIR /repo
COPY packages/ui ./packages/ui
COPY apps/admin-web ./apps/admin-web

WORKDIR /repo/apps/admin-web
# next.config.js wertet rewrites() beim Bauen aus (output: standalone
# backt sie in den Build ein), nicht erst zur Laufzeit. Fester Wert, kein
# Geheimnis: der interne Docker-Netzwerkname aendert sich nie.
ENV API_INTERNAL_URL=http://license-api:3000
RUN npm run build
# Diagnose fuer den Fall, dass die Annahme ueber die Struktur von
# .next/standalone erneut nicht stimmt: zeigt beim Bauen unmittelbar, wo
# server.js tatsaechlich liegt, statt es beim naechsten Fehlschlag aus dem
# Laufzeit-Fehler zurueckschliessen zu muessen.
RUN echo "--- Inhalt von .next/standalone ---" && find .next/standalone -maxdepth 3

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S noctura && adduser -S -G noctura noctura
WORKDIR /app
ENV NODE_ENV=production
# Flache Struktur: ohne outputFileTracingRoot behandelt Next admin-web als
# eigenstaendiges Projekt (kein Lockfile im Repository, das eine hoehere
# Wurzel nahelegen wuerde), server.js liegt deshalb direkt im Wurzel-
# verzeichnis von .next/standalone, nicht unter apps/admin-web/ verschachtelt.
COPY --from=build /repo/apps/admin-web/.next/standalone ./
COPY --from=build /repo/apps/admin-web/.next/static ./.next/static
COPY --from=build /repo/apps/admin-web/public ./public
USER noctura
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
