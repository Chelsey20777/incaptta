'use client'

import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { BRAND_CONFIG } from '@/config/branding'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const SUCCESS_MESSAGE =
  'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const continueUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/login`
          : '/login'

      await sendPasswordResetEmail(auth, email.trim(), {
        url: continueUrl,
        handleCodeInApp: false,
      })
      setSuccess(true)
    } catch (err: unknown) {
      const firebaseError = err as { code?: string }
      if (firebaseError.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.')
      } else if (
        firebaseError.code === 'auth/invalid-email' ||
        firebaseError.code === 'auth/missing-email'
      ) {
        setError('Please enter a valid email address.')
      } else if (
        firebaseError.code === 'auth/user-not-found' ||
        firebaseError.code === 'auth/invalid-credential'
      ) {
        // Avoid email enumeration — show the same success copy
        setSuccess(true)
      } else {
        console.error(err)
        if (firebaseError.code === 'auth/network-request-failed') {
          setError('Network error. Please check your connection and try again.')
        } else {
          setSuccess(true)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-primary/10">
            <span className="text-2xl font-bold text-brand-primary">{BRAND_CONFIG.logoText}</span>
          </div>
          <CardTitle className="text-2xl">Reset password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-sm text-foreground">
                {SUCCESS_MESSAGE}
              </div>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full text-muted-foreground'
                )}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full text-muted-foreground'
                )}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
