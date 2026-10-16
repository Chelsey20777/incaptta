export type PaymentMethod = 'CASH' | 'ECOCASH' | 'BANK'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'ECOCASH', label: 'EcoCash' },
    { value: 'BANK', label: 'Bank' }
]
