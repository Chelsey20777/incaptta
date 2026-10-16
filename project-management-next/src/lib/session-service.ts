import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

const ACTIVE_DAYS_MS = 14 * 24 * 60 * 60 * 1000
const GEO_CACHE_TTL_MS = 60 * 60 * 1000

type GeoLocation = {
  city?: string
  region?: string
  country?: string
}

type CachedGeo = {
  location: GeoLocation
  expiresAt: number
}

const geoCache = new Map<string, CachedGeo>()

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return true
  const normalized = ip.replace(/^::ffff:/, '')
  if (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost' ||
    normalized === '0.0.0.0'
  ) {
    return true
  }
  if (/^10\./.test(normalized)) return true
  if (/^192\.168\./.test(normalized)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true
  return false
}

export function parseDeviceName(userAgent: string): string {
  const ua = userAgent || ''
  let os = 'Unknown OS'
  if (/Windows NT/i.test(ua)) os = 'Windows'
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = 'Unknown Browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari'

  return `${os} · ${browser}`
}

async function lookupGeo(ip: string): Promise<GeoLocation> {
  if (isPrivateOrLocalIp(ip)) {
    return {}
  }

  const cached = geoCache.get(ip)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.location
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)

    if (!res.ok) throw new Error(`Geo lookup failed: ${res.status}`)

    const data = (await res.json()) as {
      city?: string
      region?: string
      country_name?: string
      error?: boolean
    }

    if (data.error) throw new Error('Geo lookup returned error')

    const location: GeoLocation = {
      city: data.city || undefined,
      region: data.region || undefined,
      country: data.country_name || undefined,
    }

    geoCache.set(ip, { location, expiresAt: Date.now() + GEO_CACHE_TTL_MS })
    return location
  } catch (err) {
    console.warn('[SessionService] Geo lookup failed for', ip, err)
    const fallback: GeoLocation = {}
    geoCache.set(ip, { location: fallback, expiresAt: Date.now() + GEO_CACHE_TTL_MS })
    return fallback
  }
}

function devicesCollection(uid: string) {
  return adminDb.collection('userSessions').doc(uid).collection('devices')
}

function toMillis(value: unknown): number | null {
  if (!value) return null
  if (typeof value === 'number') return value
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

export async function verifyActiveUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Unauthorized: No token provided'), { status: 401 })
  }
  const token = authHeader.split(' ')[1]
  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>
  try {
    decoded = await adminAuth.verifyIdToken(token, true)
  } catch (err) {
    const code = (err as { code?: string }).code || ''
    if (
      code === 'auth/id-token-expired' ||
      code === 'auth/id-token-revoked' ||
      code === 'auth/invalid-id-token' ||
      code === 'auth/argument-error'
    ) {
      throw Object.assign(
        new Error('Unauthorized: Your session has expired or was refreshed. Sign out and sign back in.'),
        { status: 401 },
      )
    }
    throw err
  }
  const roles = (decoded.roles as string[]) || []
  const isActive = decoded.isActive === true
  if (!isActive) {
    throw Object.assign(new Error('Forbidden: User account is inactive'), { status: 403 })
  }
  return { uid: decoded.uid, roles, isActive }
}

export function requireAdmin(roles: string[]) {
  if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')) return
  throw Object.assign(new Error('Forbidden: Insufficient permissions'), { status: 403 })
}

export async function heartbeatSession(params: {
  uid: string
  sessionId: string
  userAgent: string
  ip: string
  app?: string
}) {
  const { uid, sessionId, userAgent, ip } = params
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 128) {
    throw Object.assign(new Error('Invalid sessionId'), { status: 400 })
  }

  const location = await lookupGeo(ip)
  const deviceName = parseDeviceName(userAgent)
  const ref = devicesCollection(uid).doc(sessionId)
  const existing = await ref.get()
  const now = FieldValue.serverTimestamp()

  const payload: Record<string, unknown> = {
    sessionId,
    deviceName,
    userAgent: (userAgent || '').slice(0, 512),
    ip,
    location,
    app: params.app || 'project-management-next',
    lastSeenAt: now,
    revokedAt: null,
  }

  if (!existing.exists) {
    payload.createdAt = now
    await ref.set(payload)
  } else {
    await ref.set(payload, { merge: true })
  }

  return { sessionId, deviceName, ip, location }
}

export async function listUserSessions(uid: string) {
  // Avoid composite-index requirements: fetch then sort in memory
  const snap = await devicesCollection(uid).get()
  const cutoff = Date.now() - ACTIVE_DAYS_MS

  return snap.docs
    .map((doc) => {
      const data = doc.data()
      const lastSeenMs = toMillis(data.lastSeenAt)
      const createdMs = toMillis(data.createdAt)
      const revokedMs = toMillis(data.revokedAt)
      const isActive = !revokedMs && lastSeenMs !== null && lastSeenMs >= cutoff

      const loc = (data.location || {}) as GeoLocation
      const locationParts = [loc.city, loc.region, loc.country].filter(Boolean)
      const locationLabel = locationParts.length > 0 ? locationParts.join(', ') : 'Unknown'

      return {
        sessionId: doc.id,
        deviceName: data.deviceName || 'Unknown device',
        userAgent: data.userAgent || '',
        ip: data.ip || 'unknown',
        location: loc,
        locationLabel,
        app: data.app || 'project-management-next',
        createdAt: createdMs,
        lastSeenAt: lastSeenMs,
        revokedAt: revokedMs,
        isActive,
      }
    })
    .filter((s) => s.isActive)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
}

export async function revokeAllUserSessions(uid: string) {
  await adminAuth.revokeRefreshTokens(uid)
  await adminDb.collection('userStatus').doc(uid).set(
    { forceRefresh: Date.now() },
    { merge: true }
  )

  const snap = await devicesCollection(uid).get()
  const now = FieldValue.serverTimestamp()
  const batch = adminDb.batch()
  snap.docs.forEach((doc) => {
    batch.update(doc.ref, { revokedAt: now })
  })
  if (!snap.empty) {
    await batch.commit()
  }

  return { revoked: snap.size }
}

export async function acknowledgeForceRefresh(uid: string, signal: number) {
  const ref = adminDb.collection('userStatus').doc(uid)
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists || snapshot.get('forceRefresh') !== signal) return false
    transaction.update(ref, { forceRefresh: FieldValue.delete() })
    return true
  })
}
