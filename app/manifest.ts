import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Mansor One',
    short_name: 'Mansor One',
    description: 'Finanzas para el hogar',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#050814',
    theme_color: '#0b1220',
    orientation: 'portrait-primary',
    lang: 'es-PR',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/mansor-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/mansor-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/mansor-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
