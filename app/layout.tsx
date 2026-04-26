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
    <html lang="ko">
      <body className="antialiased font-sans min-h-screen bg-[#F8F9FA]">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
