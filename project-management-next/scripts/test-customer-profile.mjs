import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertCustomerCanReceiveInvoice,
  isCrmStaff,
  isLeadConvertedToCustomer,
  mapLeadToCustomerInput,
  normalizeCustomerProfile,
  recordBelongsToCustomer,
  sensitiveCustomerChanges,
} from '../src/lib/customer-profile.ts'

const base = { name: ' Acme Farms ', customerType: 'COMPANY', status: 'ACTIVE', creditLimit: 200 }

test('lead mapping copies enquiry details into an ACTIVE customer profile', () => {
  const company = mapLeadToCustomerInput({
    partyType: 'business',
    companyName: 'Golden Leaf',
    contactName: 'Ada',
    email: 'ada@example.com',
    phone: '0771',
    requirementSummary: 'Tank install',
  }, { address: '1 Farm Rd', taxId: 'VAT-1' })
  assert.equal(company.name, 'Golden Leaf')
  assert.equal(company.customerType, 'COMPANY')
  assert.equal(company.primaryContactName, 'Ada')
  assert.equal(company.email, 'ada@example.com')
  assert.equal(company.address, '1 Farm Rd')
  assert.equal(company.taxId, 'VAT-1')
  assert.equal(company.status, 'ACTIVE')
  assert.equal(company.notes, 'Tank install')

  const individual = mapLeadToCustomerInput({
    partyType: 'individual',
    contactName: 'Jane Doe',
    companyName: '',
    email: 'jane@example.com',
  })
  assert.equal(individual.name, 'Jane Doe')
  assert.equal(individual.customerType, 'INDIVIDUAL')
  assert.equal(individual.primaryContactName, '')
  assert.equal(isLeadConvertedToCustomer({ identityStatus: 'PROSPECT' }), false)
  assert.equal(isLeadConvertedToCustomer({ customerId: 'cust_1' }), true)
  assert.equal(isLeadConvertedToCustomer({ identityStatus: 'CUSTOMER' }), true)
})

test('new company and individual profiles validate and normalize', () => {
  const company = normalizeCustomerProfile({ ...base, email: ' SALES@EXAMPLE.COM ', primaryContactName: ' Alex ' }, true)
  assert.equal(company.name, 'Acme Farms')
  assert.equal(company.email, 'sales@example.com')
  assert.equal(company.primaryContactName, 'Alex')
  assert.equal(company.customerType, 'COMPANY')
  assert.equal(normalizeCustomerProfile({ name: 'Jane Doe', customerType: 'INDIVIDUAL' }, true).customerType, 'INDIVIDUAL')
  assert.throws(() => normalizeCustomerProfile({ name: 'Legacy' }, true), /Choose Company or Individual/)
  assert.equal(normalizeCustomerProfile({ name: 'Legacy' }, false).customerType, undefined)
})

test('invalid profile values are rejected', () => {
  assert.throws(() => normalizeCustomerProfile({ ...base, name: ' ' }, true), /name is required/)
  assert.throws(() => normalizeCustomerProfile({ ...base, email: 'invalid' }, true), /valid email/)
  assert.throws(() => normalizeCustomerProfile({ ...base, creditLimit: -1 }, true), /Credit limit/)
  assert.throws(() => normalizeCustomerProfile({ ...base, status: 'UNKNOWN' }, true), /status/)
})

test('only active customers may receive newly issued invoices', () => {
  assert.doesNotThrow(() => assertCustomerCanReceiveInvoice('ACTIVE'))
  assert.doesNotThrow(() => assertCustomerCanReceiveInvoice(undefined))
  for (const status of ['INACTIVE', 'BLACKLISTED']) {
    assert.throws(() => assertCustomerCanReceiveInvoice(status), /Only ACTIVE/)
  }
})

test('ID links take precedence over name-only legacy matches', () => {
  assert.equal(recordBelongsToCustomer({ customerId: 'one', customerName: 'Same' }, 'one', 'Same', true), true)
  assert.equal(recordBelongsToCustomer({ customerId: 'two', customerName: 'Same' }, 'one', 'Same', true), false)
  assert.equal(recordBelongsToCustomer({ customerName: 'Same' }, 'one', 'Same', true), true)
  assert.equal(recordBelongsToCustomer({ customerName: 'Same' }, 'one', 'Same', false), false)
})

test('sensitive changes are audit-worthy and CRM roles are explicit', () => {
  const after = normalizeCustomerProfile({ ...base, status: 'INACTIVE', creditLimit: 300 }, true)
  assert.deepEqual(sensitiveCustomerChanges({ status: 'ACTIVE', creditLimit: 200 }, after), {
    status: { before: 'ACTIVE', after: 'INACTIVE' },
    creditLimit: { before: 200, after: 300 },
  })
  assert.deepEqual(sensitiveCustomerChanges({ status: 'INACTIVE', creditLimit: 300 }, after), {})
  for (const role of ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'DIRECTOR', 'SALES', 'ACCOUNTANT', 'TECHNICAL']) {
    assert.equal(isCrmStaff([role]), true, role)
  }
  assert.equal(isCrmStaff(['STOREKEEPER']), false)
})
