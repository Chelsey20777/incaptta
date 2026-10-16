'use client'

import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldOff, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AccessDeniedPage() {
  const router = useRouter()
  const { reset } = useAuthStore()

  const handleLogout = async () => {
    await auth.signOut()
    reset()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-orange-500/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20">
            <ShieldOff className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-xl">MBDI Access Required</CardTitle>
          <CardDescription className="text-base text-foreground/80 pt-2">
            MBDI is not enabled for your account — contact your administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
