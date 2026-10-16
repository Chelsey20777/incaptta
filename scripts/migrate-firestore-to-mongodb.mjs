/**
 * Incaptta: Google Cloud Firestore -> MongoDB Atlas Migration Utility
 * 
 * Usage:
 *   node scripts/migrate-firestore-to-mongodb.mjs
 * 
 * Requirements:
 *   MONGODB_URI environment variable (or passed via --uri="mongodb+srv://...")
 *   Firebase credentials (service-account file or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { MongoClient } from 'mongodb'
import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

// 1. Resolve MongoDB Atlas URI
const mongoUri = process.env.MONGODB_URI || process.argv.find(a => a.startsWith('--uri='))?.split('=')[1]
const mongoDbName = process.env.MONGODB_DB_NAME || 'incaptta'

if (!mongoUri) {
  console.error('\n[ERROR] Missing MONGODB_URI environment variable.')
  console.error('Please set MONGODB_URI in your .env or pass --uri="mongodb+srv://..."\n')
  process.exit(1)
}

// 2. Initialize Firebase Admin
function initFirebase() {
  if (admin.apps.length > 0) return admin.app()

  // Try service account file in root
  const rootFiles = fs.readdirSync(process.cwd())
  const saFile = rootFiles.find(f => f.startsWith('incaptta-pro-') && f.endsWith('.json')) || 'service-account-key.json'
  
  if (fs.existsSync(saFile)) {
    console.log(`[Firebase] Using service account: ${saFile}`)
    const serviceAccount = JSON.parse(fs.readFileSync(saFile, 'utf8'))
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || 'incaptta-pro',
    })
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log('[Firebase] Using FIREBASE_SERVICE_ACCOUNT_KEY from environment')
    const config = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    return admin.initializeApp({
      credential: admin.credential.cert(config),
      projectId: config.project_id || 'incaptta-pro',
    })
  }

  console.log('[Firebase] Using default application credentials...')
  return admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'incaptta-pro',
  })
}

// Transform Firestore data (timestamps, references) to clean MongoDB BSON objects
function transformFirestoreData(data) {
  if (!data || typeof data !== 'object') return data

  // Handle Firestore Timestamp
  if (data._seconds !== undefined && data._nanoseconds !== undefined) {
    return new Date(data._seconds * 1000 + data._nanoseconds / 1000000)
  }
  if (typeof data.toDate === 'function') {
    return data.toDate()
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map(item => transformFirestoreData(item))
  }

  // Handle Objects
  const transformed = {}
  for (const [key, value] of Object.entries(data)) {
    transformed[key] = transformFirestoreData(value)
  }
  return transformed
}

const COLLECTIONS_TO_MIGRATE = [
  'users',
  'inventoryItems',
  'jobCards',
  'clients',
  'customers',
  'quotations',
  'invoices',
  'operationalExpenses',
  'transfers',
  'expenseLedger',
  'stockLedger',
  'bomTemplates',
  'mbdiInitiatives',
  'equipmentHire',
  'tasks',
  'rolePermissions',
]

async function runMigration() {
  console.log('====================================================')
  console.log('  Incaptta: Firestore -> MongoDB Atlas Migration    ')
  console.log('====================================================')
  console.log(`Target Database: ${mongoDbName}`)

  const app = initFirebase()
  const firestore = app.firestore()
  const mongoClient = new MongoClient(mongoUri)

  await mongoClient.connect()
  console.log('Connected to MongoDB Atlas successfully!\n')

  const mongoDb = mongoClient.db(mongoDbName)
  const report = {}

  for (const colName of COLLECTIONS_TO_MIGRATE) {
    process.stdout.write(`Migrating collection: [${colName}] ... `)
    try {
      const snapshot = await firestore.collection(colName).get()
      if (snapshot.empty) {
        console.log('0 documents found (skipped)')
        report[colName] = { count: 0, status: 'empty' }
        continue
      }

      const mongoCollection = mongoDb.collection(colName)
      const operations = []

      for (const doc of snapshot.docs) {
        const rawData = doc.data()
        const cleanData = transformFirestoreData(rawData)
        cleanData._id = doc.id // Preserve original Firestore ID

        operations.push({
          replaceOne: {
            filter: { _id: doc.id },
            replacement: cleanData,
            upsert: true,
          },
        })
      }

      if (operations.length > 0) {
        // Run in batches of 500
        const batchSize = 500
        for (let i = 0; i < operations.length; i += batchSize) {
          const batch = operations.slice(i, i + batchSize)
          await mongoCollection.bulkWrite(batch)
        }
      }

      console.log(`DONE (${snapshot.size} documents)`)
      report[colName] = { count: snapshot.size, status: 'success' }
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      report[colName] = { count: 0, status: 'error', error: err.message }
    }
  }

  // Create essential indexes in MongoDB Atlas
  console.log('\nCreating indexes in MongoDB Atlas...')
  try {
    await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true })
    await mongoDb.collection('inventoryItems').createIndex({ sku: 1 })
    await mongoDb.collection('jobCards').createIndex({ jobNumber: 1 })
    await mongoDb.collection('jobCards').createIndex({ status: 1 })
    await mongoDb.collection('clients').createIndex({ email: 1 })
    console.log('Indexes created successfully.')
  } catch (idxErr) {
    console.warn('Index creation notice:', idxErr.message)
  }

  console.log('\n====================================================')
  console.log('  Migration Completed! Summary:                     ')
  console.log('====================================================')
  console.table(report)

  fs.writeFileSync('migration-report.json', JSON.stringify(report, null, 2))
  console.log('Saved report to migration-report.json\n')

  await mongoClient.close()
}

runMigration().catch(err => {
  console.error('\nFatal error during migration:', err)
  process.exit(1)
})
