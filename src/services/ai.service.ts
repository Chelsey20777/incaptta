import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ 
    model: "gemini-3-flash-preview",
    generationConfig: {
        responseMimeType: "application/json",
    }
});

export interface EcoCashParsed {
    amount: number;
    currency: string;
    recipientName: string;
    referenceNumber: string;
    transactionType: 'SENT' | 'RECEIVED' | 'BILL_PAYMENT' | 'UNKNOWN';
}

export const AiService = {
    /**
     * Parses a raw EcoCash SMS string into a structured JSON object.
     * Uses Gemini 1.5 Pro with a schema-enforced prompt.
     */
    async parseEcoCashSms(body: string): Promise<EcoCashParsed> {
        const prompt = `
            Extract the transaction details from this Zimbabwean EcoCash SMS.
            
            SMS: "${body}"
            
            Return a JSON object matching this TypeScript interface:
            {
                amount: number;
                currency: string;
                recipientName: string;
                referenceNumber: string;
                transactionType: 'SENT' | 'RECEIVED' | 'BILL_PAYMENT' | 'UNKNOWN';
            }
            
            Rules:
            1. If "sent to", type is 'SENT'. recipientName is the name after "sent to".
            2. If "received from", type is 'RECEIVED'. recipientName is the name after "received from".
            3. If "paid to", type is 'BILL_PAYMENT'. recipientName is the biller name/ID after "paid to".
            4. referenceNumber is the "Approval Code".
        `;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            return JSON.parse(text) as EcoCashParsed;
        } catch (error: any) {
            console.warn('[AiService] AI parsing failed, attempting regex fallback...', error.message);
            return this.regexFallback(body);
        }
    },

    /**
     * Fallback deterministic parser for common EcoCash formats.
     */
    regexFallback(body: string): EcoCashParsed {
        const sentRegex = /USD\s?([\d,.]+)\s?sent to\s?(.*?)\.?\s?Approval Code:\s?([\w.]+)/i;
        const receivedRegex = /USD\s?([\d,.]+)\s?from\s?(.*?)\.?\s?Approval Code:\s?([\w.]+)/i;
        const paidRegex = /USD\s?([\d,.]+)\s?paid to\s?(.*?)\.?\s?Approval Code:\s?([\w.]+)/i;

        let match = body.match(sentRegex);
        if (match) return {
            amount: parseFloat(match[1].replace(',', '')),
            currency: 'USD',
            recipientName: match[2].trim(),
            referenceNumber: match[3].trim(),
            transactionType: 'SENT'
        };

        match = body.match(receivedRegex);
        if (match) return {
            amount: parseFloat(match[1].replace(',', '')),
            currency: 'USD',
            recipientName: match[2].trim(),
            referenceNumber: match[3].trim(),
            transactionType: 'RECEIVED'
        };

        match = body.match(paidRegex);
        if (match) return {
            amount: parseFloat(match[1].replace(',', '')),
            currency: 'USD',
            recipientName: match[2].trim(),
            referenceNumber: match[3].trim(),
            transactionType: 'BILL_PAYMENT'
        };

        return {
            amount: 0,
            currency: 'USD',
            recipientName: 'Unknown',
            referenceNumber: 'Unknown',
            transactionType: 'UNKNOWN'
        };
    }
};
