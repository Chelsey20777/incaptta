'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  signInWithEmailAndPassword, 
  getMultiFactorResolver, 
  PhoneAuthProvider, 
  PhoneMultiFactorGenerator, 
  RecaptchaVerifier 
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { BRAND_CONFIG } from '@/config/branding'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, ShieldAlert } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // MFA-specific States
  const [mfaResolver, setMfaResolver] = useState<any>(null)
  const [mfaHints, setMfaHints] = useState<any[]>([])
  const [selectedHint, setSelectedHint] = useState<any>(null)
  const [verificationId, setVerificationId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaSent, setMfaSent] = useState(false)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => {
    if (!mfaResolver) return

    // Create a container element dynamically and append to body to isolate it from React
    let container = document.getElementById('recaptcha-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'recaptcha-container'
      document.body.appendChild(container)
    }

    try {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          'expired-callback': () => {
            setError('reCAPTCHA expired. Please try sending the SMS code again.')
          }
        })
      }
    } catch (err) {
      console.error('Failed to init RecaptchaVerifier:', err)
    }

    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear()
        } catch (e) {
          console.warn('Error clearing recaptcha verifier:', e)
        }
        recaptchaVerifierRef.current = null
      }
      const el = document.getElementById('recaptcha-container')
      if (el) el.remove()
    }
  }, [mfaResolver])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/')
    } catch (err: unknown) {
      const firebaseError = err as { code?: string }
      if (firebaseError.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, err as any)
        setMfaResolver(resolver)
        setMfaHints(resolver.hints)
        if (resolver.hints.length > 0) {
          setSelectedHint(resolver.hints[0])
        }
      } else if (firebaseError.code === 'auth/invalid-credential') {
        setError('Invalid email or password')
      } else if (firebaseError.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.')
      } else {
        const msg = firebaseError.code ? `An error occurred: ${firebaseError.code}. Please try again.` : 'An error occurred. Please try again.'
        setError(msg)
        console.error(err)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSendSms = async () => {
    if (!mfaResolver || !selectedHint) return
    setMfaLoading(true)
    setError('')
    try {
      if (!recaptchaVerifierRef.current) {
        throw new Error('reCAPTCHA verifier not initialized.')
      }
      const phoneAuthProvider = new PhoneAuthProvider(auth)
      const verId = await phoneAuthProvider.verifyPhoneNumber(
        { 
          multiFactorHint: selectedHint,
          session: mfaResolver.session
        },
        recaptchaVerifierRef.current
      )
      setVerificationId(verId)
      setMfaSent(true)
    } catch (err: any) {
      console.error(err)
      setError(`Failed to send SMS code: ${err.code || err.message}`)
    } finally {
      setMfaLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verificationId || !mfaCode) return
    setLoading(true)
    setError('')
    try {
      const cred = PhoneAuthProvider.credential(verificationId, mfaCode)
      const assertion = PhoneMultiFactorGenerator.assertion(cred)
      await mfaResolver.resolveSignIn(assertion)
      router.push('/')
    } catch (err: any) {
      console.error(err)
      setError(`Invalid verification code: ${err.code || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelMfa = () => {
    setMfaResolver(null)
    setMfaHints([])
    setSelectedHint(null)
    setVerificationId('')
    setMfaCode('')
    setMfaSent(false)
    setError('')
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear()
      recaptchaVerifierRef.current = null
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {mfaResolver ? (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10">
                <ShieldAlert className="h-8 w-8 text-amber-500" />
              </div>
              <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
              <CardDescription>
                Your account requires secondary verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {!mfaSent ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Verification Method</Label>
                    <select
                      value={selectedHint?.uid || ''}
                      onChange={(e) => {
                        const hint = mfaHints.find(h => h.uid === e.target.value)
                        if (hint) setSelectedHint(hint)
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {mfaHints.map((hint) => (
                        <option key={hint.uid} value={hint.uid} className="bg-background text-foreground">
                          SMS to {hint.phoneNumber || 'Enrolled Device'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleSendSms} 
                    disabled={mfaLoading}
                  >
                    {mfaLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Verification Code
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleMfaSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mfaCode">Enter 6-Digit Verification Code</Label>
                    <Input
                      id="mfaCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="123456"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify & Sign In
                  </Button>
                </form>
              )}

              <Button 
                variant="ghost" 
                className="w-full text-muted-foreground" 
                onClick={handleCancelMfa}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl overflow-hidden bg-orange-500/10 ring-1 ring-orange-500/20">
                <img src="/icon.png" alt="Logo" className="h-[78%] w-[78%] object-contain" />
              </div>
              <CardTitle className="text-2xl">{BRAND_CONFIG.name}{BRAND_CONFIG.tagline ? ` ${BRAND_CONFIG.tagline}` : ""}</CardTitle>
              <CardDescription>Sign in to your account</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
