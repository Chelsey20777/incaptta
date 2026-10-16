import { MongoClient, Db } from 'mongodb';
import * as dotenv from 'dotenv';

if (process.env.npm_lifecycle_event === 'dev' || process.env.LOCAL_SERVER === 'true') {
    dotenv.config();
}

const uri = process.env.MONGODB_URI || '';
let clientPromise: Promise<MongoClient> | null = null;

export function getMongoClient(): Promise<MongoClient> {
    if (!uri) {
        return Promise.reject(new Error('[MongoDB] MONGODB_URI environment variable is not defined'));
    }
    if (!clientPromise) {
        const client = new MongoClient(uri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        clientPromise = client.connect();
    }
    return clientPromise;
}

export async function getDatabase(dbName?: string): Promise<Db> {
    const client = await getMongoClient();
    const targetDb = dbName || process.env.MONGODB_DB_NAME || 'incaptta';
    return client.db(targetDb);
}
