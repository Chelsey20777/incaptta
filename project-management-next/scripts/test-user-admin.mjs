import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertAssignableRoles,
  assertRoleUpdate,
  mapAuthError,
  sanitizeUserRoles,
  UserAdminError,
} from '../src/lib/server/user-admin.ts'

test('PMO role is kept and unknown roles are dropped', () => {
  assert.deepEqual(sanitizeUserRoles(['STOREKEEPER', 'NOT_A_ROLE', 'STOREKEEPER']), ['STOREKEEPER'])
  assert.deepEqual(sanitizeUserRoles(['technical']), [])
})

test('an empty role list is rejected instead of becoming Technical', () => {
  assert.throws(
    () => assertAssignableRoles([], ['ADMIN']),
    (err) => err instanceof UserAdminError && err.status === 400 && /valid role/.test(err.message),
  )
  assert.throws(
    () => assertAssignableRoles(['NOPE'], ['ADMIN']),
    (err) => err instanceof UserAdminError && err.status === 400,
  )
})

test('only a super admin can assign or revoke SUPER_ADMIN', () => {
  assert.deepEqual(assertAssignableRoles(['STOREKEEPER'], ['ADMIN']), ['STOREKEEPER'])
  assert.throws(
    () => assertAssignableRoles(['SUPER_ADMIN'], ['ADMIN']),
    (err) => err instanceof UserAdminError && err.status === 403 && /assign the SUPER_ADMIN/.test(err.message),
  )
  assert.deepEqual(assertAssignableRoles(['SUPER_ADMIN'], ['SUPER_ADMIN']), ['SUPER_ADMIN'])
  assert.throws(
    () => assertRoleUpdate(['ADMIN'], ['ADMIN'], ['SUPER_ADMIN']),
    (err) => err instanceof UserAdminError && err.status === 403 && /revoke/.test(err.message),
  )
  assert.deepEqual(assertRoleUpdate(['MANAGER'], ['ADMIN'], ['STOREKEEPER']), ['MANAGER'])
})

test('auth errors use the messages shown in the invite dialog', () => {
  assert.deepEqual(mapAuthError({ code: 'auth/email-already-exists' }), {
    message: 'Email already exists.',
    status: 409,
  })
  assert.equal(mapAuthError({ code: 'auth/weak-password' }).message, 'The password must be at least 6 characters long.')
  assert.equal(mapAuthError({ code: 'auth/invalid-email' }).message, 'The email address is badly formatted.')
})
