import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChaosCitim',
  description:
    'Romanian-first reading companion with graduated morphological scaffolding.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
