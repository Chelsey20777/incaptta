import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/incaptta'
const dbName = process.env.MONGODB_DB_NAME || 'incaptta'

const email = (process.argv[2] || process.env.ADMIN_EMAIL || 'admin@incaptta.com').toLowerCase().trim()
const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'Admin@123456'

console.log('--- Incaptta MongoDB Admin Seeder ---')
console.log(`Connecting to database: ${dbName}`)
console.log(`Target admin email: ${email}`)

async function seedAdmin() {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    console.log('Connected to MongoDB successfully.')

    const db = client.db(dbName)
    const usersCollection = db.collection('users')

    const passwordHash = await bcrypt.hash(password, 10)
    const now = new Date()

    const allRoles = [
      'SUPER_ADMIN',
      'ADMIN',
      'MANAGER',
      'ACCOUNTANT',
      'SALES',
      'TECHNICAL',
      'STOREKEEPER',
      'DIRECTOR',
    ]

    const allModules = {
      mbdi: true,
      opex: true,
      pmo: true,
      inventory: true,
      jobCards: true,
      crm: true,
      tasks: true,
      hr: true,
      analytics: true,
      subcontractors: true,
      commissions: true,
      containerAccess: true,
      agricStructures: true,
      poultry: true,
      chat: true,
      tools: true,
      dashboard: true,
    }

    const result = await usersCollection.updateOne(
      { email },
      {
        $set: {
          email,
          passwordHash,
          name: 'Super Administrator',
          roles: allRoles,
          isActive: true,
          company: 'Incaptta Private Limited',
          modules: allModules,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: `admin_${Date.now()}`,
          createdAt: now,
        },
      },
      { upsert: true }
    )

    console.log('\n SUCCESS: Admin user seeded in MongoDB!')
    console.log(`Email:    ${email}`)
    console.log(`Password: ${password}`)
    console.log(`Roles:    ${allRoles.join(', ')}`)
    console.log('You can now log in using these credentials on the Incaptta login page.\n')
  } catch (error) {
    console.error('Failed to seed admin user:', error)
    process.exit(1)
  } finally {
    await client.close()
  }
}

seedAdmin()
