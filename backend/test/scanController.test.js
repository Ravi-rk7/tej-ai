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
