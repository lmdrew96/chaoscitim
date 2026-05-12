import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { SwRegister } from './sw-register';

export const metadata: Metadata = {
  title: 'ChaosCitim',
  description:
    'Romanian-first reading companion with graduated morphological scaffolding.',
  applicationName: 'ChaosCitim',
  appleWebApp: {
    capable: true,
    title: 'ChaosCitim',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#244952' },
    { media: '(prefers-color-scheme: dark)', color: '#1E1830' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <SwRegister />
        </body>
      </html>
    </ClerkProvider>
  );
}
