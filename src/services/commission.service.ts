import { db } from '../config/firebase';
import { Commission, CommissionSchema } from '../models/commission.model';
import { JobCard } from '../models/jobCard.model';
import * as admin from 'firebase-admin';

const getCommissionCollection = () => db.collection('commissions');

export const CommissionService = {
    /**
     * Idempotent upsert of a commission record.
     * Should be called when a Job Card receives final Manager approval.
     */
    async upsertCommission(jobCardId: string, jobCardData: JobCard, managerUid: string) {
        // 1. Validate eligibility
        if (!jobCardData.sales || !jobCardData.sales.salesRepUid) {
            console.log(`No sales rep assigned to Job Card ${jobCardId}. Skipping commission.`);
            return null;
        }

        const baseAmount = jobCardData.generalInfo.totalAmount || 0;
        if (baseAmount <= 0) {
            console.log(`Base amount for Job Card ${jobCardId} is 0. Skipping commission.`);
            return null;
        }

        // 2. Calculate values
        const rate = jobCardData.sales.commissionRate || 0.03;
        const commissionAmount = Number((baseAmount * rate).toFixed(2));

        // 3. IDEMPOTENT DOC ID: Each job card has exactly one primary commission record.
        // If versions/revisions are needed later, this ID strategy can be extended.
        const docId = `JOB_${jobCardId}`;
        const docRef = getCommissionCollection().doc(docId);

        const commissionData: Commission = {
            jobCardId,
            jobNumber: jobCardData.generalInfo.jobNumber,
            salesRepUid: jobCardData.sales.salesRepUid,
            salesRepName: jobCardData.sales.salesRepName,
            commissionRate: rate,
            baseAmount,
            commissionAmount,
            currency: jobCardData.generalInfo.currency || 'USD',
            status: 'ACCRUED',
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            managerUid,
            createdBy: {
                uid: 'system',
                name: 'System Automator'
            }
        };

        // 4. Validate with Schema
        const validated = CommissionSchema.parse(commissionData);

        // 5. Upsert
        await docRef.set({
            ...validated,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(), // Overwritten if update, but set() with no merge handles creation.
        }, { merge: true });

        console.log(`Commission ${docId} upserted for ${jobCardData.generalInfo.jobNumber}`);
        return { id: docId, ...validated };
    }
};
