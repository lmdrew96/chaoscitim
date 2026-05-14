import type { Metadata, Viewport } from 'next';
import { Fraunces, Space_Grotesk, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { SwRegister } from './sw-register';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['400', '500', '600'],
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  weight: ['400'],
});

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
      <html lang="en" className={`${fraunces.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}>
        <body>
          {children}
          <SwRegister />
        </body>
      </html>
    </ClerkProvider>
  );
}
