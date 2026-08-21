import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGlowScore, createGlowScoreCalculator } from '../services/glowScoreService.js';

test('passes totalScore through unchanged without a previous scan', async () => {
    const result = await calculateGlowScore({ totalScore: 84 });
    assert.deepEqual(result, { score: 84, trend: 'stable' });
});

test('preserves the provider score at the 0 and 100 bounds', async () => {
    assert.equal((await calculateGlowScore({ totalScore: 0 })).score, 0);
    assert.equal((await calculateGlowScore({ totalScore: 100 })).score, 100);
});

test('classifies trend against the latest prior scan without changing the score', async () => {
    const calculate = createGlowScoreCalculator({ latestScanLoader: async () => ({ glow_score: 80 }) });
    assert.deepEqual(await calculate({ totalScore: 84 }, 'user'), { score: 84, trend: 'improving' });
    assert.deepEqual(await calculate({ totalScore: 76 }, 'user'), { score: 76, trend: 'declining' });
    assert.deepEqual(await calculate({ totalScore: 80 }, 'user'), { score: 80, trend: 'stable' });
});
