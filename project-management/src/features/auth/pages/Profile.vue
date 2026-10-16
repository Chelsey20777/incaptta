<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useSession } from '@/composables/useSession'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ROLE_LABELS } from '@/constants/roles'
import { User, Mail, Shield, KeyRound, CheckCircle2, XCircle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { 
    updatePassword, 
    EmailAuthProvider, 
    reauthenticateWithCredential,
    multiFactor,
    PhoneAuthProvider,
    PhoneMultiFactorGenerator,
    RecaptchaVerifier,
    sendEmailVerification
} from 'firebase/auth'
import { auth } from '@/lib/firebase'

const { user, roles, isActive } = useSession()

const passwordForm = reactive({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    loading: false
})

const isReauthNeeded = ref(false)

async function handleUpdatePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        toast.error('Passwords do not match')
        return
    }

    if (passwordForm.newPassword.length < 6) {
        toast.error('Password must be at least 6 characters')
        return
    }

    passwordForm.loading = true
    try {
        const currentUser = auth.currentUser
        if (!currentUser) throw new Error('No user logged in')

        // Handle re-authentication if required (for sensitive operations like password change)
        if (passwordForm.currentPassword) {
            const credential = EmailAuthProvider.credential(currentUser.email!, passwordForm.currentPassword)
            await reauthenticateWithCredential(currentUser, credential)
        }

        await updatePassword(currentUser, passwordForm.newPassword)
        toast.success('Password updated successfully')

        // Reset form
        passwordForm.currentPassword = ''
        passwordForm.newPassword = ''
        passwordForm.confirmPassword = ''
    } catch (error: any) {
        console.error('Password update error:', error)
        if (error.code === 'auth/requires-recent-login') {
            toast.error('Please provide your current password to continue.')
            isReauthNeeded.value = true
        } else {
            toast.error(error.message || 'Failed to update password')
        }
    } finally {
        passwordForm.loading = false
    }
}

// ── Email Verification ──────────────────────────────────────────────────────
const verificationLoading = ref(false)
const isEmailVerified = computed(() => user.value?.emailVerified || false)

async function handleSendVerificationEmail() {
    verificationLoading.value = true
    try {
        const currentUser = auth.currentUser
        if (!currentUser) throw new Error('No user logged in')
        
        await sendEmailVerification(currentUser)
        toast.success('Verification email sent! Please check your inbox.')
    } catch (error: any) {
        console.error('Email verification error:', error)
        toast.error(error.message || 'Failed to send verification email')
    } finally {
        verificationLoading.value = false
    }
}

// ── Multi-Factor Authentication (MFA) ───────────────────────────────────────
const mfaLoading = ref(false)
const phoneNumber = ref('')
const verificationCode = ref('')
const verificationId = ref('')
const isEnrolling = ref(false)
const recaptchaVerifier = ref<any>(null)

const enrolledFactors = computed(() => {
    if (!auth.currentUser) return []
    return multiFactor(auth.currentUser).enrolledFactors
})

const isMfaEnabled = computed(() => enrolledFactors.value.length > 0)

async function setupRecaptcha() {
    if (recaptchaVerifier.value) return
    recaptchaVerifier.value = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
    })
}

async function startEnrollment() {
    if (!phoneNumber.value) {
        toast.error('Please enter a phone number')
        return
    }
    
    mfaLoading.value = true
    try {
        const currentUser = auth.currentUser
        if (!currentUser) throw new Error('No user logged in')

        await setupRecaptcha()
        
        const session = await multiFactor(currentUser).getSession()
        const phoneInfoOptions = {
            phoneNumber: phoneNumber.value,
            session
        }
        
        const phoneAuthProvider = new PhoneAuthProvider(auth)
        verificationId.value = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier.value)
        
        isEnrolling.value = true
        toast.info('Verification code sent to your phone')
    } catch (error: any) {
        console.error('MFA Enrollment error:', error)
        toast.error(error.message || 'Failed to send verification code')
    } finally {
        mfaLoading.value = false
    }
}

async function finishEnrollment() {
    if (!verificationCode.value) return
    
    mfaLoading.value = true
    try {
        const currentUser = auth.currentUser
        if (!currentUser) throw new Error('No user logged in')

        const cred = PhoneAuthProvider.credential(verificationId.value, verificationCode.value)
        const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred)
        
        await multiFactor(currentUser).enroll(multiFactorAssertion, 'Primary Phone')
        
        toast.success('Two-factor authentication enabled!')
        isEnrolling.value = false
        phoneNumber.value = ''
        verificationCode.value = ''
    } catch (error: any) {
        console.error('MFA Finalize error:', error)
        toast.error(error.message || 'Failed to verify code')
    } finally {
        mfaLoading.value = false
    }
}

async function disableMfa() {
    if (!confirm('Are you sure you want to disable two-factor authentication?')) return
    
    mfaLoading.value = true
    try {
        const currentUser = auth.currentUser
        if (!currentUser) throw new Error('No user logged in')

        const factors = multiFactor(currentUser).enrolledFactors
        if (factors.length > 0) {
            await multiFactor(currentUser).unenroll(factors[0]!)
            toast.success('Two-factor authentication disabled')
        }
    } catch (error: any) {
        console.error('MFA Disable error:', error)
        toast.error(error.message || 'Failed to disable MFA')
    } finally {
        mfaLoading.value = false
    }
}
</script>

<template>
    <div class="container mx-auto py-8 max-w-4xl space-y-6">
        <div>
            <h1 class="text-3xl font-bold tracking-tight">User Profile</h1>
            <p class="text-muted-foreground mt-1 text-lg">Manage your account information and security settings.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Left: Profile Info -->
            <div class="md:col-span-1 space-y-6">
                <Card class="border-t-4 border-t-primary shadow-sm bg-card/50 backdrop-blur-sm">
                    <CardHeader class="pb-2">
                        <div
                            class="flex items-center justify-center p-6 mb-2 rounded-full bg-primary/10 mx-auto w-24 h-24 border-2 border-primary/20">
                            <User class="size-12 text-primary" />
                        </div>
                        <CardTitle class="text-center text-xl mt-2">{{ user?.displayName || 'Unknown User' }}
                        </CardTitle>
                        <CardDescription class="text-center flex flex-col items-center justify-center gap-2 mt-1">
                            <span class="flex items-center gap-1"><Mail class="size-3" /> {{ user?.email }}</span>
                            <div v-if="!isEmailVerified" class="flex flex-col items-center gap-2 mt-2 w-full">
                                <Badge variant="outline" class="text-[10px] text-orange-600 border-orange-200 bg-orange-50 uppercase font-bold">
                                    Email Unverified
                                </Badge>
                                <Button variant="link" size="sm" @click="handleSendVerificationEmail" :disabled="verificationLoading" class="text-xs h-auto p-0 text-orange-700 hover:text-orange-800 underline">
                                    {{ verificationLoading ? 'Sending...' : 'Send verification link' }}
                                </Button>
                            </div>
                            <Badge v-else variant="outline" class="text-[10px] text-green-600 border-green-200 bg-green-50 uppercase font-bold">
                                <CheckCircle2 class="size-3 mr-1" /> Verified Email
                            </Badge>
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-4 pt-4 border-t border-border/50">
                        <div class="space-y-2">
                            <Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account
                                Status</Label>
                            <div class="flex items-center gap-2 mt-1">
                                <Badge :variant="isActive ? 'default' : 'destructive'" class="px-3 py-1 text-xs">
                                    <CheckCircle2 v-if="isActive" class="size-3 mr-1" />
                                    <XCircle v-else class="size-3 mr-1" />
                                    {{ isActive ? 'Active' : 'Deactivated' }}
                                </Badge>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <Label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned
                                Roles</Label>
                            <div class="flex flex-wrap gap-2 mt-1">
                                <Badge v-for="role in roles" :key="role" variant="secondary"
                                    class="bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                                    <Shield class="size-3 mr-1" /> {{ ROLE_LABELS[role] || role }}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- Right: Settings -->
            <div class="md:col-span-2 space-y-6">
                <!-- Identity Card -->
                <Card class="shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2">
                            <User class="size-5 text-blue-500" /> Account Details
                        </CardTitle>
                        <CardDescription>Your registered identity information.</CardDescription>
                    </CardHeader>
                    <CardContent class="grid gap-6">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <Label class="text-muted-foreground">Full Name</Label>
                                <div class="p-3 bg-muted rounded-md font-medium">{{ user?.displayName || 'Not provided'
                                    }}</div>
                            </div>
                            <div class="space-y-2">
                                <Label class="text-muted-foreground">Email Address</Label>
                                <div class="p-3 bg-muted rounded-md font-medium">{{ user?.email }}</div>
                            </div>
                        </div>
                        <div
                            class="p-4 bg-blue-50/50 border border-blue-100 rounded-lg dark:bg-blue-900/10 dark:border-blue-900/40">
                            <p class="text-sm text-blue-800 dark:text-blue-300 flex gap-2">
                                <Shield class="size-4 shrink-0 mt-0.5" />
                                <span>Your roles and status are managed by administrators. If you believe your roles are
                                    incorrect, please contact your system administrator.</span>
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <!-- Security Card -->
                <Card class="shadow-sm border-l-4 border-l-orange-500 overflow-hidden">
                    <!-- ... existing Change Password card content ... -->
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2">
                            <KeyRound class="size-5 text-orange-500" /> Change Password
                        </CardTitle>
                        <CardDescription>Keep your account secure by updating your password regularly.</CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <div v-if="isReauthNeeded" class="space-y-2">
                            <Label for="current-password">Current Password</Label>
                            <Input id="current-password" v-model="passwordForm.currentPassword" type="password"
                                placeholder="Enter current password for verification" />
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <Label for="new-password">New Password</Label>
                                <Input id="new-password" v-model="passwordForm.newPassword" type="password"
                                    placeholder="At least 6 characters" />
                            </div>
                            <div class="space-y-2">
                                <Label for="confirm-password">Confirm New Password</Label>
                                <Input id="confirm-password" v-model="passwordForm.confirmPassword" type="password"
                                    placeholder="Repeat new password" />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter class="bg-muted/30 border-t py-4 flex justify-end">
                        <Button @click="handleUpdatePassword"
                            :disabled="passwordForm.loading || !passwordForm.newPassword"
                            class="bg-orange-600 hover:bg-orange-700 text-white">
                            <span v-if="passwordForm.loading" class="animate-spin mr-2">⏳</span>
                            Update Password
                        </Button>
                    </CardFooter>
                </Card>

                <!-- Two-Factor Authentication Card -->
                <Card class="shadow-sm border-l-4 border-l-green-600 overflow-hidden">
                    <CardHeader>
                        <CardTitle class="flex items-center gap-2 text-green-700 dark:text-green-400">
                            <Shield class="size-5" /> Two-Factor Authentication
                        </CardTitle>
                        <CardDescription>Protect your account with an extra layer of security via SMS.</CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-6">
                        <div v-if="!isEmailVerified" class="p-6 border-2 border-dashed border-orange-200 bg-orange-50/30 rounded-xl flex flex-col items-center text-center space-y-3">
                            <Mail class="size-10 text-orange-500 animate-bounce" />
                            <div class="space-y-1">
                                <h3 class="font-bold text-orange-900">Email Verification Required</h3>
                                <p class="text-xs text-orange-800/70 max-w-[280px]">You must verify your email address before you can enable two-factor authentication.</p>
                            </div>
                            <Button @click="handleSendVerificationEmail" :disabled="verificationLoading" class="bg-orange-600 hover:bg-orange-700 text-white font-bold">
                                {{ verificationLoading ? 'Sending...' : 'Verify Email Now' }}
                            </Button>
                        </div>

                        <div v-else-if="isMfaEnabled" class="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/10 dark:border-green-800/40">
                            <div class="flex items-center gap-3">
                                <div class="size-10 rounded-full bg-green-100 flex items-center justify-center dark:bg-green-900/40">
                                    <CheckCircle2 class="size-6 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <p class="font-bold text-green-800 dark:text-green-300">MFA is Active</p>
                                    <p class="text-xs text-green-700/70 dark:text-green-400/70">A code will be required whenever you sign in from a new device.</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" @click="disableMfa" :disabled="mfaLoading" class="border-green-200 hover:bg-green-100 text-green-700 dark:border-green-800 dark:hover:bg-green-900/40 dark:text-green-400">
                                <span v-if="mfaLoading" class="animate-spin mr-2">⏳</span>
                                Disable MFA
                            </Button>
                        </div>

                        <div v-else-if="!isEnrolling" class="space-y-4">
                            <div class="p-4 bg-muted/50 rounded-lg text-sm space-y-2 border">
                                <p class="font-medium">Why enable MFA?</p>
                                <p class="text-muted-foreground text-xs leading-relaxed">Even if someone discovers your password, they won't be able to access your account without the unique code sent to your mobile phone.</p>
                            </div>
                            <div class="space-y-2">
                                <Label for="phone-number">Mobile Phone Number</Label>
                                <div class="flex gap-2">
                                    <Input id="phone-number" v-model="phoneNumber" placeholder="+263..." class="flex-1" />
                                    <Button @click="startEnrollment" :disabled="mfaLoading || !phoneNumber" class="bg-green-600 hover:bg-green-700 text-white shrink-0 px-6">
                                        <span v-if="mfaLoading" class="animate-spin mr-2">⏳</span>
                                        Verify Phone
                                    </Button>
                                </div>
                                <p class="text-[10px] text-muted-foreground">Include country code (e.g., +263...)</p>
                            </div>
                        </div>

                        <div v-else class="space-y-4 animate-in fade-in slide-in-from-top-2">
                            <div class="p-4 bg-blue-50 border border-blue-100 rounded-lg dark:bg-blue-900/10 dark:border-blue-800/40">
                                <p class="text-sm font-semibold text-blue-800 dark:text-blue-300">Verification Code Sent</p>
                                <p class="text-xs text-blue-700 dark:text-blue-400">We've sent a 6-digit code to {{ phoneNumber }}.</p>
                            </div>
                            <div class="space-y-2">
                                <Label for="verification-code">6-Digit Code</Label>
                                <div class="flex gap-2">
                                    <Input id="verification-code" v-model="verificationCode" placeholder="000000" class="flex-1 tracking-widest text-center text-lg font-bold" />
                                    <Button @click="finishEnrollment" :disabled="mfaLoading || !verificationCode" class="bg-green-600 hover:bg-green-700 text-white shrink-0 px-6">
                                        <span v-if="mfaLoading" class="animate-spin mr-2">⏳</span>
                                        Enable MFA
                                    </Button>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" @click="isEnrolling = false" class="text-muted-foreground hover:text-foreground">
                                Cancel and use a different number
                            </Button>
                        </div>
                        
                        <div id="recaptcha-container"></div>
                    </CardContent>
                </Card>

            </div>
        </div>
    </div>
</template>
