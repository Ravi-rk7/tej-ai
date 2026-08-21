import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScanPayload } from '../services/supabaseService.js';

test('builds a sanitized Day 5 persistence payload', () => {
    const payload = buildScanPayload({
        user_id: 'user-id',
        glow_score: 84,
        skin_type: 'Combination',
        concerns: ['Pigmentation'],
        metrics: { schemaVersion: 1, totalScore: 84 },
        routine: { schemaVersion: 1, source: 'fallback' },
        raw_api_response: { request_id: 'must-not-persist' },
    });

    assert.deepEqual(payload, {
        user_id: 'user-id',
        image_url: null,
        image_retained: false,
        glow_score: 84,
        skin_type: 'Combination',
        concerns: ['Pigmentation'],
        routine: { schemaVersion: 1, source: 'fallback' },
        metrics: { schemaVersion: 1, totalScore: 84 },
        raw_api_response: null,
        provider: 'ailabtools',
        provider_version: 'skin-analysis-pro-v1.7.1',
    });
});
