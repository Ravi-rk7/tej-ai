import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardHandler } from '../controllers/dashboardController.js';

const responseRecorder = () => {
    const result = { statusCode: undefined, headers: {}, body: undefined };
    return { result, response: { set(name, value) { result.headers[name.toLowerCase()] = value; return this; }, status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } } };
};

test('loads dashboard inputs for the authenticated owner and returns private data', async () => {
    const calls = [];
    const handler = createDashboardHandler({
        loadSubscription: async (...args) => { calls.push(['subscription', ...args]); return { plan: 'starter', status: 'active' }; },
        loadCount: async (...args) => { calls.push(['count', ...args]); return 2; },
        loadScans: async (...args) => { calls.push(['scans', ...args]); return [{ id: 'scan', glow_score: 84, created_at: '2026-08-22T00:00:00.000Z', skin_type: 'Combination', concerns: [] }]; },
        now: () => new Date('2026-08-22T12:00:00.000Z'),
        dashboardLogger: { error() {} },
    });
    const { response, result } = responseRecorder();
    await handler({ user: { id: 'owner-id' } }, response);
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers['cache-control'], 'private, no-store');
    assert.equal(result.body.data.latestScan.glowScore, 84);
    assert.ok(calls.some(([kind, userId]) => kind === 'subscription' && userId === 'owner-id'));
    assert.ok(calls.some(([kind, userId]) => kind === 'count' && userId === 'owner-id'));
});

test('hides dashboard database failures behind a retryable error', async () => {
    const handler = createDashboardHandler({ loadSubscription: async () => { throw new Error('private db detail'); }, dashboardLogger: { error() {} } });
    const { response, result } = responseRecorder();
    await handler({ user: { id: 'owner-id' } }, response);
    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.body, { success: false, error: 'Unable to load dashboard summary', code: 'DASHBOARD_FETCH_FAILED' });
});
