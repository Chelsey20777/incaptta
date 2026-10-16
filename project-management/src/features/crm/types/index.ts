export type CreditTransactionType =
  | 'DEPOSIT'    // client adds funds
  | 'APPLIED'    // credit used against invoice
  | 'ADJUSTMENT' // manual correction by admin

export type CreditPaymentMethod =
  | 'BANK'
  | 'ECOCASH'
  | 'CASH'

export interface ClientCreditAccount {
  id: string                    // same as clientId
  clientId: string
  clientName: string
  balance: number               // current credit balance
                                // NEVER negative
  currency: 'USD' | 'ZWL' | 'ZAR'
  totalDeposited: number        // lifetime deposits
  totalApplied: number          // lifetime applied to invoices
  createdAt: any                // Timestamp
  updatedAt: any                // Timestamp
}

export interface ClientCreditTransaction {
  id: string
  clientId: string
  clientName: string
  type: CreditTransactionType
  amount: number                // always positive
  balanceBefore: number
  balanceAfter: number
  paymentMethod?: CreditPaymentMethod  // DEPOSIT only
  jobCardId?: string | null     // APPLIED only
  jobCardNumber?: string | null // denormalized
  invoiceAmount?: number        // APPLIED only — original
                                // invoice total
  reference: string             // receipt/ref number
  notes: string
  createdBy: string             // uid
  createdByName: string         // denormalized
  createdAt: any                // Timestamp
}