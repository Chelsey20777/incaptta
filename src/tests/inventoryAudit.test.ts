import { createAuditOnce, inventoryChanges } from '../inventory/audit';

describe('inventory audit', () => {
    test('captures additions, removals, null and exact whitespace', () => {
        const changes = inventoryChanges({ name: 'Motor ', removed: null, unchanged: 0 }, { name: 'Motor', added: null, unchanged: 0 });
        expect(changes).toEqual([
            { field: 'added', beforePresent: false, afterPresent: true, before: null, after: null },
            { field: 'name', beforePresent: true, afterPresent: true, before: 'Motor ', after: 'Motor' },
            { field: 'removed', beforePresent: true, afterPresent: false, before: null, after: null },
        ]);
    });
    test('captures nested metadata and stock updates without treating unchanged metadata as a new actor', () => {
        expect(inventoryChanges({ onHand: 4, updatedBy: { uid: 'old' } }, { onHand: 14, updatedBy: { uid: 'old' } })).toEqual([
            { field: 'onHand', beforePresent: true, afterPresent: true, before: 4, after: 14 },
        ]);
        expect(inventoryChanges({}, { updatedBy: { uid: 'a' } })[0].after).toEqual({ uid: 'a' });
    });
    test('captures creation and deletion', () => {
        expect(inventoryChanges(undefined, { name: 'New' })[0].beforePresent).toBe(false);
        expect(inventoryChanges({ name: 'Deleted' }, undefined)[0].afterPresent).toBe(false);
        expect(inventoryChanges({ a: [1, null] }, { a: [1, null] })).toEqual([]);
    });
    test('duplicate delivery succeeds but operational errors retry', async () => {
        const create = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce({ code: 6 }).mockRejectedValueOnce(new Error('unavailable'));
        await expect(createAuditOnce({ create }, {})).resolves.toBeUndefined();
        await expect(createAuditOnce({ create }, {})).resolves.toBeUndefined();
        await expect(createAuditOnce({ create }, {})).rejects.toThrow('unavailable');
    });
});
