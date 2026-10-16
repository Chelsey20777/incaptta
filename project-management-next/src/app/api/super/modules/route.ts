import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = await adminAuth.verifyIdToken(token, true);
    const roles = decoded.roles || [];
    const isActive = decoded.isActive === true;

    if (!isActive) {
      return NextResponse.json({ error: 'Forbidden: User account is inactive' }, { status: 403 });
    }

    if (!roles.includes('SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden: Super Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { role, modules } = body;

    if (!role || !modules) {
      return NextResponse.json({ error: 'Missing role or modules configuration' }, { status: 400 });
    }

    await adminDb.collection('rolePermissions').doc('config').set(
      { [role]: { ...modules }, updatedAt: new Date() },
      { merge: true }
    );

    return NextResponse.json({ success: true, message: `Modules updated for role: ${role}` });
  } catch (err: any) {
    console.error('[API/Super/Modules] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
