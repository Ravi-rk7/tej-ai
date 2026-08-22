import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildQualityWarnings,
    serializeScanResult,
} from '../services/scanResultService.js';

const routine = {
    schemaVersion: 1,
    source: 'fallback',
    morning: [{ name: 'Cleanser', instructions: 'Cleanse.' }],
    night: [{ name: 'Moisturizer', instructions: 'Moisturize.' }],
    safety: { disclaimer: 'Cosmetic wellness guidance only.' },
};

test('serializes a persisted result without private fields and preserves warnings', () => {
    const result = serializeScanResult({
        id: 'scan-id',
        user_id: 'private-user-id',
        glow_score: 84,
        skin_type: 'Combination',
        concerns: ['Pigmentation'],
        routine,
        metrics: {
            schemaVersion: 1,
            totalScore: 84,
            healthScores: { pigmentation: 68, acne: 95 },
            qualityWarnings: [{ code: 'GLASSES_DETECTED', message: 'provider payload is ignored' }],
        },
        raw_api_response: { request_id: 'private-provider-id' },
        image_url: 'https://private.example/image.jpg',
        created_at: '2026-08-22T00:00:00.000Z',
    });

    assert.equal(result.glowScore, 84);
    assert.deepEqual(result.concerns, ['Pigmentation']);
    assert.equal(result.concernDetails[0].severity, 'moderate');
    assert.deepEqual(result.warnings, [{
        code: 'GLASSES_DETECTED',
        message: 'Removing glasses may improve the visibility of facial skin areas.',
    }]);
    assert.equal(result.routine.source, 'fallback');
    assert.equal('user_id' in result, false);
    assert.equal('raw_api_response' in result, false);
    assert.equal('image_url' in result, false);
});

test('reconstructs concern details from legacy health scores and routines', () => {
    const result = serializeScanResult({
        id: 'legacy-id',
        glow_score: 90,
        skin_type: null,
        concerns: ['Acne'],
        routine: ['Cleanser', 'Moisturizer'],
        metrics: {
            totalScore: 90,
            healthScores: { acne: 49, pigmentation: 90 },
        },
        created_at: '2026-08-22T00:00:00.000Z',
    });

    assert.deepEqual(result.concernDetails, [{
        key: 'acne',
        label: 'Acne',
        score: 49,
        severity: 'severe',
    }]);
    assert.equal(result.routine.source, 'legacy');
    assert.equal(result.routine.morning.length, 2);
    assert.match(result.routine.safety.disclaimer, /not a medical diagnosis/i);
});

test('builds only sanitized, documented image-quality warnings', () => {
    const warnings = buildQualityWarnings({
        scanImage: { meetsRecommendedFaceCanvas: false },
        imageQuality: {
            faceRatio: 0.49,
            yaw: 31,
            pitch: -41,
            hairOcclusion: 0.41,
            glasses: true,
            roll: 90,
        },
    });

    assert.deepEqual(warnings.map(({ code }) => code), [
        'FACE_SIZE_BELOW_RECOMMENDATION',
        'FACE_YAW_ABOVE_RECOMMENDATION',
        'FACE_PITCH_ABOVE_RECOMMENDATION',
        'HAIR_OCCLUSION_ABOVE_RECOMMENDATION',
        'GLASSES_DETECTED',
    ]);
    assert.equal(warnings.some(({ code }) => code.includes('ROLL')), false);
});
