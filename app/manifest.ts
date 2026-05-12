import type { MetadataRoute } from 'next';

// Next.js 14+ route — emitted at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChaosCitim',
    short_name: 'ChaosCitim',
    description:
      'Romanian-first reading companion with graduated morphological scaffolding.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F5FA',
    theme_color: '#244952',
    categories: ['education', 'books', 'productivity'],
    lang: 'ro',
    icons: [
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
