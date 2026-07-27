/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  poweredByHeader: false,
  // Kein outputFileTracingRoot: admin-web hat keine internen @noctura/*-
  // Laufzeitabhaengigkeiten (packages/ui liefert nur CSS, das beim Bauen
  // in echtes CSS uebersetzt wird - Next muss dafuer zur Laufzeit nichts
  // nachverfolgen). Ohne gesetzten Wert findet Next kein Lockfile oberhalb
  // dieses Ordners (es gibt keins im Repository) und behandelt admin-web
  // als eigenstaendiges Projekt - genau richtig hier. server.js landet
  // dadurch flach in .next/standalone/, nicht verschachtelt.
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
