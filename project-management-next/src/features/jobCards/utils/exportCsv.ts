import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

function formatCurrency(val: number): string {
    return '$' + Number(val || 0).toFixed(2)
}

/**
 * Escapes a cell value for CSV encoding
 */
function escapeCsvValue(val: any): string {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

/**
 * Normalizes legacy item schemas to the current embedded array schema
 */
const normalizeJobCardItem = (item: any) => ({
    ...item,
    itemName: item.itemName || item.inventoryItemName || 'Unnamed Item',
    qty: item.qty || item.qtyRequired || 0,
    irdSellingPrice: item.irdSellingPrice || item.irdSellingPriceSnapshot || 0,
    twidMarkupPercent: item.twidMarkupPercent || item.markupPercent || 0,
    rowGrandTot: item.rowGrandTot || item.rowGrandTotal || item.totalInventoryPrice || 0
})

/**
 * Generates and downloads a detailed CSV report of Job Cards 
 * and their nested Inventory Requisitions and Ad-hoc Expenses.
 * Resolves legacy subcollection data recursively.
 */
export async function exportDetailedJobCardsCsv(jobCards: any[], resolveCategory: (id: string) => string, resolveDepartment: (id: string) => string) {
    if (!jobCards || jobCards.length === 0) return

    const rows: string[][] = []

    // Push Header Row
    rows.push([
        'Record Type',
        'Job ID',
        'Date / Status',
        'Category / Title',
        'Location / Recipient',
        'Item Name / Description',
        'Quantity',
        'Unit Cost (IRD)',
        'Markup %',
        'Payment Method',
        'Total Price',
        'Approval Status',
        'Referrer',
        'Comm %',
        'Comm Amt'
    ])

    for (const job of jobCards) {
        const genInfo = job.generalInfo || {}
        const totals = job.totals || job.summary || {}

        // Format dates
        let createDate = 'Unknown'
        if (job.createdAt?.toDate) {
            createDate = job.createdAt.toDate().toLocaleDateString()
        }

        // --- ROW 1: MAIN JOB CARD SUMMARY ---
        rows.push([
            'JOB SUMMARY', // Record Type
            genInfo.jobNumber || job.id.substring(0, 8), // Job ID
            `${createDate} / ${job.status.replace(/_/g, ' ')}`, // Date / Status
            `${resolveCategory(genInfo.jobCategoryId)} / ${genInfo.jobTitle || 'Untitled'}`, // Category / Title
            `${genInfo.projectLocation || 'N/A'} - ${genInfo.recipientName || 'N/A'}`, // Location / Recipient
            '', // Item Name / Desc
            '', // Qty
            '', // Unit Cost
            '', // MU
            '', // Payment
            formatCurrency(totals.grandTotal || 0).replace('$', ''), // Total Price
            '', // Item Status
            genInfo.referrerName || '',
            genInfo.commissionPercentage ? `${genInfo.commissionPercentage}%` : '',
            genInfo.commissionPercentage ? formatCurrency((totals.grandTotal || 0) * (genInfo.commissionPercentage / 100)).replace('$', '') : ''
        ])

        // Evaluate nested arrays vs legacy subcollections
        let items: any[] = []
        let expenses: any[] = []

        if (Array.isArray(job.requisitionItems) && job.requisitionItems.length > 0) {
            items = job.requisitionItems.map(normalizeJobCardItem)
        } else {
            // Fetch legacy items if embedded array is empty
            try {
                const itemsSnap = await getDocs(collection(db, 'jobCards', job.id, 'items'))
                items = itemsSnap.docs.map(d => normalizeJobCardItem({ id: d.id, ...d.data() }))
            } catch (err) {
                console.warn(`Could not fetch legacy items for job ${job.id}`, err)
            }
        }

        if (Array.isArray(job.adHocExpenses) && job.adHocExpenses.length > 0) {
            expenses = job.adHocExpenses
        } else {
            // Fetch legacy expenses
            try {
                const expSnap = await getDocs(collection(db, 'jobCards', job.id, 'expenses'))
                expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            } catch (err) {
                console.warn(`Could not fetch legacy expenses for job ${job.id}`, err)
            }
        }

        // --- ROW 2: INVENTORY ITEMS ---
        for (const item of items) {
            rows.push([
                'Inventory', // Record Type
                '', // Job ID
                '', // Date / Status
                '', // Category
                '', // Location
                `${item.itemName}${item.description ? ' - ' + item.description : ''}`, // Item Name / Desc
                item.qty, // Qty
                formatCurrency(item.irdSellingPrice || 0).replace('$', ''), // Unit Cost
                `${item.twidMarkupPercent || 0}%`, // MU
                '', // Payment Method
                formatCurrency(item.rowGrandTot || 0).replace('$', ''), // Total Price
                item.approvalStatus || 'PENDING', // Item Status
                '', '', ''
            ])
        }

        // --- ROW 3: AD-HOC EXPENSES ---
        for (const exp of expenses) {
            rows.push([
                'Ad-hoc Expense', // Record Type
                '', // Job ID
                '', // Date / Status
                '', // Category
                '', // Location
                exp.description || 'Unnamed Expense', // Item Name / Desc
                exp.quantity || 1, // Qty
                formatCurrency(exp.unitPrice || 0).replace('$', ''), // Unit Cost
                '', // MU
                exp.paymentMethod || 'cash', // Payment Method
                formatCurrency(exp.totalAmount || ((exp.quantity || 0) * (exp.unitPrice || 0))).replace('$', ''), // Total Price
                exp.approvalStatus || 'PENDING',
                '', '', ''
            ])
        }

        // Add a visual spacer row
        rows.push([''])
    }

    // Convert to CSV blob
    const csvContent = rows.map(r => r.map(escapeCsvValue).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })

    // Download File
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `Job_Cards_Detailed_Report_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}
