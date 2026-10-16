import { MongoClient, type Db } from 'mongodb'

const uri = process.env.MONGODB_URI || ''

let clientPromise: Promise<MongoClient>

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

function createClientPromise(): Promise<MongoClient> {
  if (!uri) {
    return Promise.reject(
      new Error('[MongoDB] MONGODB_URI environment variable is not defined')
    )
  }
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  return client.connect()
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClientPromise()
  }
  clientPromise = global._mongoClientPromise
} else {
  // Edge / Serverless production caching across warm worker invocations
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = createClientPromise()
  }
  clientPromise = global._mongoClientPromise
}

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise
}

export async function getDatabase(dbName?: string): Promise<Db> {
  const client = await clientPromise
  const targetDb = dbName || process.env.MONGODB_DB_NAME || 'incaptta'
  return client.db(targetDb)
}

export default clientPromise
