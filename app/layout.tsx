import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Campaign Dashboard',
  description: 'Campaign Performance Management Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased font-sans min-h-screen">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
