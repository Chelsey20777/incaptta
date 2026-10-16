'use client'

import { useState, useEffect, useRef } from 'react'
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  linkWithCredential,
  getMultiFactorResolver,
  getIdTokenResult,
  GoogleAuthProvider,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  type AuthCredential,
  type MultiFactorResolver,
  type MultiFactorInfo,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { BRAND_CONFIG } from '@/config/branding'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, ShieldAlert, Eye, EyeOff } from 'lucide-react'

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

function googleProvider() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}

function authErrorMessage(code?: string) {
  switch (code) {
    case 'auth/invalid-credential':
      return 'Invalid email or password'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.'
    case 'auth/popup-blocked':
      return 'The Google sign-in popup was blocked. Allow popups for this site and try again.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return ''
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled for this environment yet.'
    case 'auth/unauthorized-domain':
      return 'This site is not authorized for Google sign-in. Add the domain in Firebase Authentication.'
    case 'auth/account-exists-with-different-credential':
      return 'This email already has an Incaptta account. Enter your password once to enable Google sign-in.'
    case 'app/not-provisioned':
      return 'This Google account is not set up for Incaptta. Ask an admin to create your user with this email first.'
    default:
      return code ? `An error occurred: ${code}. Please try again.` : 'An error occurred. Please try again.'
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [linkGoogle, setLinkGoogle] = useState(false)
  const router = useRouter()
  const pendingGoogleCredential = useRef<AuthCredential | null>(null)

  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null)
  const [mfaHints, setMfaHints] = useState<MultiFactorInfo[]>([])
  const [selectedHint, setSelectedHint] = useState<MultiFactorInfo | null>(null)
  const [verificationId, setVerificationId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaSent, setMfaSent] = useState(false)
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => {
    if (!mfaResolver) return

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

  const finishSignedIn = async () => {
    const user = auth.currentUser
    if (!user) {
      throw Object.assign(new Error('not-provisioned'), { code: 'app/not-provisioned' })
    }

    if (pendingGoogleCredential.current) {
      try {
        await linkWithCredential(user, pendingGoogleCredential.current)
      } catch (linkErr: unknown) {
        const code = (linkErr as { code?: string }).code
        if (code !== 'auth/provider-already-linked' && code !== 'auth/credential-already-in-use') {
          throw linkErr
        }
      }
      pendingGoogleCredential.current = null
      setLinkGoogle(false)
    }

    const tokenResult = await getIdTokenResult(user, true)
    if (tokenResult.claims.isActive !== true) {
      await auth.signOut()
      throw Object.assign(new Error('not-provisioned'), { code: 'app/not-provisioned' })
    }

    router.push('/')
  }

  const beginMfa = (err: unknown) => {
    const resolver = getMultiFactorResolver(auth, err as Parameters<typeof getMultiFactorResolver>[1])
    setMfaResolver(resolver)
    setMfaHints(resolver.hints)
    if (resolver.hints.length > 0) {
      setSelectedHint(resolver.hints[0])
    }
  }

  const handleAuthFailure = (err: unknown) => {
    const firebaseError = err as { code?: string; customData?: { email?: string } }
    if (firebaseError.code === 'auth/multi-factor-auth-required') {
      beginMfa(err)
      return
    }
    if (firebaseError.code === 'auth/account-exists-with-different-credential') {
      const credential = GoogleAuthProvider.credentialFromError(err as Parameters<typeof GoogleAuthProvider.credentialFromError>[0])
      pendingGoogleCredential.current = credential
      setLinkGoogle(true)
      if (firebaseError.customData?.email) {
        setEmail(firebaseError.customData.email)
      }
      setError(authErrorMessage(firebaseError.code))
      return
    }
    const message = authErrorMessage(firebaseError.code)
    if (message) {
      setError(message)
    }
    if (firebaseError.code && !message.startsWith('Invalid') && firebaseError.code !== 'app/not-provisioned') {
      console.error(err)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // 1. Try MongoDB Atlas authentication first
      try {
        const mongoRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })

        if (mongoRes.ok) {
          const data = await mongoRes.json()
          if (data.success) {
            router.push('/')
            return
          }
        } else if (mongoRes.status === 403) {
          const errData = await mongoRes.json().catch(() => ({}))
          setError(errData.error || 'This account has been deactivated.')
          setLoading(false)
          return
        }
      } catch (mongoErr) {
        console.warn('[Login] MongoDB auth attempt error, trying fallback:', mongoErr)
      }

      // 2. Fallback to Firebase authentication during transition phase
      await signInWithEmailAndPassword(auth, email, password)
      await finishSignedIn()
    } catch (err: unknown) {
      handleAuthFailure(err)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setError('')
    try {
      await signInWithPopup(auth, googleProvider())
      await finishSignedIn()
    } catch (err: unknown) {
      handleAuthFailure(err)
    } finally {
      setGoogleLoading(false)
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
    } catch (err: unknown) {
      console.error(err)
      const firebaseError = err as { code?: string; message?: string }
      setError(`Failed to send SMS code: ${firebaseError.code || firebaseError.message}`)
    } finally {
      setMfaLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verificationId || !mfaCode || !mfaResolver) return
    setLoading(true)
    setError('')
    try {
      const cred = PhoneAuthProvider.credential(verificationId, mfaCode)
      const assertion = PhoneMultiFactorGenerator.assertion(cred)
      await mfaResolver.resolveSignIn(assertion)
      await finishSignedIn()
    } catch (err: unknown) {
      console.error(err)
      const firebaseError = err as { code?: string; message?: string }
      setError(`Invalid verification code: ${firebaseError.code || firebaseError.message}`)
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
    pendingGoogleCredential.current = null
    setLinkGoogle(false)
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear()
      recaptchaVerifierRef.current = null
    }
  }

  const handleCancelLink = () => {
    pendingGoogleCredential.current = null
    setLinkGoogle(false)
    setPassword('')
    setError('')
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
                          SMS to {(hint as { phoneNumber?: string }).phoneNumber || 'Enrolled Device'}
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
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-primary/10">
                <span className="text-2xl font-bold text-brand-primary">{BRAND_CONFIG.logoText}</span>
              </div>
              <CardTitle className="text-2xl">{BRAND_CONFIG.name}{BRAND_CONFIG.tagline ? ` ${BRAND_CONFIG.tagline}` : ""}</CardTitle>
              <CardDescription>
                {linkGoogle ? 'Confirm your password to enable Google sign-in' : 'Sign in to your account'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {!linkGoogle && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10"
                    onClick={handleGoogleLogin}
                    disabled={loading || googleLoading}
                  >
                    {googleLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <span className="mr-2"><GoogleMark /></span>
                    )}
                    Continue with Google
                  </Button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
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
                    readOnly={linkGoogle}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {!linkGoogle && (
                      <Link
                        href="/forgot-password"
                        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading || googleLoading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {linkGoogle ? 'Link Google & Sign In' : 'Sign In'}
                </Button>
              </form>

              {linkGoogle && (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={handleCancelLink}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Button>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
