import test from 'node:test';
import assert from 'node:assert/strict';
import { createResultHandler } from '../controllers/resultController.js';

const responseRecorder = () => {
    const result = { statusCode: undefined, headers: {}, body: undefined };
    return {
        result,
        response: {
            set(name, value) {
                result.headers[name.toLowerCase()] = value;
                return this;
            },
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

const validId = '11111111-1111-4111-8111-111111111111';

test('returns the owner result with private no-store caching', async () => {
    const calls = [];
    const handler = createResultHandler({
        getResult: async (userId, scanId) => {
            calls.push({ userId, scanId });
            return { id: scanId, glow_score: 84 };
        },
        serialize: (row) => ({ scanId: row.id, glowScore: row.glow_score }),
        resultLogger: { error() {} },
    });
    const { response, result } = responseRecorder();

    await handler({ user: { id: 'owner-id' }, params: { scanId: validId } }, response);

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body.data, { scanId: validId, glowScore: 84 });
    assert.equal(result.headers['cache-control'], 'private, no-store');
    assert.deepEqual(calls, [{ userId: 'owner-id', scanId: validId }]);
});

test('returns the same privacy-safe 404 for absent and foreign results', async () => {
    const handler = createResultHandler({
        getResult: async () => null,
        resultLogger: { error() {} },
    });

    for (const scanId of [validId, '22222222-2222-4222-8222-222222222222']) {
        const { response, result } = responseRecorder();
        await handler({ user: { id: 'owner-id' }, params: { scanId } }, response);
        assert.equal(result.statusCode, 404);
        assert.deepEqual(result.body, {
            success: false,
            error: 'Scan result not found',
            code: 'RESULT_NOT_FOUND',
        });
    }
});

test('rejects malformed IDs before the database call', async () => {
    let called = false;
    const handler = createResultHandler({
        getResult: async () => { called = true; },
        resultLogger: { error() {} },
    });
    const { response, result } = responseRecorder();

    await handler({ user: { id: 'owner-id' }, params: { scanId: 'not-a-uuid' } }, response);

    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, 'RESULT_ID_INVALID');
    assert.equal(called, false);
});

test('hides database details behind a retryable public error', async () => {
    const handler = createResultHandler({
        getResult: async () => { throw new Error('provider payload must not leak'); },
        resultLogger: { error() {} },
    });
    const { response, result } = responseRecorder();

    await handler({ user: { id: 'owner-id' }, params: { scanId: validId } }, response);

    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.body, {
        success: false,
        error: 'Unable to load scan result',
        code: 'RESULT_FETCH_FAILED',
    });
});
