<script setup lang="ts">
import { ref, reactive } from 'vue'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { UserPlus, UserCheck, UserX, Shield, Mail, User, Edit, Trash2 } from 'lucide-vue-next'
import { useAdminStore } from '../store/adminStore'
import { useSession } from '@/composables/useSession'
import { USER_ROLES, ROLE_LABELS, type UserRole } from '@/constants/roles'

defineProps<{
  users: any[]
  isAdmin?: boolean
}>()

const store = useAdminStore()
const { refreshSession, user: currentUser } = useSession()

const isRoleDialogOpen = ref(false)
const isCreateDialogOpen = ref(false)
const isProfileDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const userToDelete = ref<any>(null)

const selectedUser = ref<any>(null)
const selectedRoles = ref<UserRole[]>([])

const selectedProfileData = reactive({
  id: '',
  name: ''
})

const newUser = reactive({
  name: '',
  email: '',
  password: '',
  isActive: true,
  roles: [] as UserRole[]
})

function openRoleEdit(user: any) {
  selectedUser.value = user
  selectedRoles.value = [...(user.roles || [])]
  isRoleDialogOpen.value = true
}

function openProfileEdit(user: any) {
  selectedProfileData.id = user.id
  selectedProfileData.name = user.name || ''
  isProfileDialogOpen.value = true
}

async function handleSaveProfile() {
  if (!selectedProfileData.id) return
  await store.saveEntity('users', { id: selectedProfileData.id, name: selectedProfileData.name }, 'User Profile')
  isProfileDialogOpen.value = false
}

async function handleSaveRoles() {
  if (selectedUser.value) {
    await store.updateUserRole(selectedUser.value.id, selectedRoles.value)
    // If the admin is updating their own roles, refresh their session claims immediately
    if (currentUser.value && (currentUser.value.uid === selectedUser.value.id || currentUser.value.email === selectedUser.value.email)) {
      await refreshSession()
    }
    isRoleDialogOpen.value = false
  }
}

async function handleCreateUser() {
  if (!newUser.name || !newUser.email) return

  // Default to ['TECHNICAL'] if no roles selected, ensuring backend validation passes
  const rolesToSend = newUser.roles.length > 0 ? [...newUser.roles] : ['TECHNICAL']

  await store.createUserWithPassword({
    name: newUser.name,
    email: newUser.email,
    password: newUser.password || undefined,
    roles: rolesToSend as string[],
    isActive: newUser.isActive
  })

  isCreateDialogOpen.value = false
  // Reset form
  newUser.name = ''
  newUser.email = ''
  newUser.password = ''
  newUser.roles = []
}

async function toggleStatus(user: any) {
  await store.toggleUserStatus(user.id, !user.isActive)
}

function openDeleteConfirm(user: any) {
  userToDelete.value = user
  isDeleteDialogOpen.value = true
}

async function handleDeleteUser() {
  if (!userToDelete.value) return
  // Prevent self-deletion
  if (currentUser.value && (currentUser.value.uid === userToDelete.value.id || currentUser.value.email === userToDelete.value.email)) {
    return
  }
  await store.deleteUser(userToDelete.value.id)
  isDeleteDialogOpen.value = false
  userToDelete.value = null
}

</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-lg font-medium">User Accounts</h3>
        <p class="text-sm text-muted-foreground">Manage system users, assigned roles, and account status.</p>
      </div>
      <Button size="sm" class="bg-orange-600 hover:bg-orange-700 text-white border-orange-700"
        @click="isCreateDialogOpen = true">
        <UserPlus class="mr-2 size-4" />
        Invite User
      </Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="user in users" :key="user.id">
              <TableCell class="font-medium">
                <div class="flex items-center gap-2">
                  <User class="size-4 text-muted-foreground" />
                  {{ user.name || 'N/A' }}
                </div>
              </TableCell>
              <TableCell>
                <div class="flex items-center gap-2">
                  <Mail class="size-4 text-muted-foreground" />
                  {{ user.email }}
                </div>
              </TableCell>
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <Badge v-for="role in user.roles" :key="role" variant="secondary" class="text-[10px] uppercase">
                    {{ (ROLE_LABELS as any)[role] || role }}
                  </Badge>
                  <span v-if="!user.roles?.length" class="text-xs text-muted-foreground italic text-[10px]">No
                    roles</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge :variant="user.isActive !== false ? 'default' : 'destructive'">
                  {{ user.isActive !== false ? 'Active' : 'Inactive' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right space-x-2">
                <Button variant="outline" size="sm" @click="openProfileEdit(user)">
                  <Edit class="mr-1 size-3" /> Edit
                </Button>
                <Button variant="outline" size="sm" @click="openRoleEdit(user)">
                  <Shield class="mr-1 size-3" /> Roles
                </Button>
                <Button variant="ghost" size="icon"
                  :class="user.isActive !== false ? 'text-destructive' : 'text-primary'" @click="toggleStatus(user)">
                  <UserX v-if="user.isActive !== false" class="size-4" />
                  <UserCheck v-else class="size-4" />
                </Button>
                <Button
                  v-if="isAdmin && !(currentUser && (currentUser.uid === user.id || currentUser.email === user.email))"
                  variant="ghost"
                  size="icon"
                  class="text-destructive hover:bg-destructive/10"
                  @click="openDeleteConfirm(user)"
                  title="Delete user permanently"
                >
                  <Trash2 class="size-4" />
                </Button>
              </TableCell>
            </TableRow>
            <TableRow v-if="users.length === 0">
              <TableCell colspan="5" class="h-24 text-center text-muted-foreground italic text-sm">
                No users found.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Edit Profile Dialog -->
    <Dialog v-model:open="isProfileDialogOpen">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update the user's name.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="edit-name" class="text-right">Name</Label>
            <Input id="edit-name" v-model="selectedProfileData.name" class="col-span-3" placeholder="Full Name" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isProfileDialogOpen = false">Cancel</Button>
          <Button @click="handleSaveProfile">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Role Management Dialog -->
    <Dialog v-model:open="isRoleDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Roles</DialogTitle>
          <DialogDescription>Assign system roles to {{ selectedUser?.name || selectedUser?.email }}.</DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div v-for="role in (Object.keys(ROLE_LABELS) as UserRole[])" :key="role" class="flex items-center space-x-2">
            <input
              type="checkbox"
              :id="role"
              :value="role"
              v-model="selectedRoles"
              class="size-4 rounded border-input accent-primary cursor-pointer"
            />
            <Label :for="role"
              class="text-sm font-medium leading-none cursor-pointer">
              {{ ROLE_LABELS[role] }} ({{ role }})
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isRoleDialogOpen = false">Cancel</Button>
          <Button @click="handleSaveRoles">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete User Confirmation -->
    <AlertDialog v-model:open="isDeleteDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete User Account</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{{ userToDelete?.name || userToDelete?.email }}</strong>'s account
            from Firebase Auth and Firestore. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDeleteUser"
          >
            Delete Permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Create User Dialog -->
    <Dialog v-model:open="isCreateDialogOpen">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite New User</DialogTitle>
          <DialogDescription>
            Create a user profile and assign roles. The user can then sign up with this email.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="name" class="text-right">Name</Label>
            <Input id="name" v-model="newUser.name" class="col-span-3" placeholder="Full Name" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="email" class="text-right">Email</Label>
            <Input id="email" v-model="newUser.email" class="col-span-3" placeholder="user@example.com" />
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="password" class="text-right">Password</Label>
            <Input id="password" type="password" v-model="newUser.password" class="col-span-3"
              placeholder="Optional - auto generated if empty" />
          </div>
          <div class="space-y-4 pt-4">
            <Label class="text-sm font-semibold">Assign Roles</Label>
            <div class="grid grid-cols-2 gap-2">
              <div v-for="roleKey in (Object.keys(ROLE_LABELS) as UserRole[])" :key="roleKey"
                class="flex items-center space-x-2">
                <input
                  type="checkbox"
                  :id="'new-' + roleKey"
                  :value="roleKey"
                  v-model="newUser.roles"
                  class="size-4 rounded border-input accent-primary cursor-pointer"
                />
                <Label :for="'new-' + roleKey" class="text-xs font-medium leading-none cursor-pointer">
                  {{ ROLE_LABELS[roleKey] }}
                </Label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="isCreateDialogOpen = false">Cancel</Button>
          <Button @click="handleCreateUser">Create Profile</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
