import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canPostJobCardAdHocAutoApproval,
  isJobCardAdHocAutoEligible,
} from '../src/lib/job-card-expense-approval.ts'

test('only active accountant and administrator roles can auto-post', () => {
  for (const role of ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN']) {
    assert.equal(canPostJobCardAdHocAutoApproval({ isActive: true, roles: [role] }), true, role)
  }
  assert.equal(canPostJobCardAdHocAutoApproval({ isActive: true, roles: 'ACCOUNTANT' }), true)
  assert.equal(canPostJobCardAdHocAutoApproval({ isActive: true, roles: ['SALES', 'ACCOUNTANT'] }), true)
})

test('non-accountants and inactive users cannot auto-post', () => {
  for (const role of ['SALES', 'MANAGER', 'DIRECTOR', 'TECHNICAL', 'STOREKEEPER']) {
    assert.equal(canPostJobCardAdHocAutoApproval({ isActive: true, roles: [role] }), false, role)
  }
  assert.equal(canPostJobCardAdHocAutoApproval({ isActive: false, roles: ['ACCOUNTANT'] }), false)
  assert.equal(canPostJobCardAdHocAutoApproval({ roles: ['ACCOUNTANT'] }), false)
  assert.equal(canPostJobCardAdHocAutoApproval({ isActive: true, roles: [] }), false)
  assert.equal(canPostJobCardAdHocAutoApproval({ isActive: true, roles: ['accountant'] }), false)
})

test('only positive amounts strictly below $200 qualify', () => {
  for (const amount of [0.01, 199, 199.99]) assert.equal(isJobCardAdHocAutoEligible(amount), true)
  for (const amount of [0, -1, 200, 200.01, NaN, Infinity]) {
    assert.equal(isJobCardAdHocAutoEligible(amount), false, String(amount))
  }
})
