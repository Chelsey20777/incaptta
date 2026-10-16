import type { MetadataRoute } from 'next'
import { BRAND_CONFIG } from '@/config/branding'

export default function manifest(): MetadataRoute.Manifest {
  const name = BRAND_CONFIG.tagline
    ? `${BRAND_CONFIG.name} ${BRAND_CONFIG.tagline}`
    : BRAND_CONFIG.name

  return {
    name,
    short_name: BRAND_CONFIG.name,
    description: `${name} Project Management Application`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#121212',
    theme_color: '#0f172a',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Chat',
        short_name: 'Chat',
        description: 'Open chat messages',
        url: '/chat',
        icons: [
          {
            src: '/icons/chat-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
        ],
      },
    ],
  }
}
