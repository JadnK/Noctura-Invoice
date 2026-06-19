import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Noctura Lizenzverwaltung',
  description: 'Verwaltung von Lizenzen, Geräten und App-Versionen',
};

/** Ausschliesslich Dark Mode — wie in der Desktop-App, gleiche Tokens. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-canvas text-text antialiased">{children}</body>
    </html>
  );
}
