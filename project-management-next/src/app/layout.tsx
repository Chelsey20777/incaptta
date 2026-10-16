import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from '@/components/providers/auth-provider'
import { RouteGuard } from '@/components/providers/route-guard'
import { PWAProvider } from '@/components/providers/pwa-provider'
import { AppLayout } from '@/components/layout/app-layout'
import { Toaster } from '@/components/ui/sonner'

import { BRAND_CONFIG } from '@/config/branding'
import { DynamicFavicon } from '@/components/layout/dynamic-favicon'

const gotham = localFont({
  src: [
    {
      path: '../fonts/gotham/GothamLight.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../fonts/gotham/GothamBook.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/gotham/GothamItalic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/gotham/GothamMedium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/gotham/GothamBold.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../fonts/gotham/GothamBoldItalic.ttf',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-gotham',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
})

export const metadata: Metadata = {
  title: BRAND_CONFIG.tagline ? `${BRAND_CONFIG.name} ${BRAND_CONFIG.tagline}` : BRAND_CONFIG.name,
  description: BRAND_CONFIG.tagline ? `${BRAND_CONFIG.name} ${BRAND_CONFIG.tagline} Project Management Application` : `${BRAND_CONFIG.name} Project Management Application`,
  applicationName: BRAND_CONFIG.name,
  appleWebApp: {
    capable: true,
    title: BRAND_CONFIG.name,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192-maskable.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${gotham.variable} compact compact-mode`} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <ThemeProvider defaultTheme="dark">
          <DynamicFavicon />
          <AuthProvider>
            <PWAProvider>
              <RouteGuard>
                <AppLayout>
                  {children}
                </AppLayout>
              </RouteGuard>
              <Toaster />
            </PWAProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
