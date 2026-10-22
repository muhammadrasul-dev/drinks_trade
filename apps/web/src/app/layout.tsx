import '@drinks/ui/globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Toaster } from '@drinks/ui/components/sonner';

export const metadata: Metadata = {
  title: 'drinks_trade',
};

// Minimal root layout; T-202 moves pages under [locale] and sets <html lang> from it.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="uz">
      <body className="min-h-screen antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
