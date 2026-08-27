import test from 'node:test';
import assert from 'node:assert/strict';
import { isConsentError, normalizePrivacyStatus } from '../src/lib/privacyData.js';

test('normalizes only a coherent versioned privacy status', () => {
    assert.deepEqual(normalizePrivacyStatus({
        schemaVersion: 1,
        noticeVersion: 'face-scan-2026-01',
        required: false,
        granted: true,
        grantedAt: '2026-08-28T00:00:00.000Z',
    }), {
        schemaVersion: 1,
        noticeVersion: 'face-scan-2026-01',
        required: false,
        granted: true,
        grantedAt: '2026-08-28T00:00:00.000Z',
    });
    assert.equal(normalizePrivacyStatus(null), null);
    assert.equal(normalizePrivacyStatus({ noticeVersion: 'v1', required: true, granted: true }), null);
    assert.equal(normalizePrivacyStatus({ noticeVersion: '', required: true, granted: false }), null);
});

test('recognizes only the server consent-required boundary', () => {
    assert.equal(isConsentError({ status: 403, body: { code: 'FACE_SCAN_CONSENT_REQUIRED' } }), true);
    assert.equal(isConsentError({ status: 403, body: { code: 'SCAN_LIMIT_REACHED' } }), false);
    assert.equal(isConsentError({ status: 500 }), false);
});
