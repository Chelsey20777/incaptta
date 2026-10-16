export enum ExpenseCategory {
  // 1. Operational & Job Cards
  JOB_CARD_EXPENSE = 'Job Card Expense',
  SUBCONTRACTOR_EXPENSE = 'Subcontractor Expense',
  OPERATIONAL_EXPENSE = 'Operational Expense',

  // 2. HR & Payroll
  SALARIES_AND_WAGES = 'Salaries & Wages',
  STATUTORY_LIABILITIES = 'Statutory Liabilities',

  // 3. Inventory & COGS
  COST_OF_SALES = 'Cost of Sales',

  // 4. Standard Administrative & Opex
  ADMINISTRATIVE = 'Administrative',
  MARKETING_AND_SALES = 'Marketing & Sales',
  UTILITIES_AND_OVERHEADS = 'Utilities & Overheads',
  REPAIRS_AND_MAINTENANCE = 'Repairs & Maintenance',
  TRAVEL_AND_TRANSPORT = 'Travel & Transport',
  LEGAL_AND_PROFESSIONAL = 'Legal & Professional',

  // 5. Fallback
  UNCATEGORIZED = 'Uncategorized'
}

export type ExpenseCategoryType = `${ExpenseCategory}`;

export interface AuditActorRef {
  uid: string;           // 'system:policy-engine' | 'system:workflow-engine' | user.uid
  displayName: string;   // 'System Auto-Approval Engine' | 'Job Card Workflow Engine' | user.displayName
  email: string;         // 'system@incaptta.internal' | user.email
  actorType: 'USER' | 'SYSTEM_ROBOT';
  actionType: 'MANUAL_APPROVAL' | 'POLICY_BYPASS_UNDER_300' | 'WORKFLOW_BYPASS_JOBCARD';
  timestamp: string;     // ISO timestamp string
  policyRef?: string;    // e.g. 'POLICY-OPEX-THRESHOLD-300-USD' | 'POLICY-JOBCARD-ADHOC-EXEC'
}
