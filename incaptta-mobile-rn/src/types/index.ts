// Approval States
export type ApprovalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'COMPLETED' | 'REJECTED';

// User Roles
export type UserRole = 'admin' | 'manager' | 'finance' | 'hr' | 'employee';

// User Profile
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  roles: UserRole | UserRole[];
  department?: string;
  createdAt: Date;
}

// Job Card
export interface JobCard {
  id: string;
  jobNumber: string;
  title: string;
  description: string;
  client: string;
  status: ApprovalStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  irdRevenue?: number;
  twidAmount?: number;
  commissionPercentage?: number;
}

// Task
export interface Task {
  id: string;
  jobCardId: string;
  title: string;
  description: string;
  assignedTo: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// OpEx (Operating Expense)
export interface OpEx {
  id: string;
  description: string;
  category: string;
  amount: number;
  status: ApprovalStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  date?: Date;
}

// Fund Transfer
export interface FundTransfer {
  id: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  description: string;
  status: ApprovalStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

// Financial Calculation Result
export interface FinancialCalculation {
  irdRevenue: number;
  netProfit: number;
  twidAmount: number;
  totalRevenue: number;
  totalExpenses: number;
}
