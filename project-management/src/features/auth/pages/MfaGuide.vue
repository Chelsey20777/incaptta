<script setup lang="ts">
import { 
    ShieldCheck, 
    Mail, 
    Smartphone, 
    Lock, 
    RefreshCcw,
    CheckCircle2,
    AlertCircle
} from 'lucide-vue-next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
</script>

<template>
    <div class="max-w-4xl mx-auto space-y-8 pb-12">
        <div class="text-center space-y-2">
            <h1 class="text-3xl font-bold tracking-tight">Security Verification Guide</h1>
            <p class="text-muted-foreground text-lg">Protect your account with Two-Factor Authentication (2FA)</p>
        </div>

        <Alert class="bg-primary/5 border-primary/20">
            <ShieldCheck class="size-5 text-primary" />
            <AlertTitle class="font-bold text-primary">Why use 2FA?</AlertTitle>
            <AlertDescription>
                Two-factor authentication adds an extra layer of security to your account. Even if someone knows your password, they won't be able to access your account without your physical phone.
            </AlertDescription>
        </Alert>

        <div class="grid gap-6">
            <!-- Step 1 -->
            <Card class="relative overflow-hidden border-l-4 border-l-blue-500">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div class="size-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold">1</div>
                        <div>
                            <CardTitle>Email Verification</CardTitle>
                            <CardDescription>MFA requires a verified email address to start.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <div class="flex gap-4">
                        <div class="shrink-0 pt-1">
                            <Mail class="size-6 text-blue-500" />
                        </div>
                        <div class="space-y-2">
                            <p class="text-sm leading-relaxed">
                                Go to your <strong>Profile</strong> page. If your email is not verified, you will see a <span class="text-blue-500 font-semibold">"Verify Email Now"</span> button. 
                            </p>
                            <ul class="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                <li>Click the button to send a verification link to your inbox.</li>
                                <li>Open your email and click the link from IncapttaPro.</li>
                                <li><strong>Important:</strong> After verifying, you must refresh your browser tab for the app to see the status.</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <!-- Step 2 -->
            <Card class="relative overflow-hidden border-l-4 border-l-orange-500">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div class="size-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold">2</div>
                        <div>
                            <CardTitle>Enrolling your Phone</CardTitle>
                            <CardDescription>Link your mobile device to your account.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <div class="flex gap-4">
                        <div class="shrink-0 pt-1">
                            <Smartphone class="size-6 text-orange-500" />
                        </div>
                        <div class="space-y-2">
                            <p class="text-sm leading-relaxed">
                                Once your email is verified, the <strong>Two-Factor Authentication</strong> section will unlock.
                            </p>
                            <ul class="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                <li>Enter your phone number in international format (e.g., +263 7xx xxx xxx).</li>
                                <li>Complete the security check (reCAPTCHA) if prompted.</li>
                                <li>Enter the 6-digit code sent to your phone via SMS.</li>
                                <li>Click "Confirm Code" to finish the setup.</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <!-- Step 3 -->
            <Card class="relative overflow-hidden border-l-4 border-l-green-500">
                <CardHeader>
                    <div class="flex items-center gap-3">
                        <div class="size-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 font-bold">3</div>
                        <div>
                            <CardTitle>Logging In with MFA</CardTitle>
                            <CardDescription>What to expect during your next sign-in.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent class="space-y-4">
                    <div class="flex gap-4">
                        <div class="shrink-0 pt-1">
                            <Lock class="size-6 text-green-500" />
                        </div>
                        <div class="space-y-2">
                            <p class="text-sm leading-relaxed">
                                Next time you log in, after entering your password, you will see a second screen.
                            </p>
                            <div class="bg-muted p-3 rounded-md border text-xs font-mono space-y-1">
                                <p>1. Enter Password</p>
                                <p>2. Receive SMS Code</p>
                                <p>3. Enter 6-digit Code</p>
                                <p>4. Access Dashboard</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Troubleshooting -->
        <Card class="bg-muted/50 border-dashed">
            <CardHeader>
                <div class="flex items-center gap-2">
                    <AlertCircle class="size-5 text-muted-foreground" />
                    <CardTitle class="text-lg">Troubleshooting</CardTitle>
                </div>
            </CardHeader>
            <CardContent class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-1">
                    <h4 class="text-sm font-bold flex items-center gap-2">
                        <RefreshCcw class="size-3" /> Still seeing "Verify Email"?
                    </h4>
                    <p class="text-xs text-muted-foreground italic">Sign out and sign back in to refresh your security session.</p>
                </div>
                <div class="space-y-1">
                    <h4 class="text-sm font-bold flex items-center gap-2">
                        <CheckCircle2 class="size-3" /> Didn't get an SMS?
                    </h4>
                    <p class="text-xs text-muted-foreground italic">Wait 60 seconds and click "Resend". Check that your phone signal is strong.</p>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
