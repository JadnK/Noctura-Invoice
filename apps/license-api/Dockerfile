# Mehrstufiger Build. Das Laufzeit-Image enthaelt keine Build-Werkzeuge,
# laeuft als nicht privilegierter Nutzer und schreibt nur in /data.
#
# npm install statt npm ci: der Docker-Build-Kontext ist nur dieser Ordner,
# isoliert vom Rest des Monorepos. Es gibt kein eingechecktes
# package-lock.json (weder hier noch an der Wurzel) - npm ci verlangt
# zwingend eines und bricht sonst sofort ab. license-api haengt von keinem
# internen @noctura/*-Workspace-Paket ab, deshalb reicht die isolierte
# package.json hier vollstaendig aus.
#
# Kein tsc-Kompilierschritt: der Quelltext importiert durchgehend mit
# expliziten .ts-Endungen (node --experimental-strip-types, siehe
# package.json "dev"/"test"). TypeScript verweigert das Emittieren von
# JavaScript, solange solche Importe bestehen (allowImportingTsExtensions
# erzwingt noEmit). Produktion laeuft deshalb genauso wie Entwicklung: der
# Quelltext direkt, ohne Zwischenschritt.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
# Prisma generiert die Client-Engine passend zur libssl-Version des Images.
# Ohne openssl installiert erkennt Prisma sie nicht und raet - das kann zu
# einer Engine-Binaerdatei fuehren, die zur Laufzeit nicht laedt.
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts
COPY . .
RUN npx prisma generate

FROM node:22-alpine AS runtime
# Dieselbe Begruendung wie in der build-Stufe: die generierte Prisma-Engine
# braucht libssl auch zur Laufzeit, nicht nur beim Erzeugen.
RUN apk add --no-cache openssl tini && addgroup -S noctura && adduser -S -G noctura noctura
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# Beim Bauen (schreibbares Dateisystem) laedt "npx prisma generate" die
# Engine-Binaerdateien nach node_modules/@prisma/engines herunter. Zur
# Laufzeit ist der Container read-only (docker-compose.yml); ohne diese
# Zeile fehlten die Engines dort, und "prisma migrate deploy" versuchte sie
# beim Containerstart nachzuladen - was auf einem read-only-Dateisystem
# fehlschlaegt: "Can't write to /app/node_modules/@prisma/engines".
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY src ./src
COPY scripts ./scripts
COPY prisma ./prisma
COPY package.json ./
RUN mkdir -p /data/secrets && chown -R noctura:noctura /data
USER noctura
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--experimental-strip-types", "src/server.ts"]
