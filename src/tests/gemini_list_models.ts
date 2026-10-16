import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key || "");
    try {
        // There isn't a direct listModels in the simple SDK, but we can try a few common names
        const models = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro"];
        for (const m of models) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                await model.generateContent("test");
                console.log(`Model ${m} is AVAILABLE`);
            } catch (e: any) {
                console.log(`Model ${m} FAILED: ${e.message} (Status: ${e.status})`);
            }
        }
    } catch (err: any) {
        console.error("List Error:", err.message);
    }
}

listModels();
