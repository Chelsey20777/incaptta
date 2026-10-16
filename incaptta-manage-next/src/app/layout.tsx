import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AuthProvider } from '@/components/providers/auth-provider'
import { RouteGuard } from '@/components/providers/route-guard'
import { AppLayout } from '@/components/layout/app-layout'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Incaptta Manage',
  description: 'Incaptta Manager Portal — Approvals, Balances & Operations',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <ThemeProvider defaultTheme="dark">
          <AuthProvider>
            <RouteGuard>
              <AppLayout>
                {children}
              </AppLayout>
            </RouteGuard>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
