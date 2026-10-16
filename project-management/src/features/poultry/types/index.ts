export interface PoultryFlock {
  id: string;
  batchName: string;
  breed: string; 
  initialQuantity: number;
  currentQuantity: number;
  startDate: Date;
  estimatedHarvestDate: Date;
  assignedStaffIds: string[]; 
  status: 'ACTIVE' | 'ON_MARKET' | 'CLOSED';
  unitCost: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PoultryInventoryItem {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalValue: number;
  minStockLevel: number;
  type: 'FEED' | 'MEDICINE' | 'VACCINE' | 'OTHER';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PoultryDailyLog {
  id: string;
  flockId: string;
  date: Date;
  mortality: number;
  feedConsumed: number;
  feedItemId?: string; // Optional, to deduct from inventory
  waterConsumed?: number;
  eggCount?: number; // Optional, for layers
  notes?: string;
  loggedBy: string; 
  createdAt?: Date;
}

export interface PoultrySale {
  id: string;
  flockId: string;
  date: Date;
  quantitySold: number;
  totalWeight?: number;
  unitPrice: number;
  totalRevenue: number;
  buyerName: string;
  recordedBy: string;
  createdAt?: Date;
}
