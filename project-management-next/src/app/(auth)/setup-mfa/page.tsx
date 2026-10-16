'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  PhoneAuthProvider, 
  PhoneMultiFactorGenerator, 
  RecaptchaVerifier,
  multiFactor,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { BRAND_CONFIG } from '@/config/branding'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ShieldCheck, LogOut, ArrowLeft, MailWarning, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

export default function SetupMfaPage() {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [smsSent, setSmsSent] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // Re-authentication States (auth/requires-recent-login fix)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [password, setPassword] = useState('')
  const [pendingAction, setPendingAction] = useState<'sendSms' | 'enroll' | null>(null)

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Check initial email verification status
    const checkStatus = () => {
      const user = auth.currentUser
      if (user) {
        setEmailVerified(user.emailVerified)
      }
    }
    checkStatus()

    // Handle visible recapture container setup
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
      console.error('Failed to initialize RecaptchaVerifier:', err)
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
  }, [])

  const handleSendVerificationEmail = async () => {
    setLoading(true)
    setError('')
    try {
      const user = auth.currentUser
      if (!user) throw new Error('No user is signed in.')
      await sendEmailVerification(user)
      setEmailSent(true)
      toast.success('Verification email sent! Please check your inbox.')
    } catch (err: any) {
      console.error('Email verification send failed:', err)
      setError(err.message || 'Failed to send verification email.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckEmailVerification = async () => {
    setLoading(true)
    setError('')
    try {
      const user = auth.currentUser
      if (!user) throw new Error('No user is signed in.')
      await user.reload()
      const updatedUser = auth.currentUser
      if (updatedUser?.emailVerified) {
        setEmailVerified(true)
        toast.success('Email verified successfully! You can now enroll in SMS MFA.')
      } else {
        setError('Email is still unverified. Please verify your email first.')
      }
    } catch (err: any) {
      console.error('Checking email verification failed:', err)
      setError(err.message || 'Failed to reload user session.')
    } finally {
      setLoading(false)
    }
  }

  // Core SMS sender separated for re-auth retries
  const triggerSendSms = async () => {
    setLoading(true)
    setError('')
    try {
      const user = auth.currentUser
      if (!user) {
        throw new Error('You must be signed in to configure MFA.')
      }

      if (!recaptchaVerifierRef.current) {
        throw new Error('reCAPTCHA verifier not initialized.')
      }

      const session = await multiFactor(user).getSession()
      const phoneAuthProvider = new PhoneAuthProvider(auth)
      const verId = await phoneAuthProvider.verifyPhoneNumber(
        {
          phoneNumber,
          session
        },
        recaptchaVerifierRef.current
      )

      setVerificationId(verId)
      setSmsSent(true)
      toast.success('Verification code sent!')
    } catch (err: any) {
      console.error('MFA SMS initiation failed:', err)
      if (err.code === 'auth/requires-recent-login') {
        setError('For security reasons, you must re-enter your password to proceed.')
        setPendingAction('sendSms')
        setShowPasswordPrompt(true)
      } else {
        setError(err.message || 'Failed to send SMS. Verify formatting.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber) {
      setError('Phone number is required')
      return
    }

    if (!phoneNumber.startsWith('+')) {
      setError('Phone number must start with + followed by country code (e.g. +263...)')
      return
    }

    await triggerSendSms()
  }

  // Core Enrollment separated for re-auth retries
  const triggerVerifyAndEnroll = async () => {
    setLoading(true)
    setError('')
    try {
      const user = auth.currentUser
      if (!user) {
        throw new Error('You must be signed in to configure MFA.')
      }

      const cred = PhoneAuthProvider.credential(verificationId, verificationCode)
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred)
      
      await multiFactor(user).enroll(multiFactorAssertion, 'Primary SMS Device')
      toast.success('MFA successfully enabled!')
      
      await user.getIdToken(true)
      router.push('/profile')
    } catch (err: any) {
      console.error('MFA Enrollment failed:', err)
      if (err.code === 'auth/requires-recent-login') {
        setError('For security reasons, you must re-enter your password to complete enrollment.')
        setPendingAction('enroll')
        setShowPasswordPrompt(true)
      } else {
        setError(err.message || 'Invalid code. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyAndEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verificationId || !verificationCode) return
    await triggerVerifyAndEnroll()
  }

  // Re-authentication password submit
  const handleReauthenticate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return

    setLoading(true)
    setError('')
    try {
      const user = auth.currentUser
      if (!user || !user.email) throw new Error('No signed in user session.')

      const credential = EmailAuthProvider.credential(user.email, password)
      await reauthenticateWithCredential(user, credential)
      
      toast.success('Re-authenticated successfully!')
      setShowPasswordPrompt(false)
      setPassword('')

      // Retry the pending action
      if (pendingAction === 'sendSms') {
        setPendingAction(null)
        await triggerSendSms()
      } else if (pendingAction === 'enroll') {
        setPendingAction(null)
        await triggerVerifyAndEnroll()
      }
    } catch (err: any) {
      console.error('Re-authentication failed:', err)
      setError(err.message || 'Incorrect password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await auth.signOut()
      router.push('/login')
    } catch (err) {
      console.error('Sign out failed:', err)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md border-muted">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-primary/10">
            {showPasswordPrompt ? (
              <KeyRound className="h-8 w-8 text-amber-500 animate-bounce" />
            ) : !emailVerified ? (
              <MailWarning className="h-8 w-8 text-amber-500 animate-pulse" />
            ) : (
              <ShieldCheck className="h-8 w-8 text-brand-primary" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {showPasswordPrompt 
              ? 'Security Verification'
              : !emailVerified 
                ? 'Email Verification Required' 
                : 'Secure Your Account'
            }
          </CardTitle>
          <CardDescription>
            {showPasswordPrompt
              ? 'Please re-enter your password to authenticate this action.'
              : !emailVerified 
                ? 'Firebase requires a verified email address before enabling Multi-Factor Authentication.'
                : `${BRAND_CONFIG.name} requires all users to enable Multi-Factor Authentication (MFA).`
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">
              {error}
            </div>
          )}

          {showPasswordPrompt ? (
            <form onSubmit={handleReauthenticate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reauth-password">Enter Password</Label>
                <Input
                  id="reauth-password"
                  type="password"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm & Retry Action
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full text-xs text-muted-foreground"
                onClick={() => {
                  setShowPasswordPrompt(false)
                  setPendingAction(null)
                  setPassword('')
                }}
                disabled={loading}
              >
                Cancel
              </Button>
            </form>
          ) : !emailVerified ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Please verify your email address to continue setting up SMS verification:
              </p>
              <div className="bg-muted/40 p-3 rounded-lg border text-sm text-center font-bold text-foreground">
                {auth.currentUser?.email || 'Loading email...'}
              </div>

              {!emailSent ? (
                <Button onClick={handleSendVerificationEmail} className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Verification Email
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center font-semibold">
                    Verification link sent! Click the link in your email, then click verify below.
                  </p>
                  <Button onClick={handleCheckEmailVerification} className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    I Have Verified My Email
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={handleSendVerificationEmail} 
                    className="w-full text-xs text-muted-foreground"
                    disabled={loading}
                  >
                    Resend Verification Email
                  </Button>
                </div>
              )}
            </div>
          ) : !smsSent ? (
            <form onSubmit={handleSendSms} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number (International Format)</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+263771234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  Include country code prefix (e.g. +263 for Zimbabwe, +27 for SA, +1 for US).
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Verification Code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndEnrollSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">6-Digit Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  disabled={loading}
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  Enter the code sent to {phoneNumber}.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & Enable MFA
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full text-xs text-muted-foreground"
                onClick={() => setSmsSent(false)}
                disabled={loading}
              >
                <ArrowLeft className="mr-1.5 size-3.5" /> Use different number
              </Button>
            </form>
          )}

          <hr className="border-muted my-4" />

          <Button 
            variant="outline" 
            className="w-full text-muted-foreground border-muted hover:bg-destructive/10 hover:text-destructive"
            onClick={handleSignOut}
            disabled={loading}
          >
            <LogOut className="mr-2 h-4 w-4" /> Log Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
