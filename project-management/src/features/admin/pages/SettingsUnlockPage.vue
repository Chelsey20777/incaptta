<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, LockKeyhole, ShieldAlert } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'
import {
  grantManagerInventoryPinAccess,
  isInventoryManagerPinEnabled,
  isManagerInventoryPinUnlocked,
  verifyInventoryManagerPin
} from '@/features/inventory/utils/inventoryAccessPin'

const route = useRoute()
const router = useRouter()
const { user, roles, loading } = useSession()

const pin = ref('')
const checking = ref(true)
const submitting = ref(false)
const pinEnabled = ref(false)

const isRestrictedManager = computed(() => {
  const roleList = roles.value || []
  return roleList.includes('MANAGER') && !roleList.includes('SUPER_ADMIN')
})

const redirectTarget = computed(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/admin'
  return redirect.startsWith('/admin') ? redirect : '/admin'
})

async function resolveAccessState() {
  if (loading.value) return

  if (!isRestrictedManager.value) {
    router.replace(redirectTarget.value)
    return
  }

  if (isManagerInventoryPinUnlocked(user.value?.uid)) {
    router.replace(redirectTarget.value)
    return
  }

  pinEnabled.value = await isInventoryManagerPinEnabled()

  if (!pinEnabled.value) {
    router.replace(redirectTarget.value)
    return
  }

  checking.value = false
}

async function handleUnlock() {
  if (!pin.value.trim()) {
    toast.error('PIN required', { description: 'Enter the settings access PIN to continue.' })
    return
  }

  submitting.value = true
  try {
    const isValid = await verifyInventoryManagerPin(pin.value)
    if (!isValid) {
      toast.error('Invalid PIN', { description: 'The inventory access PIN is incorrect.' })
      pin.value = ''
      return
    }

    grantManagerInventoryPinAccess(user.value?.uid)
    toast.success('Settings unlocked')
    router.replace(redirectTarget.value)
  } catch (err: any) {
    toast.error('Unlock failed', { description: err.message || 'Unable to verify the inventory PIN.' })
  } finally {
    submitting.value = false
  }
}

watch([loading, roles], () => {
  resolveAccessState()
}, { immediate: true })
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center px-4">
    <div v-if="loading || checking" class="flex flex-col items-center gap-3 text-center">
      <Loader2 class="size-8 animate-spin text-primary" />
      <p class="text-sm text-muted-foreground">Checking settings access...</p>
    </div>

    <Card v-else class="w-full max-w-md border-brand-primary/20 shadow-xl">
      <CardHeader class="space-y-3">
        <div class="flex items-center gap-2 text-brand-primary">
          <LockKeyhole class="size-5" />
          <span class="text-xs font-black uppercase tracking-[0.2em]">Restricted Access</span>
        </div>
        <CardTitle class="text-2xl">Unlock Settings</CardTitle>
        <CardDescription>
          Managers must enter the inventory PIN before opening the settings page.
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-5">
        <div class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          <div class="flex items-start gap-2">
            <ShieldAlert class="mt-0.5 size-4 text-amber-500" />
            <p>This unlock stays active for your current browser session.</p>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="settings-pin">Inventory PIN</Label>
          <Input
            id="settings-pin"
            v-model="pin"
            type="password"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="Enter inventory PIN"
            @keyup.enter="handleUnlock"
          />
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button variant="ghost" @click="router.push('/')">Cancel</Button>
          <Button @click="handleUnlock" :disabled="submitting">
            <Loader2 v-if="submitting" class="mr-2 size-4 animate-spin" />
            Unlock Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
