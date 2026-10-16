import { db } from '../config/firebase';
import * as admin from 'firebase-admin';
import { AiService } from './ai.service';
import { OperationalExpenseService } from './operationalExpense.service';
import { NotificationService } from './notification.service';

/**
 * Service to handle the lifecycle of an EcoCash SMS integration.
 */
export const EcoCashService = {
    /**
     * Entry point for processing an incoming SMS webhook.
     */
    async processSms(sender: string, body: string) {
        console.log(`[EcoCashService] Processing message from ${sender}`);
        
        // 1. Audit Log: Store the raw SMS immediately
        const logRef = await db.collection('smsLogs').add({
            sender,
            body,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'RECEIVED'
        });

        try {
            // 2. Intelligence: Parse the unstructured SMS text using Gemini
            const parsed = await AiService.parseEcoCashSms(body);
            console.log(`[EcoCashService] AI Parsed Result:`, parsed);

            // 3. Update audit log with intelligence findings
            await logRef.update({ 
                parsed, 
                status: 'PARSED' 
            });

            // 4. Financial Workflow
            if (parsed.transactionType === 'SENT' || parsed.transactionType === 'BILL_PAYMENT') {
                // We need a valid category ID to create an expense.
                // We look for 'Uncategorized' or just take the first available category.
                const categoryId = await this.resolveBestCategoryId();

                const opexPayload = {
                    categoryId: categoryId,
                    description: `EcoCash Automated Entry | Ref: ${parsed.referenceNumber}`,
                    vendorName: parsed.recipientName,
                    amount: parsed.amount,
                    currency: parsed.currency || 'USD',
                    referenceNumber: parsed.referenceNumber,
                    paymentMethod: 'ECOCASH',
                    expenseDate: new Date().toISOString()
                };
                
                try {
                    // Create the DRAFT Opex
                    const result = await OperationalExpenseService.createExpense(
                        opexPayload, 
                        'system-automation', 
                        'EcoCash Bot'
                    );
                    
                    await logRef.update({ expenseId: result.id, status: 'PROCESSED' });
                    
                    // Notify Accountants about the new draft
                    await NotificationService.sendToRole('ACCOUNTANT', 'New EcoCash Draft Expense', 
                        `Detected payment of ${parsed.amount} ${parsed.currency} to ${parsed.recipientName}. A draft opex has been created.`, {
                        expenseId: result.id,
                        type: 'OPEX_AUTOCREATED'
                    });
                } catch (createErr: any) {
                    console.error('[EcoCashService] Failed to create opex record:', createErr);
                    // Still notify that a payment happened, even if the database record failed.
                    await NotificationService.sendToRole('ACCOUNTANT', 'EcoCash Payment Alert (No Record Created)', 
                        `Detected $${parsed.amount} paid to ${parsed.recipientName}. Manual entry may be required. Error: ${createErr.message}`, {
                        type: 'ECOCASH_ERROR'
                    });
                }
            } else if (parsed.transactionType === 'RECEIVED') {
                 // Notify about incoming funds
                 await NotificationService.sendToRole('ACCOUNTANT', 'EcoCash Payment Received', 
                    `Incoming transaction detected: $${parsed.amount} received from ${parsed.recipientName}.`, {
                    type: 'ECOCASH_RECEIVED'
                });
            }

            return { success: true, transactionId: parsed.referenceNumber };
        } catch (err: any) {
            console.error('[EcoCashService] Critical failure processing SMS:', err);
            await logRef.update({ 
                status: 'ERROR', 
                error: err.message 
            });
            throw err;
        }
    },

    /**
     * Resolves a valid category ID from the database to satisfy OPEX validation.
     */
    async resolveBestCategoryId(): Promise<string> {
        // Find existing 'Uncategorized' or 'General'
        const cats = await db.collection('expenseCategories').get();
        if (cats.empty) {
            // Last resort: Create one if absolutely necessary, but usually better to fail/warn
            throw new Error('No expense categories found in the system. Automation cannot create expenses.');
        }
        
        const uncategorized = cats.docs.find(d => d.data().name.toLowerCase().includes('uncategorized'));
        if (uncategorized) return uncategorized.id;

        const general = cats.docs.find(d => d.data().name.toLowerCase().includes('general'));
        if (general) return general.id;

        // Fallback to the first one available
        return cats.docs[0].id;
    }
}
