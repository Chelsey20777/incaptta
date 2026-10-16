import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import TabsPage from '../views/TabsPage.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/tabs/dashboard'
  },
  {
    path: '/login',
    component: () => import('@/views/LoginPage.vue')
  },
  {
    path: '/tabs',
    component: TabsPage,
    children: [
      {
        path: '',
        redirect: '/tabs/dashboard'
      },
      // Tab 1: Dashboard
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardPage.vue')
      },
      // Tab 2: Jobs (Job Cards + Tasks)
      {
        path: 'jobs',
        name: 'jobs',
        component: () => import('@/features/jobCards/pages/JobCardsList.vue')
      },
      {
        path: 'jobs/new',
        component: () => import('@/features/jobCards/pages/CreateJobCard.vue')
      },
      {
        path: 'jobs/:id',
        component: () => import('@/features/jobCards/pages/JobCardDetail.vue')
      },
      {
        path: 'jobs/edit/:id',
        component: () => import('@/features/jobCards/pages/EditJobCard.vue')
      },
      {
        path: 'tasks',
        component: () => import('@/features/tasks/pages/TasksList.vue')
      },
      {
        path: 'tasks/new',
        component: () => import('@/features/tasks/pages/CreateTask.vue')
      },
      {
        path: 'tasks/:id',
        component: () => import('@/features/tasks/pages/TaskDetail.vue')
      },
      // Tab 3: Inventory
      {
        path: 'inventory',
        name: 'inventory',
        component: () => import('@/features/inventory/pages/InventoryList.vue')
      },
      {
        path: 'inventory/new',
        component: () => import('@/features/inventory/pages/CreateInventory.vue')
      },
      {
        path: 'inventory/:id',
        component: () => import('@/features/inventory/pages/InventoryDetail.vue')
      },
      {
        path: 'inventory/:id/adjust',
        component: () => import('@/features/inventory/pages/StockAdjustment.vue')
      },
      // Tab 4: CRM
      {
        path: 'crm',
        redirect: '/tabs/crm/customers'
      },
      {
        path: 'crm/customers',
        name: 'crm',
        component: () => import('@/features/crm/pages/CustomersList.vue')
      },
      {
        path: 'crm/customers/new',
        component: () => import('@/features/crm/pages/CreateCustomer.vue')
      },
      {
        path: 'crm/customers/:id',
        component: () => import('@/features/crm/pages/CustomerDetail.vue')
      },
      {
        path: 'crm/quotations',
        component: () => import('@/features/crm/pages/QuotationsList.vue')
      },
      {
        path: 'crm/quotations/new',
        component: () => import('@/features/crm/pages/CreateQuotation.vue')
      },
      {
        path: 'crm/quotations/:id',
        component: () => import('@/features/crm/pages/QuotationDetail.vue')
      },
      {
        path: 'crm/invoices',
        component: () => import('@/features/crm/pages/InvoicesList.vue')
      },
      {
        path: 'crm/invoices/new',
        component: () => import('@/features/crm/pages/CreateInvoice.vue')
      },
      {
        path: 'crm/invoices/:id',
        component: () => import('@/features/crm/pages/InvoiceDetail.vue')
      },
      {
        path: 'crm/fowlrun-calculator',
        component: () => import('@/features/agricStructures/pages/FowlrunCalculator.vue')
      },
      // Tab 5: More (All other modules)
      {
        path: 'more',
        name: 'more',
        component: () => import('@/views/MorePage.vue')
      },
      // Finance & Ledger
      {
        path: 'more/opex',
        component: () => import('@/features/operationalExpenses/pages/OpexList.vue')
      },
      {
        path: 'more/opex/new',
        component: () => import('@/features/operationalExpenses/pages/CreateOpex.vue')
      },
      {
        path: 'more/opex/:id',
        component: () => import('@/features/operationalExpenses/pages/OpexDetail.vue')
      },
      {
        path: 'more/transfers',
        component: () => import('@/features/fundTransfers/pages/TransfersList.vue')
      },
      {
        path: 'more/transfers/new',
        component: () => import('@/features/fundTransfers/pages/TransferFunds.vue')
      },
      {
        path: 'more/transfers/:id',
        component: () => import('@/features/fundTransfers/pages/TransferDetail.vue')
      },
      {
        path: 'more/ledger',
        component: () => import('@/features/fundTransfers/pages/LedgerView.vue')
      },
      {
        path: 'more/ledger/top-up',
        component: () => import('@/features/fundTransfers/pages/RecordTopUp.vue')
      },
      // HR & Employee Management
      {
        path: 'more/hr',
        redirect: '/tabs/more/hr/employees'
      },
      {
        path: 'more/hr/employees',
        component: () => import('@/features/hr/pages/EmployeesList.vue')
      },
      {
        path: 'more/hr/employees/new',
        component: () => import('@/features/hr/pages/CreateEmployee.vue')
      },
      {
        path: 'more/hr/employees/:id',
        component: () => import('@/features/hr/pages/EmployeeProfile.vue')
      },
      {
        path: 'more/hr/attendance',
        component: () => import('@/features/hr/pages/Attendance.vue')
      },
      {
        path: 'more/hr/clock-in',
        component: () => import('@/features/hr/pages/ClockInOut.vue')
      },
      {
        path: 'more/hr/payroll',
        component: () => import('@/features/hr/pages/PayrollList.vue')
      },
      {
        path: 'more/hr/payroll/:id',
        component: () => import('@/features/hr/pages/PayslipDetail.vue')
      },
      // Operations & Procurement
      {
        path: 'more/bom-templates',
        component: () => import('@/features/admin/pages/BomTemplatesList.vue')
      },
      {
        path: 'more/bom-templates/new',
        component: () => import('@/features/admin/pages/CreateBomTemplate.vue')
      },
      {
        path: 'more/bom-templates/:id',
        component: () => import('@/features/admin/pages/BomTemplateDetail.vue')
      },
      {
        path: 'more/procurement',
        redirect: '/tabs/more/procurement/requisitions'
      },
      {
        path: 'more/procurement/requisitions',
        component: () => import('@/features/procurement/pages/RequisitionsList.vue')
      },
      {
        path: 'more/procurement/requisitions/new',
        component: () => import('@/features/procurement/pages/CreateRequisition.vue')
      },
      {
        path: 'more/procurement/requisitions/:id',
        component: () => import('@/features/procurement/pages/RequisitionDetail.vue')
      },
      {
        path: 'more/container-access',
        component: () => import('@/features/containerAccess/pages/CAAList.vue')
      },
      {
        path: 'more/container-access/new',
        component: () => import('@/features/containerAccess/pages/CreateCAA.vue')
      },
      {
        path: 'more/container-access/:id',
        component: () => import('@/features/containerAccess/pages/CAADetail.vue')
      },
      // Settings & Profile
      {
        path: 'more/settings',
        component: () => import('@/views/SettingsPage.vue')
      },
      {
        path: 'more/profile',
        component: () => import('@/views/ProfilePage.vue')
      },
      {
        path: 'more/support',
        component: () => import('@/views/SupportPage.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
