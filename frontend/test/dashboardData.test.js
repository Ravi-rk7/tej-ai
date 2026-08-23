import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDashboard } from '../src/lib/dashboardData.js';

test('normalizes a dashboard summary without fabricating scores', () => {
    const result = normalizeDashboard({
        latestScan: { scanId: 'scan-1', createdAt: '2026-08-22T00:00:00.000Z', glowScore: 84, skinType: 'Combination', concerns: ['Acne'] },
        trend: { direction: 'improving', delta: 4, points: [{ scanId: 'scan-1', glowScore: 84, createdAt: '2026-08-22T00:00:00.000Z' }] },
        usage: { used: 1, limit: 15, remaining: 14, resetAt: '2026-09-01T00:00:00.000Z' },
        subscription: { plan: 'starter', status: 'active' },
    });
    assert.equal(result.latestScan.glowScore, 84);
    assert.equal(result.usage.remaining, 14);
    assert.equal(result.trend.direction, 'improving');
});

test('uses safe defaults for malformed optional dashboard sections', () => {
    const result = normalizeDashboard({ latestScan: { glowScore: 1000, concerns: [1, 'Acne'] }, trend: { direction: 'unsupported' }, usage: {}, subscription: {} });
    assert.equal(result.latestScan.glowScore, null);
    assert.deepEqual(result.latestScan.concerns, ['Acne']);
    assert.equal(result.trend.direction, 'insufficient_data');
    assert.equal(result.subscription.plan, 'free');
    assert.equal(result.subscription.status, 'unknown');
});
