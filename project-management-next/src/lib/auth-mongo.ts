import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { getDatabase } from './mongodb'

export interface MongoUser {
  _id: string
  email: string
  passwordHash: string
  name: string
  roles: string[]
  isActive: boolean
  company?: string
  modules?: {
    mbdi?: boolean
    [key: string]: boolean | undefined
  }
  employeeId?: string | null
  signatureUrl?: string | null
  position?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface MongoUserSessionPayload {
  uid: string
  sub: string
  email: string
  name: string
  roles: string[]
  isActive: boolean
  company?: string
  modules?: Record<string, boolean | undefined>
  employeeId?: string | null
  signatureUrl?: string | null
  position?: string | null
}

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'incaptta-secure-session-secret-key-32charsmin'
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING)
const JWT_EXPIRATION = '7d'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSessionToken(user: MongoUser): Promise<string> {
  return new SignJWT({
    uid: user._id,
    sub: user._id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    isActive: user.isActive,
    company: user.company,
    modules: user.modules,
    employeeId: user.employeeId ?? null,
    signatureUrl: user.signatureUrl ?? null,
    position: user.position ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(JWT_SECRET)
}

export async function verifySessionToken(token: string): Promise<MongoUserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as MongoUserSessionPayload
  } catch {
    return null
  }
}

export async function findUserByEmail(email: string): Promise<MongoUser | null> {
  const db = await getDatabase()
  const normalizedEmail = email.trim().toLowerCase()
  const user = await db.collection<MongoUser>('users').findOne({ email: normalizedEmail })
  return user
}

export async function findUserById(id: string): Promise<MongoUser | null> {
  const db = await getDatabase()
  const user = await db.collection<MongoUser>('users').findOne({ _id: id })
  return user
}

export async function createMongoUser(userData: {
  id?: string
  email: string
  password: string
  name: string
  roles: string[]
  isActive?: boolean
  company?: string
  modules?: Record<string, boolean>
  employeeId?: string | null
  position?: string | null
}): Promise<MongoUser> {
  const db = await getDatabase()
  const normalizedEmail = userData.email.trim().toLowerCase()

  const existing = await db.collection<MongoUser>('users').findOne({ email: normalizedEmail })
  if (existing) {
    throw new Error(`User with email ${normalizedEmail} already exists`)
  }

  const passwordHash = await hashPassword(userData.password)
  const now = new Date()
  const newUser: MongoUser = {
    _id: userData.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email: normalizedEmail,
    passwordHash,
    name: userData.name,
    roles: userData.roles,
    isActive: userData.isActive !== false,
    company: userData.company || 'Incaptta Private Limited',
    modules: userData.modules || {},
    employeeId: userData.employeeId || null,
    position: userData.position || null,
    createdAt: now,
    updatedAt: now,
  }

  await db.collection<MongoUser>('users').insertOne(newUser)
  return newUser
}
