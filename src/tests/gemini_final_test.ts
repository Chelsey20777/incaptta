import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

async function finalTest() {
    const key = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(key || "");
    const modelsToTry = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash"];

    console.log("--- Testing Models ---");
    for (const m of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            const result = await model.generateContent("test");
            console.log(`[SUCCESS] ${m}:`, result.response.text());
        } catch (e: any) {
            console.log(`[FAILED] ${m}:`, e.message);
        }
    }
}

finalTest();
