import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryHandler } from '../controllers/historyController.js';

const responseRecorder = () => {
    const result = { statusCode: undefined, headers: {}, body: undefined };
    return { result, response: { set(name, value) { result.headers[name.toLowerCase()] = value; return this; }, status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } } };
};

test('returns a paginated private history response', async () => {
    const calls = [];
    const handler = createHistoryHandler({
        loadHistory: async (...args) => { calls.push(args); return [{ id: '11111111-1111-4111-8111-111111111111', created_at: '2026-08-22T00:00:00.000Z', glow_score: 84, concerns: [] }]; },
        historyLogger: { error() {} },
    });
    const { response, result } = responseRecorder();
    await handler({ user: { id: 'owner-id' }, query: { limit: '12' } }, response);
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers['cache-control'], 'private, no-store');
    assert.equal(result.body.data.items[0].glowScore, 84);
    assert.equal(calls[0][0], 'owner-id');
    assert.equal(calls[0][1].limit, 12);
});

test('rejects invalid pagination before querying storage', async () => {
    let called = false;
    const handler = createHistoryHandler({ loadHistory: async () => { called = true; }, historyLogger: { error() {} } });
    const { response, result } = responseRecorder();
    await handler({ user: { id: 'owner-id' }, query: { limit: '100' } }, response);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, 'HISTORY_LIMIT_INVALID');
    assert.equal(called, false);
});

test('returns a generic retryable error for storage failures', async () => {
    const handler = createHistoryHandler({ loadHistory: async () => { throw new Error('private db detail'); }, historyLogger: { error() {} } });
    const { response, result } = responseRecorder();
    await handler({ user: { id: 'owner-id' }, query: {} }, response);
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.body, { success: false, error: 'Unable to load history', code: 'HISTORY_FETCH_FAILED' });
});
