import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet, importJWK } from 'jose';
import type { JWTPayload } from 'jose';
import { DEFAULT_ROLE_PERMISSIONS, unionRoleModules, type ModuleKey, type PermissionsConfig } from '@/constants/modules';
import {
  assertEnvironmentIsolation,
  parseDeploymentEnvironment,
  requireConfigValue,
} from '@/lib/deployment-config';

const deploymentEnvironment = parseDeploymentEnvironment(process.env.DEPLOYMENT_ENV);
const firebaseProjectId = requireConfigValue('FIREBASE_PROJECT_ID', process.env.FIREBASE_PROJECT_ID);
assertEnvironmentIsolation(deploymentEnvironment, { FIREBASE_PROJECT_ID: firebaseProjectId });

// Protected routes that require authentication and specific roles
export const routeRoles: Record<string, string[]> = {
  '/admin': ['ADMIN', 'SUPER_ADMIN'],
  '/accounting': ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'],
  '/hr': ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'],
  '/job-cards': ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'SALES', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'],
  '/inventory/fulfilment': ['STOREKEEPER', 'TECHNICAL', 'MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'],
  '/inventory': ['STOREKEEPER', 'MANAGER', 'SALES', 'ADMIN', 'SUPER_ADMIN']
};

const pageModuleMap: Record<string, ModuleKey> = {
  '/inventory/fulfilment': 'pmo',
  '/inventory': 'inventory',
  '/job-cards': 'jobCards',
  '/subcontractors': 'subcontractors',
  '/commissions': 'commissions',
  '/mbdi': 'mbdi',
  '/opex': 'opex',
  '/finance': 'finance',
  '/accounting': 'finance',
  '/ledger': 'finance',
  '/transfers': 'finance',
  '/business-loans': 'finance',
  '/payment-submissions': 'finance',
  '/procurement': 'procurement',
  '/crm': 'crm',
  '/tasks': 'tasks',
  '/hr': 'hr',
  '/analytics': 'analytics',
  '/support': 'support',
  '/admin': 'admin',
  '/settings-unlock': 'admin',
  '/container-access': 'containerAccess',
  '/agric-structures': 'agricStructures',
  '/projects': 'agricStructures',
  '/poultry': 'poultry',
  '/chat': 'chat',
  '/tools': 'tools',
  '/equipment-hire': 'tools',
  '/bom-templates': 'jobCards',
  '/dashboard': 'dashboard'
};

const apiModuleMap: Record<string, ModuleKey> = {
  '/api/inventory/fulfilment': 'pmo',
  '/api/inventory': 'inventory',
  '/api/job-cards': 'jobCards',
  '/api/subcontractors': 'subcontractors',
  '/api/crm': 'crm',
  '/api/hr': 'hr',
  '/api/transfers': 'finance'
};

const PMO_ONLY_API_ALLOWLIST = ['/api/inventory/fulfilment', '/api/sessions/heartbeat', '/api/super/profile', '/api/auth/force-refresh/ack'];

// In-memory permissions configuration cache (60s TTL)
type RolePermissions = Record<string, Record<string, boolean>>;
type FirestoreValue = {
  booleanValue?: boolean;
  mapValue?: { fields?: Record<string, FirestoreValue> };
};
type FirestoreDocument = { fields?: Record<string, FirestoreValue> };

let permissionsCache: { config: RolePermissions; expiresAt: number } | null = null;

export async function getRolePermissions(): Promise<RolePermissions | null> {
  const now = Date.now();
  if (permissionsCache && permissionsCache.expiresAt > now) {
    return permissionsCache.config;
  }
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseProjectId)}/databases/(default)/documents/rolePermissions/config`
    );
    if (!res.ok) throw new Error('Firestore REST read failed');
    const data = await res.json() as FirestoreDocument;
    
    const config: RolePermissions = {};
    const fields = data.fields || {};
    for (const key of Object.keys(fields)) {
      if (fields[key].mapValue) {
        const mapVal = fields[key].mapValue.fields || {};
        config[key] = {};
        for (const subKey of Object.keys(mapVal)) {
          config[key][subKey] = mapVal[subKey].booleanValue ?? false;
        }
      }
    }
    permissionsCache = { config, expiresAt: now + 60000 };
    return config;
  } catch (err) {
    console.error('[Middleware] Failed to fetch permissions:', err);
    return null;
  }
}

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com')
);

// Cryptographic token verification utilizing jose library (supports MongoDB JWT and Firebase JWKS)
export async function verifyIdToken(token: string, mockJwk?: JsonWebKey): Promise<JWTPayload | null> {
  // 1. Try verifying against self-hosted MongoDB JWT secret first
  const mongoJwtSecret = process.env.JWT_SECRET || 'incaptta-secure-session-secret-key-32charsmin';
  try {
    const secretKey = new TextEncoder().encode(mongoJwtSecret);
    const { payload } = await jwtVerify(token, secretKey);
    return payload;
  } catch {
    // Not a local HMAC token, continue to JWKS / mock
  }

  // 2. Fallback to Firebase JWKS / Mock JWK for hybrid migration compatibility
  try {
    if (mockJwk) {
      const key = await importJWK(mockJwk, 'RS256');
      const { payload } = await jwtVerify(token, key);
      return payload;
    } else {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${firebaseProjectId}`,
        audience: firebaseProjectId
      });
      return payload;
    }
  } catch (err) {
    console.error('[Middleware] JWT verification failed:', err);
    return null;
  }
}

interface MiddlewareOptions {
  mockJwk?: JsonWebKey;
  mockPermissions?: RolePermissions;
}

export async function middleware(request: NextRequest, options?: MiddlewareOptions) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const sessionCookie = request.cookies.get('__session')?.value;
  const token = bearerToken || sessionCookie;

  const matchedRoute = Object.keys(routeRoles).sort((a, b) => b.length - a.length).find(route =>
    pathname === route || pathname.startsWith(`${route}/`)
  );
  const moduleMap = isApi ? apiModuleMap : pageModuleMap;
  const matchedModulePrefix = Object.keys(moduleMap).sort((a, b) => b.length - a.length).find(prefix =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!matchedRoute && !matchedModulePrefix && !isApi) return NextResponse.next();
  if (!token) {
    if (isApi) {
      // Unmapped/public APIs keep their route-level authentication behavior.
      if (!matchedModulePrefix) return NextResponse.next();
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl, 302);
  }

  // Cryptographically verify ID token
  const claims = await verifyIdToken(token, options?.mockJwk);
  if (!claims || claims.isActive !== true) {
    if (isApi) return NextResponse.next();
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl, 302);
  }

  const userRoles: string[] = Array.isArray(claims.roles)
    ? claims.roles
    : typeof claims.roles === 'string' ? [claims.roles] : [];

  const permissions = options?.mockPermissions || await getRolePermissions() || DEFAULT_ROLE_PERMISSIONS;
  const effectiveModules = unionRoleModules(userRoles, permissions as PermissionsConfig);

  if (isApi) {
    const moduleKey = matchedModulePrefix ? moduleMap[matchedModulePrefix] : null;
    if (moduleKey && !effectiveModules[moduleKey]) {
      return NextResponse.json({ error: 'Module access denied' }, { status: 403 });
    }
    const pmoOnly = effectiveModules.pmo && !Object.entries(effectiveModules).some(([key, enabled]) => key !== 'pmo' && enabled);
    const isAllowedUtility = PMO_ONLY_API_ALLOWLIST.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (pmoOnly && !moduleKey && !isAllowedUtility) {
      return NextResponse.json({ error: 'STOREKEEPER accounts are restricted to PMO APIs' }, { status: 403 });
    }
    return NextResponse.next();
  }

  const isStaticAsset = /\.[a-z0-9]{1,8}$/i.test(pathname) || pathname.startsWith('/_next/');
  if (isStaticAsset) return NextResponse.next();

  // A PMO-only account may visit PMO and account utilities. This fallback also
  // blocks pages not yet represented in the module map from being opened by URL.
  const pmoOnly = effectiveModules.pmo && !Object.entries(effectiveModules).some(([key, enabled]) => key !== 'pmo' && enabled);
  if (pmoOnly) {
    if (pathname === '/') return NextResponse.redirect(new URL('/inventory/fulfilment', request.url), 302);
    const allowedPage = pathname === '/inventory/fulfilment' || pathname.startsWith('/inventory/fulfilment/') ||
      pathname === '/profile' || pathname === '/unauthorized' || pathname === '/login' || pathname === '/setup-mfa' || pathname.startsWith('/verify/');
    if (!allowedPage) return NextResponse.redirect(new URL('/unauthorized', request.url), 302);
  }

  // 1. Role Route Access Check
  if (matchedRoute) {
    const requiredRoles = routeRoles[matchedRoute];
    const hasAccess = userRoles.some(role => requiredRoles.includes(role));
    if (!hasAccess && !userRoles.includes('SUPER_ADMIN')) {
      return NextResponse.redirect(new URL('/unauthorized', request.url), 302);
    }
  }

  // 2. Dynamic Module Toggle Enforcement
  if (matchedModulePrefix && !effectiveModules[moduleMap[matchedModulePrefix]]) {
    return NextResponse.redirect(new URL('/unauthorized', request.url), 302);
  }

  return NextResponse.next();
}

// Ensure middleware runs only on relevant application paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js (service worker)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js).*)',
    '/api/:path*'
  ],
};
