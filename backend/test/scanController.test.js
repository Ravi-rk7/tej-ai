import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanHandler } from '../controllers/scanController.js';

const responseRecorder = () => {
    const result = { statusCode: undefined, body: undefined };
    return {
        result,
        response: {
            status(statusCode) {
                result.statusCode = statusCode;
                return this;
            },
            json(body) {
                result.body = body;
                return this;
            },
        },
    };
};

const quietLogger = {
    info() {},
    warn() {},
    error() {},
};

test('does not calculate, generate, or save when provider analysis fails', async () => {
    let calculateCalls = 0;
    let routineCalls = 0;
    let saveCalls = 0;
    let releaseCalls = 0;
    const providerError = Object.assign(new Error('private provider detail'), {
        publicMessage: 'The photo is too blurry. Retake it in focus.',
        publicCode: 'SCAN_IMAGE_QUALITY',
        category: 'image_quality',
        statusCode: 422,
    });
    const handler = createScanHandler({
        analyzeSkin: async () => { throw providerError; },
        calculateScore: async () => { calculateCalls += 1; },
        generateRoutine: async () => { routineCalls += 1; },
        saveAnalysis: async () => { saveCalls += 1; },
        releaseImage: () => { releaseCalls += 1; },
        scanLogger: quietLogger,
    });
    const req = {
        user: { id: 'user-id' },
        scanImage: {
            buffer: Buffer.from('image'),
            width: 600,
            height: 600,
            meetsRecommendedFaceCanvas: true,
        },
    };
    const { response, result } = responseRecorder();

    await handler(req, response);

    assert.equal(result.statusCode, 422);
    assert.equal(result.body.code, 'SCAN_IMAGE_QUALITY');
    assert.equal(result.body.error, 'The photo is too blurry. Retake it in focus.');
    assert.equal(calculateCalls, 0);
    assert.equal(routineCalls, 0);
    assert.equal(saveCalls, 0);
    assert.equal(releaseCalls, 1);
});

test('derives the provider score, generates a safe routine, persists fields, and returns the additive contract', async () => {
    const calls = { score: [], routine: [], save: [] };
    const handler = createScanHandler({
        analyzeSkin: async () => ({
            skinType: 'Combination',
            scoreInfo: {
                totalScore: 84,
                skinTypeScore: 80,
                darkCircleScore: 100,
                wrinkleScore: 100,
                oilyIntensityScore: 83,
                poresScore: 85,
                blackheadScore: 100,
                acneScore: 76,
                sensitivityScore: 82,
                melaninScore: 68,
                waterScore: 79,
                roughScore: 89,
            },
            provider: { name: 'ailabtools', version: 'skin-analysis-pro-v1.7.1' },
        }),
        calculateScore: async (scoreInfo, userId) => {
            calls.score.push({ scoreInfo, userId });
            return { score: scoreInfo.totalScore, trend: 'stable' };
        },
        generateRoutine: async (input) => {
            calls.routine.push(input);
            return {
                schemaVersion: 1,
                source: 'fallback',
                morning: [{ name: 'Gentle cleanser', instructions: 'Cleanse.' }],
                night: [{ name: 'Gentle cleanser', instructions: 'Cleanse.' }],
                safety: { patchTest: 'Patch-test.', spf: 'SPF 30+.', cautions: 'Check first.', disclaimer: 'Not a diagnosis.', dermatologist: null },
            };
        },
        saveAnalysis: async (userId, data) => {
            calls.save.push({ userId, data });
            return { id: 'scan-id', created_at: '2026-08-22T00:00:00.000Z' };
        },
        releaseImage: () => {},
        scanLogger: quietLogger,
    });
    const req = {
        user: { id: 'user-id' },
        scanImage: { buffer: Buffer.from('image'), width: 600, height: 600, meetsRecommendedFaceCanvas: true },
    };
    const { response, result } = responseRecorder();

    await handler(req, response);

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.glowScore, 84);
    assert.equal(result.body.data.scanId, 'scan-id');
    assert.deepEqual(calls.routine[0].concerns[0], { key: 'pigmentation', label: 'Pigmentation', score: 68, severity: 'moderate' });
    assert.equal(calls.save[0].data.metrics.totalScore, 84);
    assert.equal(calls.save[0].data.providerVersion, 'skin-analysis-pro-v1.7.1');
    assert.equal(calls.score[0].scoreInfo.totalScore, 84);
});

test('refunds one reservation with a persistence failure and always releases the image', async () => {
    const refunds = [];
    let releases = 0;
    const handler = createScanHandler({
        analyzeSkin: async () => ({
            skinType: 'Combination',
            scoreInfo: {
                totalScore: 84, skinTypeScore: 80, darkCircleScore: 100, wrinkleScore: 100,
                oilyIntensityScore: 83, poresScore: 85, blackheadScore: 100, acneScore: 76,
                sensitivityScore: 82, melaninScore: 68, waterScore: 79, roughScore: 89,
            },
            provider: { name: 'ailabtools', version: 'skin-analysis-pro-v1.7.1' },
        }),
        calculateScore: async () => ({ trend: 'stable' }),
        generateRoutine: async () => ({ source: 'fallback' }),
        persistScan: async () => { throw new Error('database unavailable'); },
        refundQuota: async (...args) => refunds.push(args),
        releaseImage: () => { releases += 1; },
        scanLogger: quietLogger,
    });
    const req = {
        user: { id: 'user-id' },
        scanQuota: { reservationId: '11111111-1111-4111-8111-111111111111' },
        scanImage: { buffer: Buffer.from('image'), width: 600, height: 600 },
    };
    const { response, result } = responseRecorder();
    await handler(req, response);

    assert.equal(result.statusCode, 500);
    assert.deepEqual(refunds, [['user-id', '11111111-1111-4111-8111-111111111111', 'persistence_failed']]);
    assert.equal(releases, 1);
});
