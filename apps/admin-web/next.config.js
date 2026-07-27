import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  poweredByHeader: false,
  // Ohne diese Angabe versucht Next, die Monorepo-Wurzel selbst zu erraten
  // (ueblicherweise durch Hochlaufen bis zu einem package-lock.json). Da
  // keins eingecheckt ist, waere das Ergebnis nicht verlaesslich - explizit
  // gesetzt statt geraten. Funktioniert sowohl lokal (echte Repo-Wurzel)
  // als auch im Docker-Build (dort liegt admin-web unter /repo/apps/admin-web,
  // "../../" fuehrt ebenso zur Wurzel des kopierten Kontexts).
  outputFileTracingRoot: join(__dirname, '../../'),
  async rewrites() {
    // Das Panel spricht die API ueber denselben Host an (ADR-0003).
    return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL}/api/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }];
  },
};
