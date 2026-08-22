import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardSummary, buildTrend } from '../services/dashboardService.js';

const now = new Date('2026-08-22T12:00:00.000Z');
const scan = (id, score, createdAt) => ({
    id,
    glow_score: score,
    created_at: createdAt,
    skin_type: 'Combination',
    concerns: ['Acne'],
});

test('builds a privacy-safe new-user dashboard with UTC reset and free usage', () => {
    const result = buildDashboardSummary({ subscription: null, scanCount: 0, scans: [], now });
    assert.equal(result.latestScan, null);
    assert.equal(result.trend.direction, 'insufficient_data');
    assert.deepEqual(result.usage, {
        used: 0,
        limit: 1,
        remaining: 1,
        resetAt: '2026-09-01T00:00:00.000Z',
    });
    assert.deepEqual(result.subscription, { plan: 'free', status: 'active' });
    assert.equal('userId' in result, false);
});

test('builds chronological improving, declining, and stable trends', () => {
    const rows = [
        scan('new', 84, '2026-08-22T00:00:00.000Z'),
        scan('old', 72, '2026-08-01T00:00:00.000Z'),
    ];
    assert.deepEqual(buildTrend(rows), {
        direction: 'improving',
        delta: 12,
        points: [
            { scanId: 'old', createdAt: '2026-08-01T00:00:00.000Z', glowScore: 72 },
            { scanId: 'new', createdAt: '2026-08-22T00:00:00.000Z', glowScore: 84 },
        ],
    });
    assert.equal(buildTrend([scan('new', 70, '2026-08-22T00:00:00.000Z'), scan('old', 80, '2026-08-01T00:00:00.000Z')]).direction, 'declining');
    assert.equal(buildTrend([scan('new', 80, '2026-08-22T00:00:00.000Z'), scan('old', 80, '2026-08-01T00:00:00.000Z')]).direction, 'stable');
});

test('orders latest data by timestamp instead of trusting query order', () => {
    const result = buildDashboardSummary({
        subscription: { plan: 'free', status: 'active' },
        scanCount: 2,
        scans: [
            scan('older', 70, '2026-08-01T00:00:00.000Z'),
            scan('newer', 80, '2026-08-22T00:00:00.000Z'),
        ],
        now,
    });
    assert.equal(result.latestScan.scanId, 'newer');
    assert.equal(result.trend.direction, 'improving');
});

test('keeps only display-safe concern labels and latest scan fields', () => {
    const result = buildDashboardSummary({
        subscription: { plan: 'growth', status: 'active' },
        scanCount: 4,
        scans: [{ ...scan('latest', 91, '2026-08-22T00:00:00.000Z'), concerns: [{ label: 'Pigmentation' }, { key: 'private' }, null], raw_api_response: { secret: true } }],
        now,
    });
    assert.deepEqual(result.latestScan, {
        scanId: 'latest',
        createdAt: '2026-08-22T00:00:00.000Z',
        glowScore: 91,
        skinType: 'Combination',
        concerns: ['Pigmentation'],
    });
    assert.deepEqual(result.usage, { used: 4, limit: 30, remaining: 26, resetAt: '2026-09-01T00:00:00.000Z' });
});
