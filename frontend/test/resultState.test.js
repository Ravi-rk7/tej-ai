import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyResultError, isValidScanId, resultPathFor } from '../src/lib/resultState.js';

const validId = '11111111-1111-4111-8111-111111111111';

test('validates result IDs and builds an encoded direct URL', () => {
    assert.equal(isValidScanId(validId), true);
    assert.equal(isValidScanId('not-a-uuid'), false);
    assert.equal(resultPathFor(validId), `/results?id=${validId}`);
});

test('classifies result errors into privacy-safe and retryable states', () => {
    assert.equal(classifyResultError({ status: 404 }), 'not_found');
    assert.equal(classifyResultError({ status: 403 }), 'not_found');
    assert.equal(classifyResultError({ status: 429 }), 'retryable');
    assert.equal(classifyResultError({ status: 503 }), 'retryable');
    assert.equal(classifyResultError(new Error('offline')), 'retryable');
    assert.equal(classifyResultError({ status: 422 }), 'invalid');
});
