<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth } from '@/lib/firebase'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Eye, EyeOff, ShieldCheck, ArrowLeft, Smartphone } from 'lucide-vue-next'
import BrandLogo from '@/components/BrandLogo.vue'
import { 
  getMultiFactorResolver, 
  PhoneAuthProvider, 
  PhoneMultiFactorGenerator,
  RecaptchaVerifier
} from 'firebase/auth'

const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

const handleLogin = async () => {
  if (!email.value || !password.value) {
    error.value = 'Please enter both email and password.'
    return
  }

  loading.value = true
  error.value = ''
  
  try {
    await signInWithEmailAndPassword(auth, email.value, password.value)
    router.push('/')
  } catch (err: any) {
    console.error('Login error:', err)
    
    if (err.code === 'auth/multi-factor-auth-required') {
        activeMfaResolver = getMultiFactorResolver(auth, err)
        const resolver = activeMfaResolver
        
        // Auto-trigger code for the first phone factor
        const phoneHint = resolver.hints[0]
        if (phoneHint && phoneHint.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
            await setupRecaptcha()
            const phoneAuthProvider = new PhoneAuthProvider(auth)
            
            const phoneInfoOptions = {
                multiFactorHint: phoneHint,
                session: resolver.session
            }
            mfaVerificationId.value = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier.value)
            isMfaStep.value = true
            return
        }
    }
    
    error.value = err.message || 'Failed to login. Please check your credentials.'
  } finally {
    loading.value = false
  }
}

// ── Multi-Factor Authentication (MFA) ───────────────────────────────────────
const isMfaStep = ref(false)
const mfaCode = ref('')
let activeMfaResolver: any = null // Use a plain variable instead of a ref
const mfaVerificationId = ref('')
const recaptchaVerifier = ref<any>(null)

async function setupRecaptcha() {
    if (recaptchaVerifier.value) return
    recaptchaVerifier.value = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
    })
}

async function handleMfaLogin() {
    if (!mfaCode.value) return
    loading.value = true
    error.value = ''
    try {
        const cred = PhoneAuthProvider.credential(mfaVerificationId.value, mfaCode.value)
        const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred)
        
        // Use the plain variable to complete the sign-in
        if (!activeMfaResolver) {
            throw new Error('MFA session expired. Please log in again.')
        }

        // Try the standard method or the fallback found in logs
        if (typeof activeMfaResolver.resolveWithMultiFactor === 'function') {
            await activeMfaResolver.resolveWithMultiFactor(multiFactorAssertion)
        } else if (typeof activeMfaResolver.signInResolver === 'function') {
            await activeMfaResolver.signInResolver(multiFactorAssertion)
        } else {
            throw new Error('Internal MFA Error: No resolution method found.')
        }
        router.push('/')
    } catch (err: any) {
        console.error('MFA Login error:', err)
        error.value = err.message || 'Invalid verification code.'
    } finally {
        loading.value = false
    }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-muted/30 p-4">
    <Card class="w-full max-w-md">
      <CardHeader class="space-y-4">
        <div class="flex justify-center">
          <div class="size-16 rounded-xl bg-primary/10 flex items-center justify-center p-3 animate-in zoom-in duration-500">
            <BrandLogo />
          </div>
        </div>
        <CardTitle class="text-3xl font-bold text-center tracking-tighter uppercase">
          <span class="text-brand-primary">INCAPTTA</span><span class="text-brand-secondary">PRO</span>
        </CardTitle>
        <CardDescription class="text-center">
          {{ isMfaStep ? 'Enter the verification code sent to your phone' : 'Enter your credentials to access the project management portal' }}
        </CardDescription>
      </CardHeader>
      
      <!-- Password Step -->
      <form v-if="!isMfaStep" @submit.prevent="handleLogin">
        <CardContent class="space-y-4">
          <Alert v-if="error" variant="destructive">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
          
          <div class="space-y-2">
            <Label for="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="name@example.com" 
              v-model="email" 
              required 
            />
          </div>
          <div class="space-y-2">
            <Label for="password">Password</Label>
            <div class="relative">
              <Input 
                id="password" 
                :type="showPassword ? 'text' : 'password'" 
                v-model="password" 
                required 
                class="pr-10"
              />
              <button 
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                @click="showPassword = !showPassword"
              >
                <Eye v-if="!showPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button class="w-full" type="submit" :disabled="loading">
            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </Button>
        </CardFooter>
      </form>

      <!-- MFA Step -->
      <form v-else @submit.prevent="handleMfaLogin">
        <CardContent class="space-y-6 pt-4">
          <Alert v-if="error" variant="destructive">
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>

          <div class="flex flex-col items-center justify-center space-y-4 py-4">
            <div class="size-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Smartphone class="size-8 text-primary" />
            </div>
            <div class="text-center space-y-1">
                <p class="font-bold text-lg">Check your phone</p>
                <p class="text-xs text-muted-foreground">We've sent a code to your registered mobile number</p>
            </div>
          </div>
          
          <div class="space-y-2">
            <Label for="mfa-code" class="text-center block text-xs font-bold uppercase tracking-widest text-muted-foreground">Verification Code</Label>
            <Input 
              id="mfa-code" 
              type="text" 
              placeholder="000000" 
              v-model="mfaCode" 
              required 
              maxlength="6"
              class="text-center text-2xl font-black tracking-[1em] h-14"
              autofocus
            />
          </div>
        </CardContent>
        <CardFooter class="flex flex-col gap-3">
          <Button class="w-full h-11 text-lg font-bold" type="submit" :disabled="loading || mfaCode.length < 6">
            <Loader2 v-if="loading" class="mr-2 h-5 w-5 animate-spin" />
            {{ loading ? 'Verifying...' : 'Confirm Code' }}
          </Button>
          <Button variant="ghost" size="sm" class="w-full text-muted-foreground" @click="isMfaStep = false" :disabled="loading">
            <ArrowLeft class="mr-2 size-4" /> Back to Login
          </Button>
        </CardFooter>
      </form>

      <div id="recaptcha-container"></div>
    </Card>
  </div>
</template>
