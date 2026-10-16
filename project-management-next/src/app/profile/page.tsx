'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  auth,
} from '@/lib/firebase'
import {
  multiFactor,
  updatePassword,
  updateProfile,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithCredential,
} from 'firebase/auth'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import { uploadUserAvatar, uploadUserSignature } from '@/lib/storage-helpers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import {
  User,
  ShieldAlert,
  ShieldCheck,
  Phone,
  Mail,
  Briefcase,
  Loader2,
  Trash2,
  KeyRound,
  Camera,
  PenLine,
  Upload,
  X,
} from 'lucide-react'

async function saveProfileFields(fields: {
  signatureUrl?: string | null
  position?: string | null
}) {
  const currentUser = auth.currentUser
  if (!currentUser) throw new Error('No active user session found.')
  const token = await currentUser.getIdToken()
  const res = await fetch('/api/super/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(fields),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Failed to update profile.')
  }
  return data as { signatureUrl?: string | null; position?: string | null }
}

export default function ProfilePage() {
  const { user: storeUser, profile, getRoles, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [googleLinkLoading, setGoogleLinkLoading] = useState(false)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [positionLoading, setPositionLoading] = useState(false)
  const [mfaPhone, setMfaPhone] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [position, setPosition] = useState('')
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const roles = getRoles()
  const savedSignatureUrl = profile?.signatureUrl || null

  const loadMfaStatus = () => {
    const currentUser = auth.currentUser
    if (currentUser) {
      const factors = multiFactor(currentUser).enrolledFactors || []
      if (factors.length > 0) {
        setMfaPhone((factors[0] as { phoneNumber?: string }).phoneNumber || 'Registered Phone')
      } else {
        setMfaPhone(null)
      }
    }
  }

  useEffect(() => {
    loadMfaStatus()
  }, [storeUser])

  useEffect(() => {
    setPosition(profile?.position || '')
  }, [profile?.position])

  useEffect(() => {
    return () => {
      if (signaturePreviewUrl) URL.revokeObjectURL(signaturePreviewUrl)
    }
  }, [signaturePreviewUrl])

  const refreshAuthUser = async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return
    await currentUser.reload()
    setUser(auth.currentUser)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const currentUser = auth.currentUser
    if (!currentUser) {
      toast.error('No active user session found.')
      return
    }

    setAvatarLoading(true)
    try {
      const downloadUrl = await uploadUserAvatar(file, currentUser.uid)
      await updateProfile(currentUser, { photoURL: downloadUrl })
      await refreshAuthUser()
      toast.success('Profile picture updated.')
    } catch (err: unknown) {
      console.error('Avatar update failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to update profile picture.'
      toast.error(message)
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    if (!currentPassword) {
      toast.error('Enter your current password.')
      return
    }

    const currentUser = auth.currentUser
    if (!currentUser?.email) {
      toast.error('No active user session found.')
      return
    }

    setPasswordLoading(true)
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password updated successfully.')
    } catch (err: unknown) {
      console.error('Password update error:', err)
      const firebaseError = err as { code?: string; message?: string }
      if (firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect.')
      } else if (firebaseError.code === 'auth/requires-recent-login') {
        toast.error('Please enter your current password and try again.')
      } else if (firebaseError.code === 'auth/weak-password') {
        toast.error('Choose a stronger password.')
      } else {
        toast.error(firebaseError.message || 'Failed to update password.')
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleSignatureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (signaturePreviewUrl) URL.revokeObjectURL(signaturePreviewUrl)
    setSignatureFile(file)
    setSignaturePreviewUrl(URL.createObjectURL(file))
  }

  const clearSignatureSelection = () => {
    if (signaturePreviewUrl) URL.revokeObjectURL(signaturePreviewUrl)
    setSignatureFile(null)
    setSignaturePreviewUrl(null)
  }

  const handleUploadSignature = async () => {
    if (!signatureFile) return
    const currentUser = auth.currentUser
    if (!currentUser) {
      toast.error('No active user session found.')
      return
    }

    setSignatureLoading(true)
    try {
      const downloadUrl = await uploadUserSignature(signatureFile, currentUser.uid)
      await saveProfileFields({ signatureUrl: downloadUrl })
      clearSignatureSelection()
      toast.success('Signature uploaded successfully.')
    } catch (err: unknown) {
      console.error('Signature upload failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to upload signature.'
      toast.error(message)
    } finally {
      setSignatureLoading(false)
    }
  }

  const handleRemoveSignature = async () => {
    if (!window.confirm('Remove your signature from your profile?')) return
    setSignatureLoading(true)
    try {
      await saveProfileFields({ signatureUrl: null })
      clearSignatureSelection()
      toast.success('Signature removed.')
    } catch (err: unknown) {
      console.error('Signature remove failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to remove signature.'
      toast.error(message)
    } finally {
      setSignatureLoading(false)
    }
  }

  const handleSavePosition = async (e: React.FormEvent) => {
    e.preventDefault()
    setPositionLoading(true)
    try {
      await saveProfileFields({ position: position.trim() || null })
      toast.success('Position saved.')
    } catch (err: unknown) {
      console.error('Position save failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to save position.'
      toast.error(message)
    } finally {
      setPositionLoading(false)
    }
  }

  const hasGoogleProvider = Boolean(
    storeUser?.providerData?.some((provider) => provider.providerId === 'google.com')
  )
  const hasPasswordProvider = Boolean(
    storeUser?.providerData?.some((provider) => provider.providerId === 'password')
  )

  const handleLinkGoogle = async () => {
    const currentUser = auth.currentUser
    if (!currentUser) {
      toast.error('No active user session found.')
      return
    }

    setGoogleLinkLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await linkWithPopup(currentUser, provider)
      await refreshAuthUser()
      toast.success('Google account linked. You can sign in with Google next time.')
    } catch (err: unknown) {
      const firebaseError = err as { code?: string; message?: string }
      if (firebaseError.code === 'auth/popup-closed-by-user' || firebaseError.code === 'auth/cancelled-popup-request') {
        return
      }
      if (firebaseError.code === 'auth/credential-already-in-use') {
        toast.error('That Google account is already linked to another Incaptta user.')
      } else if (firebaseError.code === 'auth/provider-already-linked') {
        toast.success('Google is already linked to this account.')
        await refreshAuthUser()
      } else if (firebaseError.code === 'auth/operation-not-allowed') {
        toast.error('Google sign-in is not enabled for this environment yet.')
      } else {
        toast.error(firebaseError.message || 'Failed to link Google account.')
      }
    } finally {
      setGoogleLinkLoading(false)
    }
  }

  const handleDisableMfa = async () => {
    if (!window.confirm('Are you sure you want to disable Multi-Factor Authentication? Your account security will be reduced.')) {
      return
    }

    setLoading(true)
    try {
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error('No active user session found.')

      const factors = multiFactor(currentUser).enrolledFactors || []
      if (factors.length > 0) {
        await multiFactor(currentUser).unenroll(factors[0])
        toast.success('Multi-Factor Authentication disabled successfully.')
        await currentUser.reload()
        await currentUser.getIdToken(true)
        loadMfaStatus()
      } else {
        toast.error('No enrolled MFA factors found.')
      }
    } catch (err: unknown) {
      console.error('Failed to unenroll MFA:', err)
      const message = err instanceof Error ? err.message : 'Failed to disable MFA.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-6 px-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Profile</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account settings, permissions, and security factors.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Account Details */}
        <Card className="bg-card/50 border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <User className="size-5 text-primary" />
              Account Details
            </CardTitle>
            <CardDescription>
              Basic information associated with your login account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="size-16">
                  {storeUser?.photoURL ? (
                    <AvatarImage src={storeUser.photoURL} alt={storeUser.displayName || 'Profile'} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg uppercase">
                    {storeUser?.displayName?.charAt(0) || storeUser?.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border bg-background text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
                  title="Change profile picture"
                  aria-label="Change profile picture"
                >
                  {avatarLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Camera className="size-3.5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {storeUser?.displayName || 'Display name not set'}
                </p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, or WebP up to 2 MB
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  disabled={avatarLoading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarLoading ? (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Camera className="size-3.5 mr-1.5" />
                  )}
                  Upload photo
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Mail className="size-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">Email Address</p>
                <p className="text-sm font-semibold">{storeUser?.email || '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <User className="size-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">Display Name</p>
                <p className="text-sm font-semibold">{storeUser?.displayName || 'Not Set'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <Briefcase className="size-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">Assigned Roles</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5">
                        {role}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      No Roles Assigned
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Security & MFA */}
        <Card className="bg-card/50 border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              {mfaPhone ? (
                <ShieldCheck className="size-5 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-5 text-amber-500" />
              )}
              Security & MFA
            </CardTitle>
            <CardDescription>
              Protect your account by enabling Multi-Factor Authentication.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm font-medium">MFA Status</span>
              {mfaPhone ? (
                <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15 border-emerald-500/20 font-bold uppercase tracking-wider text-[10px] px-2.5 py-0.5">
                  Secured (Active)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-500 bg-amber-500/10 border-amber-500/20 font-bold uppercase tracking-wider text-[10px] px-2.5 py-0.5">
                  Not Enabled
                </Badge>
              )}
            </div>

            {mfaPhone ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10 text-sm">
                  <Phone className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400">SMS Authentication</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Verification codes will be sent to: <span className="font-bold text-foreground">{mfaPhone}</span>
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleDisableMfa}
                  disabled={loading}
                  className="w-full text-xs font-semibold gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Disable Multi-Factor Auth
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enhance your account safety. When logging in, in addition to your email and password, you will be required to input a 6-digit code sent to your registered phone number.
                </p>
                <Button
                  onClick={() => router.push('/setup-mfa')}
                  className="w-full text-xs font-semibold"
                >
                  Set Up SMS MFA
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Signature & Position */}
        <Card className="bg-card/50 border md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <PenLine className="size-5 text-primary" />
              Signature &amp; Position
            </CardTitle>
            <CardDescription>
              Your name, position, and signature appear on quotes, invoices, and job card PDFs you create.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Signature</Label>
              <div className="flex flex-wrap items-center gap-4">
                {(signaturePreviewUrl || savedSignatureUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signaturePreviewUrl || savedSignatureUrl || ''}
                    alt="Signature preview"
                    className="h-16 w-auto max-w-[200px] object-contain border rounded bg-white p-1"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={signatureInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleSignatureSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => signatureInputRef.current?.click()}
                    disabled={signatureLoading}
                  >
                    <Upload className="mr-2 size-4" />
                    Select Signature
                  </Button>
                  {signatureFile && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleUploadSignature}
                      disabled={signatureLoading}
                    >
                      {signatureLoading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 size-4" />
                      )}
                      Upload
                    </Button>
                  )}
                  {signatureFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSignatureSelection}
                      disabled={signatureLoading}
                    >
                      <X className="mr-2 size-4" />
                      Cancel
                    </Button>
                  )}
                  {savedSignatureUrl && !signatureFile && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleRemoveSignature}
                      disabled={signatureLoading}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG, or WebP up to 2 MB</p>
            </div>

            <form onSubmit={handleSavePosition} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2 flex-1 max-w-md">
                <Label htmlFor="position">Position / Title</Label>
                <Input
                  id="position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. Sales Executive"
                  maxLength={120}
                />
              </div>
              <Button type="submit" disabled={positionLoading} className="gap-1.5 shrink-0">
                {positionLoading && <Loader2 className="size-3.5 animate-spin" />}
                Save Position
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Mail className="size-5 text-primary" />
              Connected accounts
            </CardTitle>
            <CardDescription>
              Link Google so you can sign in without typing a password.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                {hasGoogleProvider
                  ? 'This account can sign in with Google.'
                  : 'Use the same email as this Incaptta user.'}
              </p>
            </div>
            {hasGoogleProvider ? (
              <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15 border-emerald-500/20 font-bold uppercase tracking-wider text-[10px] px-2.5 py-0.5">
                Linked
              </Badge>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={handleLinkGoogle}
                disabled={googleLinkLoading}
                className="gap-1.5"
              >
                {googleLinkLoading && <Loader2 className="size-3.5 animate-spin" />}
                Link Google
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Change Password */}
        <Card className="bg-card/50 border md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Change Password
            </CardTitle>
            <CardDescription>
              {hasPasswordProvider
                ? 'Update your password. You will need your current password to confirm.'
                : 'This account signs in with Google. Ask an admin if you also need a password.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasPasswordProvider ? (
              <p className="text-sm text-muted-foreground">
                No password is set on this login. Continue with Google on the sign-in page.
              </p>
            ) : (
            <form onSubmit={handleChangePassword} className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={passwordLoading} className="gap-1.5">
                  {passwordLoading && <Loader2 className="size-3.5 animate-spin" />}
                  Update password
                </Button>
              </div>
            </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
