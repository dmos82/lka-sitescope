import type { Metadata } from 'next';
import { Source_Sans_3 } from 'next/font/google';
import './globals.css';

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-source-sans',
});

export const metadata: Metadata = {
  title: 'LKA SiteScope',
  description: 'Franchise location eligibility analysis for Little Kitchen Academy',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={sourceSans.className}>{children}</body>
    </html>
  );
}
