import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildHistoryPage,
    decodeHistoryCursor,
    encodeHistoryCursor,
    parseHistoryQuery,
} from '../services/historyService.js';

const scanId = '11111111-1111-4111-8111-111111111111';
const row = (id, score) => ({ id, created_at: '2026-08-22T00:00:00.000Z', glow_score: score, skin_type: 'Oily', concerns: ['Acne'] });

test('encodes and validates an opaque owner-scoped cursor', () => {
    const cursor = encodeHistoryCursor({ createdAt: '2026-08-22T00:00:00.000Z', scanId });
    assert.deepEqual(decodeHistoryCursor(cursor), { createdAt: '2026-08-22T00:00:00.000Z', scanId });
    assert.throws(() => decodeHistoryCursor('not-valid'), (error) => error.statusCode === 400 && error.publicCode === 'HISTORY_CURSOR_INVALID');
});

test('validates bounded page limits', () => {
    assert.deepEqual(parseHistoryQuery({}), { limit: 12, cursor: null });
    assert.equal(parseHistoryQuery({ limit: '25' }).limit, 25);
    assert.throws(() => parseHistoryQuery({ limit: '26' }), (error) => error.publicCode === 'HISTORY_LIMIT_INVALID');
});

test('returns stable display items and a next cursor when another page exists', () => {
    const page = buildHistoryPage({
        rows: [row(scanId, 84), row('22222222-2222-4222-8222-222222222222', 80)],
        limit: 1,
        cursor: null,
    });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].scanId, scanId);
    assert.equal(page.items[0].glowScore, 84);
    assert.equal(page.pageInfo.hasMore, true);
    assert.deepEqual(decodeHistoryCursor(page.pageInfo.nextCursor), { createdAt: '2026-08-22T00:00:00.000Z', scanId });
    assert.equal('raw_api_response' in page.items[0], false);
});
