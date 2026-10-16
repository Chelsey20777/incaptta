import { EcoCashService } from '../services/ecocash.service';
import * as admin from 'firebase-admin';

// Re-initialize for test script consistency if needed
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const samples = [
    "Transfer Confirmation: USD 2.00 sent to KIMBERLY-ANN GIBBONS. Approval Code: PP260413.1951.T0123998. New balance: USD 0.33.",
    "Transfer Confirmation: USD 50.00 from PANASHE MAZARIRE. Approval Code: PP260413.1750.T9132319. New balance: USD 50.07.",
    "Payment Confirmation: USD 25.20 paid to 362076 - NMB BANK LIMITED. Approval Code: MP260413.1944.T0080979. New balance: USD 2.33."
];

describe('EcoCash Integration', () => {
    it('processes SMS samples', async () => {
        console.log("--- Starting EcoCash Integration Test ---");
        
        for (const sms of samples) {
            console.log(`\n[Test] Processing Sample: ${sms.substring(0, 60)}...`);
            try {
                const result = await EcoCashService.processSms("+263164USD", sms);
                console.log("[Test] Success:", JSON.stringify(result, null, 2));
            } catch (err: any) {
                console.error("[Test] Error processing sample:", err.message);
            }
        }
        
        console.log("\n--- Test Finished ---");
    });
});

