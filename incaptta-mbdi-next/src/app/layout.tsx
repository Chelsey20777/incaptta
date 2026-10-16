import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from '@/components/providers/auth-provider'
import { RouteGuard } from '@/components/providers/route-guard'
import { PWAProvider } from '@/components/providers/pwa-provider'
import { Toaster } from 'sonner'
import { BRAND_CONFIG } from '@/config/branding'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: `${BRAND_CONFIG.name}`,
  description: BRAND_CONFIG.tagline,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: BRAND_CONFIG.name,
    statusBarStyle: 'black-translucent',
    startupImage: '/icons/icon-512-maskable.png',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192-maskable.png',
  },
}

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#090d16' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full dark" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={BRAND_CONFIG.name} />
        <link rel="apple-touch-icon" href="/icons/icon-192-maskable.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192-maskable.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512-maskable.png" />

        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />

        <meta name="msapplication-TileImage" content="/icons/icon-192-maskable.png" />
        <meta name="msapplication-TileColor" content="#090d16" />
        <meta name="msapplication-tap-highlight" content="no" />

        <meta property="og:title" content={BRAND_CONFIG.name} />
        <meta property="og:description" content={BRAND_CONFIG.tagline} />
        <meta property="og:image" content="/icons/icon-512.png" />
        <meta property="og:type" content="website" />
      </head>
      <body className={`${inter.variable} font-sans antialiased h-full`}>
        <ThemeProvider defaultTheme="dark" storageKey="incaptta-mbdi-theme">
          <PWAProvider>
            <AuthProvider>
              <RouteGuard>
                {children}
              </RouteGuard>
              <Toaster position="top-center" richColors />
            </AuthProvider>
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
