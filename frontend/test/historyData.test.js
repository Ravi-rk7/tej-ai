import test from 'node:test';
import assert from 'node:assert/strict';
import { appendHistoryItems, normalizeHistoryPage } from '../src/lib/historyData.js';

test('normalizes a paginated history page and preserves scan IDs', () => {
    const page = normalizeHistoryPage({
        items: [{ scanId: 'scan-1', createdAt: '2026-08-22T00:00:00.000Z', glowScore: 84, concerns: ['Acne', 2] }],
        pageInfo: { hasMore: true, nextCursor: 'opaque' },
    });
    assert.deepEqual(page.items[0], { scanId: 'scan-1', createdAt: '2026-08-22T00:00:00.000Z', glowScore: 84, skinType: null, concerns: ['Acne'] });
    assert.deepEqual(page.pageInfo, { hasMore: true, nextCursor: 'opaque' });
});

test('deduplicates pages by scan ID', () => {
    const merged = appendHistoryItems([{ scanId: 'scan-1' }], [{ scanId: 'scan-1' }, { scanId: 'scan-2' }]);
    assert.deepEqual(merged.map((item) => item.scanId), ['scan-1', 'scan-2']);
});
