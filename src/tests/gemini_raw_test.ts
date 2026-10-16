import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

async function testGemini() {
    const key = process.env.GEMINI_API_KEY;
    console.log("Using Key:", key?.substring(0, 5) + "...");
    const genAI = new GoogleGenerativeAI(key || "");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        const result = await model.generateContent("Hello?");
        console.log("Response:", result.response.text());
    } catch (err: any) {
        console.error("Gemini Error:", err.message);
        if (err.status) console.log("Status:", err.status);
    }
}

testGemini();
