import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

async function checkSuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: No token provided');
  }
  const token = authHeader.split(' ')[1];
  const decoded = await adminAuth.verifyIdToken(token, true);
  const roles = decoded.roles || [];
  const isActive = decoded.isActive === true;
  if (!isActive) {
    throw new Error('Forbidden: User account is inactive');
  }
  if (!roles.includes('SUPER_ADMIN')) {
    throw new Error('Forbidden: Super Admin access required');
  }
}

export async function GET(req: NextRequest) {
  try {
    await checkSuperAdmin(req);
    const snap = await adminDb.collection('roles').get();
    const roles = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(roles);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes('Forbidden') ? 403 : err.message.includes('Unauthorized') ? 401 : 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await checkSuperAdmin(req);
    const body = await req.json();
    const { id, name, permissions } = body;

    // Validation pattern: uppercase, no spaces
    const idPattern = /^[A-Z0-9_]+$/;
    if (!id || !idPattern.test(id)) {
      return NextResponse.json({ error: 'Invalid Role ID. Must be uppercase alphanumeric/underscore only.' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Role display name is required.' }, { status: 400 });
    }

    const batch = adminDb.batch();

    // 1. Save role config
    const roleRef = adminDb.collection('roles').doc(id);
    batch.set(roleRef, {
      name,
      permissions: permissions || [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // 2. Map config into rolePermissions config (do not force MBDI — per-user grant)
    const permConfigRef = adminDb.collection('rolePermissions').doc('config');
    const modulesMap: Record<string, boolean> = {};
    if (permissions) {
      permissions.forEach((mod: string) => {
        modulesMap[mod] = true;
      });
    }
    batch.set(permConfigRef, { [id]: modulesMap }, { merge: true });

    await batch.commit();

    return NextResponse.json({ success: true, message: `Role ${id} created.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes('Forbidden') ? 403 : err.message.includes('Unauthorized') ? 401 : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await checkSuperAdmin(req);
    const { searchParams } = new URL(req.url);
    const roleId = searchParams.get('id');

    if (!roleId) {
      return NextResponse.json({ error: 'Role ID is required.' }, { status: 400 });
    }

    // Guard: Prevent deleting standard system roles
    const protectedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'STOREKEEPER', 'TECHNICAL', 'DIRECTOR', 'POULTRY_MANAGER', 'FARM_HAND', 'MBDI_STAFF'];
    if (protectedRoles.includes(roleId)) {
      return NextResponse.json({ error: 'Cannot delete core system roles.' }, { status: 400 });
    }

    // Check if role is currently assigned to any users
    const userQuery = await adminDb.collection('users').where('roles', 'array-contains', roleId).get();
    if (!userQuery.empty) {
      return NextResponse.json({ error: 'Cannot delete: Role is currently assigned to active users.' }, { status: 400 });
    }

    const batch = adminDb.batch();

    // Delete from roles collection
    batch.delete(adminDb.collection('roles').doc(roleId));

    // Delete from rolePermissions config
    const configRef = adminDb.collection('rolePermissions').doc('config');
    batch.update(configRef, {
      [roleId]: FieldValue.delete()
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: `Role ${roleId} deleted.` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes('Forbidden') ? 403 : err.message.includes('Unauthorized') ? 401 : 500 });
  }
}
