import { isDeepStrictEqual } from 'node:util';

export function inventoryChanges(before: Record<string, unknown> = {}, after: Record<string, unknown> = {}) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(field => {
        const beforePresent = Object.prototype.hasOwnProperty.call(before, field);
        const afterPresent = Object.prototype.hasOwnProperty.call(after, field);
        if (beforePresent === afterPresent && isDeepStrictEqual(before[field], after[field])) return [];
        return [{ field, beforePresent, afterPresent, before: beforePresent ? before[field] : null, after: afterPresent ? after[field] : null }];
    });
}

export async function createAuditOnce(ref: { create: (data: object) => Promise<unknown> }, data: object) {
    try { await ref.create(data); }
    catch (error) {
        if ((error as { code?: number }).code !== 6) throw error;
    }
}
