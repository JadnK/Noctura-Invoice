FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# npm install statt npm ci: kein package-lock.json im isolierten Build-
# Kontext (siehe apps/license-api/Dockerfile fuer die ausfuehrliche
# Begruendung).
RUN npm install --ignore-scripts
COPY . .

# next.config.js wertet API_INTERNAL_URL in rewrites() beim Bauen aus, nicht
# erst zur Laufzeit - Next.js backt Rewrites in "output: standalone" in den
# Build ein. docker-compose.yml setzt die Variable nur fuer den laufenden
# Container, der isolierte Build-Schritt hier sieht sie nicht und wuerde
# ohne diese Zeile "undefined/api/:path*" als Ziel erzeugen. Fester Wert,
# kein Geheimnis: der interne Docker-Netzwerkname aendert sich nie.
ENV API_INTERNAL_URL=http://license-api:3000
RUN npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S noctura && adduser -S -G noctura noctura
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER noctura
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
