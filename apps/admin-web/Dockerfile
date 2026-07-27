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

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S noctura && adduser -S -G noctura noctura
WORKDIR /app
ENV NODE_ENV=production
# Der komplette standalone-Baum wird en bloc kopiert statt einzelner
# Unterpfade: outputFileTracingRoot verschiebt server.js auf
# apps/admin-web/server.js *innerhalb* von .next/standalone, mit
# node_modules an der fuer den Tracer passenden Stelle. Beides an der
# erwarteten Verschachtelung zu kopieren ist robuster als zu raten, welche
# Interna Next intern anlegt.
COPY --from=build /repo/apps/admin-web/.next/standalone ./
COPY --from=build /repo/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=build /repo/apps/admin-web/public ./apps/admin-web/public
USER noctura
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/admin-web/server.js"]
