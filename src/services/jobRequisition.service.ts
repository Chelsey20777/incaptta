import { db } from '../config/firebase';
import { JobRequisition, InventoryLineItem, ExpenseLineItem, LineStatus } from '../models/jobRequisition.model';
import { StockLedgerEntry } from '../models/stockLedger.model';
import { NotificationService } from './notification.service';
import * as admin from 'firebase-admin';

const getJRCollection = () => db.collection('jobRequisitions');
const getInventoryCollection = () => db.collection('inventoryItems');
const getLedgerCollection = () => db.collection('stockLedger');

export const JobRequisitionService = {
    calculateTotals(data: Partial<JobRequisition>) {
        const inventoryItems = data.inventoryItems || [];
        const expenseItems = data.expenseItems || [];

        const planned = { inventory: 0, expenses: 0, grand: 0 };
        const released = { inventory: 0, expenses: 0, grand: 0 };

        inventoryItems.forEach(item => {
            const base = item.unitPriceSnapshot * item.qtyRequested;
            item.lineTotal = Number((base * (1 + (item.markupPercent || 0) / 100)).toFixed(2));

            if (item.status !== 'CANCELLED') {
                planned.inventory += item.lineTotal;
            }

            // For released inventory, we calculate based on cumulative qtyIssued
            const releasedBase = item.unitPriceSnapshot * (item.qtyIssued || 0);
            const releasedLineTotal = Number((releasedBase * (1 + (item.markupPercent || 0) / 100)).toFixed(2));
            released.inventory += releasedLineTotal;
        });

        expenseItems.forEach(item => {
            item.lineTotal = Number((item.unitCost * item.quantity).toFixed(2));

            if (item.status !== 'CANCELLED') {
                planned.expenses += item.lineTotal;
            }
            if (item.status === 'RELEASED') {
                released.expenses += item.lineTotal;
            }
        });

        planned.grand = Number((planned.inventory + planned.expenses).toFixed(2));
        released.grand = Number((released.inventory + released.expenses).toFixed(2));

        data.totals = {
            planned: {
                inventory: Number(planned.inventory.toFixed(2)),
                expenses: Number(planned.expenses.toFixed(2)),
                grand: planned.grand,
            },
            released: {
                inventory: Number(released.inventory.toFixed(2)),
                expenses: Number(released.expenses.toFixed(2)),
                grand: released.grand,
            },
        };
    },

    async create(data: JobRequisition, userId: string, userName: string) {
        this.calculateTotals(data);
        const jrNumber = `JR-${Date.now()}`;
        const docRef = await getJRCollection().add({
            ...data,
            jrNumber,
            createdBy: { uid: userId, name: userName },
            status: 'DRAFT',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id: docRef.id, ...data, jrNumber };
    },

    async getById(id: string) {
        const doc = await getJRCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as JobRequisition & { id: string };
    },

    async update(id: string, data: Partial<JobRequisition>) {
        const jrRef = getJRCollection().doc(id);
        const doc = await jrRef.get();
        if (!doc.exists) throw new Error('Requisition not found');
        const current = doc.data() as JobRequisition;
        if (current.status !== 'DRAFT') throw new Error('Only DRAFT can be edited');

        // Merge lines to recompute totals correctly
        const merged = { ...current, ...data };
        this.calculateTotals(merged);

        await jrRef.update({
            ...data,
            totals: merged.totals,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, ...data, totals: merged.totals };
    },

    async submit(id: string) {
        const jrRef = getJRCollection().doc(id);
        const doc = await jrRef.get();
        if (!doc.exists) throw new Error('Requisition not found');
        const data = doc.data() as JobRequisition;

        await jrRef.update({
            status: 'SUBMITTED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Notify Accountants
        NotificationService.sendToRole('ACCOUNTANT', 'New Job Requisition', `Requisition ${data.jrNumber} needs approval.`, {
            jrId: id,
            type: 'JR_SUBMITTED'
        });

        return { id, status: 'SUBMITTED' };
    },

    async approve(id: string) {
        const jrRef = getJRCollection().doc(id);
        const doc = await jrRef.get();
        if (!doc.exists) throw new Error('Requisition not found');
        const data = doc.data() as JobRequisition;

        await jrRef.update({
            status: 'APPROVED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Notify Creator
        if (data.createdBy?.uid) {
            NotificationService.sendToUser(data.createdBy.uid, 'Job Requisition Approved', `Your requisition ${data.jrNumber} has been approved.`, {
                jrId: id,
                type: 'JR_APPROVED'
            });
        }

        return { id, status: 'APPROVED' };
    },

    /**
     * Activates the JR (Project Started).
     */
    async issue(id: string) {
        await getJRCollection().doc(id).update({
            status: 'ISSUED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { id, status: 'ISSUED' };
    },

    async requestLineItem(jrId: string, lineItemId: string, userId: string) {
        return db.runTransaction(async (transaction) => {
            const jrRef = getJRCollection().doc(jrId);
            const jrDoc = await transaction.get(jrRef);
            if (!jrDoc.exists) throw new Error('Requisition not found');
            const jrData = jrDoc.data() as JobRequisition;

            if (jrData.status !== 'ISSUED') throw new Error('JR must be ISSUED/ACTIVE to request items');

            const invItem = jrData.inventoryItems.find(i => i.id === lineItemId);
            const expItem = jrData.expenseItems.find(i => i.id === lineItemId);
            const item = invItem || expItem;

            if (!item) throw new Error('Line item not found');
            if (item.status !== 'PLANNED') throw new Error(`Item already in status: ${item.status}`);

            item.status = 'REQUESTED';
            item.approval = {
                requestedBy: userId,
                requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            this.calculateTotals(jrData);

            transaction.update(jrRef, {
                inventoryItems: jrData.inventoryItems,
                expenseItems: jrData.expenseItems,
                totals: jrData.totals,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Notify Accountants about line request
            NotificationService.sendToRole('ACCOUNTANT', 'Material Request', `A new item is requested in ${jrData.jrNumber}.`, {
                jrId,
                type: 'JR_LINE_REQUESTED'
            });

            return { lineItemId, status: 'REQUESTED' };
        });
    },

    async approveLineItem(jrId: string, lineItemId: string, role: 'ACCOUNTANT' | 'DIRECTOR', userId: string, note?: string) {
        return db.runTransaction(async (transaction) => {
            const jrRef = getJRCollection().doc(jrId);
            const jrDoc = await transaction.get(jrRef);
            const jrData = jrDoc.data() as JobRequisition;

            const invItem = jrData.inventoryItems.find(i => i.id === lineItemId);
            const expItem = jrData.expenseItems.find(i => i.id === lineItemId);
            const item = invItem || expItem;

            if (!item) throw new Error('Line item not found');

            const now = admin.firestore.FieldValue.serverTimestamp();

            if (role === 'ACCOUNTANT') {
                if (item.status !== 'REQUESTED') throw new Error('Must be REQUESTED for Accountant approval');
                item.status = 'ACCOUNTANT_APPROVED';
                item.approval = {
                    ...item.approval,
                    accountant: { approved: true, by: userId, at: now, note }
                };
            } else if (role === 'DIRECTOR') {
                if (item.status !== 'ACCOUNTANT_APPROVED') throw new Error('Must be ACCOUNTANT_APPROVED for Director approval');

                // Director approval transitions to DIRECTOR_APPROVED for inventory (ready for release)
                // For expenses, it still transitions to RELEASED immediately as per prior pattern
                if (invItem) {
                    item.status = 'DIRECTOR_APPROVED';
                } else {
                    item.status = 'RELEASED';
                    item.released = { by: userId, at: now };
                }

                item.approval = {
                    ...item.approval,
                    director: { approved: true, by: userId, at: now, note }
                };

                // Handle Expense Ledger for Expense Items (immediate release on Director approve)
                if (expItem) {
                    const ledgerKey = `${jrId}_${lineItemId}`;
                    const ledgerRef = db.collection('expenseLedger').doc(ledgerKey);

                    const existingLedger = await transaction.get(ledgerRef);
                    if (!existingLedger.exists) {
                        transaction.set(ledgerRef, {
                            jrId,
                            lineItemId,
                            categoryId: expItem.expenseCategoryId,
                            categoryNameSnapshot: expItem.expenseCategoryNameSnapshot,
                            description: expItem.description || '',
                            amount: expItem.lineTotal,
                            status: 'ACCRUED',
                            accruedAt: now,
                            approvedByAccountant: {
                                by: item.approval?.accountant?.by || 'unknown',
                                at: item.approval?.accountant?.at || now,
                            },
                            approvedByDirector: {
                                by: userId,
                                at: now,
                            },
                            createdAt: now,
                            updatedAt: now,
                        });
                    }
                }
            }

            this.calculateTotals(jrData);

            transaction.update(jrRef, {
                inventoryItems: jrData.inventoryItems,
                expenseItems: jrData.expenseItems,
                totals: jrData.totals,
                updatedAt: now,
            });

            // Notify Requester
            if (item.approval?.requestedBy) {
                const title = item.status === 'RELEASED' ? 'Expense Released' : 'Material Approved';
                const itemName = (item as any).sku || (item as any).descriptionSnapshot || (item as any).description;
                NotificationService.sendToUser(item.approval.requestedBy, title, `The item "${itemName}" in ${jrData.jrNumber} has been ${item.status}.`, {
                    jrId,
                    type: 'JR_LINE_APPROVED'
                });
            }

            return { lineItemId, status: item.status };
        });
    },

    async releaseInventoryLine(jrId: string, lineItemId: string, qtyToRelease: number, userId: string, releaseId: string) {
        return db.runTransaction(async (transaction) => {
            const jrRef = getJRCollection().doc(jrId);
            const jrDoc = await transaction.get(jrRef);
            if (!jrDoc.exists) throw new Error('Requisition not found');
            const jrData = jrDoc.data() as JobRequisition;

            if (jrData.status !== 'ISSUED') throw new Error('JR must be ACTIVE/ISSUED to release items');

            const invItem = jrData.inventoryItems.find(i => i.id === lineItemId);
            if (!invItem) throw new Error('Inventory line item not found');

            // Idempotency check: use deterministic doc ID for ledger
            const ledgerKey = `${jrId}_${lineItemId}_${releaseId}`;
            const ledgerRef = getLedgerCollection().doc(ledgerKey);
            const existingLedger = await transaction.get(ledgerRef);
            if (existingLedger.exists) {
                return { lineItemId, status: invItem.status, msg: 'Already released' };
            }

            if (invItem.status !== 'DIRECTOR_APPROVED' && invItem.status !== 'RELEASED') {
                throw new Error('Line must be Director Approved or already in partial release status');
            }

            if (qtyToRelease <= 0) throw new Error('qtyToRelease must be positive');
            if (invItem.qtyIssued + qtyToRelease > invItem.qtyRequested) {
                throw new Error(`Cannot release ${qtyToRelease}. Exceeds requested quantity (${invItem.qtyRequested - invItem.qtyIssued} remaining)`);
            }

            // Read Actual Stock
            const invRef = getInventoryCollection().doc(invItem.inventoryItemId);
            const invDoc = await transaction.get(invRef);
            if (!invDoc.exists) throw new Error(`Inventory item ${invItem.sku} not found`);

            const invData = invDoc.data()!;
            const previousStock = invData.inStock || 0;
            const newStock = previousStock - qtyToRelease;

            if (newStock < 0) throw new Error(`Insufficient stock for ${invItem.sku} (Available: ${previousStock})`);

            const now = admin.firestore.FieldValue.serverTimestamp();

            // Update Inventory
            transaction.update(invRef, {
                inStock: newStock,
                updatedAt: now,
            });

            // Update JR Line
            invItem.qtyIssued += qtyToRelease;
            if (invItem.qtyIssued === invItem.qtyRequested) {
                invItem.status = 'RELEASED';
            }
            invItem.released = { by: userId, at: now };

            // Create Stock Ledger Entry
            transaction.set(ledgerRef, {
                inventoryItemId: invItem.inventoryItemId,
                sku: invItem.sku,
                type: 'ISSUE',
                sourceType: 'JOB_REQUISITION',
                sourceId: jrId,
                lineItemId: lineItemId,
                quantityChange: -qtyToRelease,
                previousStock,
                newStock,
                performedBy: userId,
                timestamp: now,
                createdAt: now,
                updatedAt: now,
            });

            this.calculateTotals(jrData);

            transaction.update(jrRef, {
                inventoryItems: jrData.inventoryItems,
                totals: jrData.totals,
                updatedAt: now,
            });

            // Notify Requester about release
            if (invItem.approval?.requestedBy) {
                NotificationService.sendToUser(invItem.approval.requestedBy, 'Inventory Released', `${qtyToRelease}x "${invItem.sku}" from ${jrData.jrNumber} have been released.`, {
                    jrId,
                    type: 'JR_LINE_RELEASED'
                });
            }

            return { lineItemId, status: invItem.status, qtyReleased: invItem.qtyIssued };
        });
    },

    async rejectLineItem(jrId: string, lineItemId: string, userId: string, note?: string) {
        return db.runTransaction(async (transaction) => {
            const jrRef = getJRCollection().doc(jrId);
            const jrDoc = await transaction.get(jrRef);
            const jrData = jrDoc.data() as JobRequisition;

            const invItem = jrData.inventoryItems.find(i => i.id === lineItemId);
            const expItem = jrData.expenseItems.find(i => i.id === lineItemId);
            const item = invItem || expItem;

            if (!item) throw new Error('Line item not found');

            item.status = 'REJECTED';
            if (!item.approval) item.approval = {} as any;

            this.calculateTotals(jrData);

            transaction.update(jrRef, {
                inventoryItems: jrData.inventoryItems,
                expenseItems: jrData.expenseItems,
                totals: jrData.totals,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return { lineItemId, status: 'REJECTED' };
        });
    }
};
