import { FundTransfer, FundTransferSchema, CashLedgerEntry } from '../models/cashManagement.model';
import { NotificationService } from './notification.service';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

const getTransferCollection = () => db.collection('fundTransfers');
const getLedgerCollection = () => db.collection('cashLedger');

export const CashManagementService = {
    /**
     * Post a Fund Transfer atomically.
     * Creates two ledger entries (OUT and IN) and updates status.
     */
    async postFundTransfer(transferId: string, postedByUid: string) {
        return db.runTransaction(async (transaction) => {
            const transferRef = getTransferCollection().doc(transferId);
            const transferDoc = await transaction.get(transferRef);

            if (!transferDoc.exists) throw new Error('Fund Transfer not found');
            const data = transferDoc.data() as FundTransfer;

            if (data.status !== 'DRAFT') {
                throw new Error(`Transfer is already ${data.status}`);
            }

            if (data.fromAccountId === data.toAccountId) {
                throw new Error('From and To accounts must be different');
            }

            // 1. Create OUT Entry
            const outEntryRef = getLedgerCollection().doc();
            const outEntry: CashLedgerEntry = {
                accountId: data.fromAccountId,
                entryType: 'TRANSFER_OUT',
                amount: -Math.abs(data.amount),
                currency: data.currency,
                relatedType: 'FUND_TRANSFER',
                relatedId: transferId,
                reference: data.reference,
                createdByUid: postedByUid,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // 2. Create IN Entry
            const inEntryRef = getLedgerCollection().doc();
            const inEntry: CashLedgerEntry = {
                accountId: data.toAccountId,
                entryType: 'TRANSFER_IN',
                amount: Math.abs(data.amount),
                currency: data.currency,
                relatedType: 'FUND_TRANSFER',
                relatedId: transferId,
                reference: data.reference,
                createdByUid: postedByUid,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // 3. Update Transfer Status
            transaction.set(outEntryRef, outEntry);
            transaction.set(inEntryRef, inEntry);
            transaction.update(transferRef, {
                status: 'POSTED',
                postedAt: admin.firestore.FieldValue.serverTimestamp(),
                postedBy: postedByUid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Notify Accountants
            NotificationService.sendToRole('ACCOUNTANT', 'Fund Transfer Posted', `A transfer of ${data.amount} ${data.currency} has been posted.`, {
                transferId,
                type: 'FUND_TRANSFER_POSTED'
            });

            return { transferId, status: 'POSTED' };
        });
    }
};
