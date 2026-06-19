/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  poweredByHeader: false,
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
