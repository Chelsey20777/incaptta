import { db } from '../config/firebase';
import { Invoice, Quotation } from '../models/billing.model';
import * as admin from 'firebase-admin';

const getInvoiceCollection = () => db.collection('invoices');
const getQuoteCollection = () => db.collection('quotations');

export const InvoiceService = {
    async createFromQuote(quoteId: string, userId: string) {
        const quoteDoc = await getQuoteCollection().doc(quoteId).get();
        if (!quoteDoc.exists) throw new Error('Quotation not found');
        const quoteData = quoteDoc.data() as Quotation;

        if (quoteData.status !== 'ACCEPTED') {
            throw new Error(`Quotation must be ACCEPTED to generate an invoice. Current: ${quoteData.status}`);
        }

        const invoice: Partial<Invoice> = {
            invoiceNumber: `INV-${Date.now()}`,
            status: 'DRAFT',
            source: { type: 'QUOTATION', id: quoteId },
            clientId: quoteData.clientId,
            clientNameSnapshot: quoteData.clientNameSnapshot,
            lines: quoteData.lines,
            totals: quoteData.totals,
            payment: {
                amountPaid: 0,
                balanceDue: quoteData.totals?.grandTotal || 0,
            },
            createdBy: userId,
        };

        const docRef = await getInvoiceCollection().add({
            ...invoice,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { id: docRef.id, ...invoice };
    },

    async getById(id: string) {
        const doc = await getInvoiceCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as Invoice & { id: string };
    },

    async issue(id: string) {
        await getInvoiceCollection().doc(id).update({
            status: 'ISSUED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, status: 'ISSUED' };
    },

    async markPaid(id: string, paymentData: { amount: number, method: string, reference?: string }) {
        const invRef = getInvoiceCollection().doc(id);
        const doc = await invRef.get();
        if (!doc.exists) throw new Error('Invoice not found');
        const current = doc.data() as Invoice;

        const newAmountPaid = (current.payment?.amountPaid || 0) + paymentData.amount;
        const grandTotal = current.totals?.grandTotal || 0;
        const newBalance = Math.max(0, grandTotal - newAmountPaid);
        const newStatus = newBalance === 0 ? 'PAID' : current.status;

        await invRef.update({
            status: newStatus,
            payment: {
                amountPaid: newAmountPaid,
                balanceDue: newBalance,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                method: paymentData.method,
                reference: paymentData.reference,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { id, status: newStatus, balanceDue: newBalance };
    },

    async void(id: string) {
        await getInvoiceCollection().doc(id).update({
            status: 'VOID',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, status: 'VOID' };
    }
};
