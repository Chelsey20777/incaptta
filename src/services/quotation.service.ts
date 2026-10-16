import { db } from '../config/firebase';
import { Quotation, BillingLineItem } from '../models/billing.model';
import { JobRequisition } from '../models/jobRequisition.model';
import * as admin from 'firebase-admin';

const getQuoteCollection = () => db.collection('quotations');
const getJRCollection = () => db.collection('jobRequisitions');

export const QuotationService = {
    calculateTotals(data: Partial<Quotation>) {
        const lines = data.lines || [];
        let inventoryTotal = 0;
        let expensesTotal = 0;

        lines.forEach(line => {
            const base = line.unitPriceSnapshot * line.quantity;
            line.lineTotal = Number((base * (1 + (line.markupPercent || 0) / 100)).toFixed(2));

            if (line.lineType === 'INVENTORY') {
                inventoryTotal += line.lineTotal;
            } else {
                expensesTotal += line.lineTotal;
            }
        });

        data.totals = {
            inventoryTotal: Number(inventoryTotal.toFixed(2)),
            expensesTotal: Number(expensesTotal.toFixed(2)),
            grandTotal: Number((inventoryTotal + expensesTotal).toFixed(2)),
        };
    },

    async createFromJR(jrId: string, userId: string) {
        const jrDoc = await getJRCollection().doc(jrId).get();
        if (!jrDoc.exists) throw new Error('Job Requisition not found');
        const jrData = jrDoc.data() as JobRequisition;

        const allowedStatuses = ['APPROVED', 'ISSUED'];
        if (!allowedStatuses.includes(jrData.status)) {
            throw new Error(`JR must be APPROVED or ISSUED to generate a quote. Current: ${jrData.status}`);
        }

        const lines: BillingLineItem[] = [];

        // Map Inventory Items
        jrData.inventoryItems.forEach(item => {
            lines.push({
                lineType: 'INVENTORY',
                inventoryItemId: item.inventoryItemId,
                sku: item.sku,
                descriptionSnapshot: item.descriptionSnapshot,
                quantity: item.qtyRequested,
                unitPriceSnapshot: item.unitPriceSnapshot,
                markupPercent: item.markupPercent || 0,
                lineTotal: 0, // Calculated below
            });
        });

        // Map Expense Items
        jrData.expenseItems.forEach(item => {
            lines.push({
                lineType: 'EXPENSE',
                expenseCategoryId: item.expenseCategoryId,
                expenseCategoryNameSnapshot: item.expenseCategoryNameSnapshot,
                descriptionSnapshot: item.description || 'Expense',
                quantity: item.quantity,
                unitPriceSnapshot: item.unitCost,
                markupPercent: 0,
                lineTotal: 0, // Calculated below
            });
        });

        const quotation: Partial<Quotation> = {
            quoteNumber: `QT-${Date.now()}`,
            status: 'DRAFT',
            source: { type: 'JOB_REQUISITION', id: jrId },
            clientId: jrData.clientId,
            clientNameSnapshot: 'To Be Fetched', // Ideally fetch from client doc
            lines,
            createdBy: userId,
        };

        this.calculateTotals(quotation);

        const docRef = await getQuoteCollection().add({
            ...quotation,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { id: docRef.id, ...quotation };
    },

    async getById(id: string) {
        const doc = await getQuoteCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as Quotation & { id: string };
    },

    async update(id: string, data: Partial<Quotation>) {
        const quoteRef = getQuoteCollection().doc(id);
        const doc = await quoteRef.get();
        if (!doc.exists) throw new Error('Quotation not found');
        const current = doc.data() as Quotation;
        if (current.status !== 'DRAFT') throw new Error('Only DRAFT can be edited');

        if (data.lines) this.calculateTotals(data);

        await quoteRef.update({
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, ...data };
    },

    async send(id: string) {
        await getQuoteCollection().doc(id).update({
            status: 'SENT',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, status: 'SENT' };
    },

    async accept(id: string) {
        await getQuoteCollection().doc(id).update({
            status: 'ACCEPTED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, status: 'ACCEPTED' };
    }
};
