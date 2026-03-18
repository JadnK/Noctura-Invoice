# Mehrstufiger Build. Das Laufzeit-Image enthaelt keine Build-Werkzeuge,
# laeuft als nicht privilegierter Nutzer und schreibt nur in /data.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S noctura && adduser -S -G noctura noctura
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY package.json ./
RUN mkdir -p /data/secrets && chown -R noctura:noctura /data
USER noctura
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
