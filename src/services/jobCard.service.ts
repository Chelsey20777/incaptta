import { db } from '../config/firebase';
import { JobCard, JobCardSchema } from '../models/jobCard.model';
import { CommissionService } from './commission.service';
import { NotificationService } from './notification.service';
import * as admin from 'firebase-admin';

const getJobCardCollection = () => db.collection('jobCards');
const getCounterDoc = () => db.collection('counters').doc('jobCards');

export const JobCardService = {
    async postInventoryLine(
        jobCardId: string,
        lineId: string,
        movementType: 'ISSUE' | 'RETURN',
        actor: { uid: string; name: string }
    ) {
        const jobRef = getJobCardCollection().doc(jobCardId);
        const ledgerId = `${movementType === 'ISSUE' ? 'JOB_CARD_ISSUE' : 'JOB_CARD_RETURN'}_${jobCardId}_${lineId}`
            .replace(/[^A-Za-z0-9_-]/g, '_');
        const ledgerRef = db.collection('stockLedger').doc(ledgerId);

        return db.runTransaction(async transaction => {
            const [jobSnap, ledgerSnap] = await Promise.all([
                transaction.get(jobRef),
                transaction.get(ledgerRef),
            ]);
            if (!jobSnap.exists) throw new Error('Job Card not found');
            const job: any = jobSnap.data();

            const sections = (job.requisitionSections || []).map((section: any) => ({
                ...section,
                items: (section.items || []).map((item: any) => ({ ...item })),
            }));
            const flat = (job.requisitionItems || []).map((item: any) => ({ ...item }));
            const returns = (job.inventoryReturns || []).map((item: any) => ({ ...item }));
            const candidates = movementType === 'RETURN'
                ? returns
                : [...sections.flatMap((section: any) => section.items), ...flat];
            const line = candidates.find((item: any) => item.id === lineId);
            if (!line) throw new Error('Inventory line not found');
            if (!ledgerSnap.exists && line.approvalStatus !== 'APPROVED_ACCOUNTANT') {
                throw new Error('Accountant approval is required before manager stock posting');
            }
            if (!line.inventoryItemId) throw new Error('Inventory line is not linked to stock');

            const quantity = Number(movementType === 'RETURN'
                ? line.qtyReturned
                : (line.qtyRequired ?? line.quantity ?? line.qty));
            if (!(quantity > 0)) throw new Error('Inventory quantity must be greater than zero');

            const itemRef = db.collection('inventoryItems').doc(line.inventoryItemId);
            const itemSnap = await transaction.get(itemRef);
            if (!itemSnap.exists) throw new Error('Inventory item not found');
            const currentOnHand = Number(itemSnap.data()?.onHand ?? itemSnap.data()?.inStock ?? 0);
            const qtyDelta = movementType === 'ISSUE' ? -quantity : quantity;
            const newOnHand = currentOnHand + qtyDelta;
            if (newOnHand < 0) throw new Error(`Insufficient stock. Available: ${currentOnHand}, requested: ${quantity}`);

            const postedAt = admin.firestore.FieldValue.serverTimestamp();
            const patchLine = (item: any) => item.id === lineId ? {
                ...item,
                approvalStatus: 'APPROVED_MANAGER',
                approvedAt: new Date().toISOString(),
                approvedBy: actor.name,
                postingState: 'POSTED',
                postingLedgerId: ledgerId,
                postingError: null,
                ...(movementType === 'ISSUE' ? { inventoryDeducted: true } : { inventoryReturned: true }),
            } : item;

            if (!ledgerSnap.exists) {
                transaction.update(itemRef, { onHand: newOnHand, updatedAt: postedAt });
                transaction.create(ledgerRef, {
                    inventoryItemId: line.inventoryItemId,
                    movementType,
                    qtyDelta,
                    qtyBefore: currentOnHand,
                    qtyAfter: newOnHand,
                    sourceType: movementType === 'ISSUE' ? 'JOB_CARD_ISSUE' : 'JOB_CARD_RETURN',
                    sourceId: jobCardId,
                    sourceLineId: lineId,
                    referenceNo: job.generalInfo?.jobNumber || jobCardId,
                    reason: movementType === 'ISSUE' ? 'Manager-approved job-card issue' : 'Manager-approved job-card return',
                    postedBy: actor,
                    createdAt: postedAt,
                });
            }

            transaction.update(jobRef, {
                requisitionSections: sections.map((section: any) => ({ ...section, items: section.items.map(patchLine) })),
                requisitionItems: flat.map(patchLine),
                inventoryReturns: returns.map(patchLine),
                updatedAt: postedAt,
            });
            return { ledgerId, postingState: 'POSTED', idempotent: ledgerSnap.exists };
        });
    },
    /**
     * Create a new Job Card with a unique incremental number
     */
    async createJobCard(payload: any, userId: string, userName: string, roles: string[] = []) {
        return db.runTransaction(async (transaction) => {
            // ... (rest of logic will be updated)
            // 1. UNIQUE JOB NUMBER GENERATION
            const counterRef = getCounterDoc();
            const counterDoc = await transaction.get(counterRef);

            let nextNumber = 1;
            if (counterDoc.exists) {
                nextNumber = (counterDoc.data()?.lastNumber || 0) + 1;
            }

            transaction.set(counterRef, { lastNumber: nextNumber }, { merge: true });
            const jobNumber = `JC-${nextNumber.toString().padStart(5, '0')}`;

            // 2. FETCH & VALIDATE DEPARTMENT + CATEGORY
            const depRef = db.collection('departments').doc(payload.requestingDepartmentId);
            const catRef = db.collection('jobCategories').doc(payload.jobCategoryId);

            const [depDoc, catDoc] = await Promise.all([
                transaction.get(depRef),
                transaction.get(catRef)
            ]);

            if (!depDoc.exists) throw new Error(`Department ${payload.requestingDepartmentId} not found`);
            if (!catDoc.exists) throw new Error(`Category ${payload.jobCategoryId} not found`);

            const depName = depDoc.data()?.displayName || depDoc.data()?.name;
            const catName = catDoc.data()?.name;

            // 3. ASSEMBLE JOB CARD
            let salesAssignment = payload.sales || undefined;

            // Auto-assign if creator is SALES
            if (roles.includes('SALES') && !salesAssignment) {
                salesAssignment = {
                    salesRepUid: userId,
                    salesRepName: userName,
                    commissionRate: 0.03
                };
            }

            const jobCardData: JobCard = {
                status: 'DRAFT',
                generalInfo: {
                    ...payload,
                    jobNumber,
                    requestingDepartmentName: depName,
                    jobCategoryName: catName,
                    currency: payload.currency || 'USD',
                    totalAmount: payload.totalAmount || 0,
                },
                sales: salesAssignment,
                createdBy: {
                    uid: userId,
                    name: userName,
                },
            };

            // Validate with Schema
            const validated = JobCardSchema.parse(jobCardData);

            const jobCardRef = getJobCardCollection().doc();
            transaction.set(jobCardRef, {
                ...validated,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Notify Managers about new Job Card
            NotificationService.sendToRole('MANAGER', 'New Job Card Created', `Job Card ${jobNumber} submitted by ${userName} needs approval.`, {
                jobCardId: jobCardRef.id,
                type: 'JOB_CARD_SUBMITTED'
            });

            return { id: jobCardRef.id, jobNumber };
        });
    },

    async getById(id: string) {
        const doc = await getJobCardCollection().doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as JobCard & { id: string };
    },

    async query(filters: any) {
        let query: admin.firestore.Query = getJobCardCollection();
        // Add filtering logic as needed later
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /**
     * Final approval by Manager. Triggers commission record creation.
     */
    async managerApprove(jobCardId: string, managerUid: string) {
        const jobCardRef = getJobCardCollection().doc(jobCardId);

        return db.runTransaction(async (transaction) => {
            const doc = await transaction.get(jobCardRef);
            if (!doc.exists) throw new Error('Job Card not found');

            const data = doc.data() as JobCard;
            if (data.status === 'APPROVED') return { message: 'Already approved' };

            // 1. Update status to APPROVED
            transaction.update(jobCardRef, {
                status: 'APPROVED',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Trigger Commission Record (idempotent)
            // Note: We pass the data *before* the update, but with the updated status conceptually.
            // CommissionService handles the logic.
            const commission = await CommissionService.upsertCommission(jobCardId, data, managerUid);

            // Notify Creator about approval
            NotificationService.sendToUser(data.createdBy.uid, 'Job Card Approved', `Your Job Card ${data.generalInfo.jobNumber} has been approved.`, {
                jobCardId,
                type: 'JOB_CARD_APPROVED'
            });

            return { jobCardId, status: 'APPROVED', commissionId: commission?.id };
        });
    },

    /**
     * Notify author about an inline item approval (called by frontend after Firestore update)
     */
    async sendItemApprovalNotification(jobCardId: string, itemName: string, status: string) {
        const jobCard = await this.getById(jobCardId);
        if (!jobCard) return;

        const title = status.includes('REJECTED') ? 'Item Rejected' : 'Item Approved';
        const displayStatus = status.replace('_', ' ');
        
        await NotificationService.sendToUser(jobCard.createdBy.uid, title, `The item "${itemName}" in your Job Card ${jobCard.generalInfo.jobNumber} has been marked as ${displayStatus}.`, {
            jobCardId,
            type: 'JOB_CARD_ITEM_UPDATE'
        });
    }
};
