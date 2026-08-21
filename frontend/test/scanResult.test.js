import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScanResult } from '../src/lib/scanResult.js';

const canonical = {
    scanId: 'scan-id',
    glowScore: 84,
    skinType: 'Combination',
    concerns: ['Pigmentation'],
    concernDetails: [{ key: 'pigmentation', label: 'Pigmentation', score: 68, severity: 'moderate' }],
    routine: {
        schemaVersion: 1,
        source: 'fallback',
        morning: [{ name: 'Gentle cleanser', instructions: 'Cleanse.' }],
        night: [{ name: 'Barrier moisturizer', instructions: 'Moisturize.' }],
        safety: { patchTest: 'Patch-test.', spf: 'SPF 30+.', cautions: 'Check first.', disclaimer: 'Not diagnosis.', dermatologist: null },
    },
};

test('normalizes the canonical scan result with structured concerns and routine', () => {
    const result = normalizeScanResult(canonical);
    assert.equal(result.valid, true);
    assert.equal(result.glowScore, 84);
    assert.equal(result.concerns[0].severity, 'moderate');
    assert.equal(result.routine.morning[0].name, 'Gentle cleanser');
    assert.equal(result.routine.source, 'fallback');
});

test('accepts legacy string concerns and flat routine arrays', () => {
    const result = normalizeScanResult({
        glowScore: 78,
        concerns: ['Acne'],
        routine: ['Cleanser', 'Moisturizer', 'SPF'],
    });
    assert.equal(result.valid, true);
    assert.equal(result.concerns[0].label, 'Acne');
    assert.equal(result.routine.morning.length, 3);
    assert.equal(result.routine.night.length, 0);
});

test('does not turn an invalid or missing score into zero', () => {
    assert.equal(normalizeScanResult({ concerns: [] }).valid, false);
    assert.equal(normalizeScanResult({ glowScore: 101 }).valid, false);
    assert.equal(normalizeScanResult({ glowScore: Number.NaN }).glowScore, null);
});

test('adds safe default notices to older routines', () => {
    const result = normalizeScanResult({ glowScore: 90, routine: { morning: ['Cleanser'], night: ['Moisturizer'] } });
    assert.match(result.routine.safety.patchTest, /Patch-test/);
    assert.match(result.routine.safety.disclaimer, /not a medical diagnosis/i);
});
