import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivacyService, PrivacyError } from '../services/privacyService.js';
import { createPrivacyConsentMiddleware } from '../middleware/privacyConsentMiddleware.js';
import {
    createGrantConsentHandler,
    createPrivacyStatusHandler,
    createWithdrawConsentHandler,
} from '../controllers/privacyController.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOTICE = 'face-scan-2026-01';
const NOW = '2026-08-28T00:00:00.000Z';

const responseRecorder = () => {
    const result = { statusCode: undefined, headers: {}, body: undefined };
    return {
        result,
        response: {
            set(name, value) { result.headers[name.toLowerCase()] = value; return this; },
            status(code) { result.statusCode = code; return this; },
            json(body) { result.body = body; return this; },
        },
    };
};

test('versioned consent is explicit, idempotent, withdrawable, and requires re-consent after a notice change', async () => {
    let latest = null;
    const events = [];
    const repository = {
        getLatest: async () => latest,
        append: async (event) => {
            events.push(event);
            latest = {
                action: event.action,
                notice_version: event.noticeVersion,
                adult_confirmed: event.adultConfirmed,
                created_at: NOW,
            };
            return latest;
        },
    };
    const service = createPrivacyService({
        repository,
        runtimeEnv: { PRIVACY_NOTICE_VERSION: NOTICE, PRIVACY_CONSENT_ENFORCEMENT: true },
    });

    assert.deepEqual(await service.getStatus(USER_ID), {
        schemaVersion: 1,
        noticeVersion: NOTICE,
        required: true,
        granted: false,
        grantedAt: null,
    });
    assert.equal((await service.grant(USER_ID)).granted, true);
    assert.equal((await service.grant(USER_ID)).granted, true);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
        userId: USER_ID,
        action: 'granted',
        noticeVersion: NOTICE,
        adultConfirmed: true,
    });

    assert.equal((await service.withdraw(USER_ID)).required, true);
    assert.equal(events.at(-1).adultConfirmed, false);
    assert.equal(events.at(-1).action, 'withdrawn');

    latest = {
        action: 'granted',
        notice_version: 'face-scan-older',
        adult_confirmed: true,
        created_at: NOW,
    };
    assert.equal((await service.getStatus(USER_ID)).required, true);
    await assert.rejects(
        service.requireCurrentConsent(USER_ID),
        (error) => error instanceof PrivacyError && error.publicCode === 'FACE_SCAN_CONSENT_REQUIRED'
    );
});

test('scan consent middleware rejects before downstream upload work and fails closed when storage is unavailable', async () => {
    let nextCalls = 0;
    const rejection = new PrivacyError(
        'FACE_SCAN_CONSENT_REQUIRED',
        'Face-scan consent is required before uploading a photo',
        403
    );
    const middleware = createPrivacyConsentMiddleware({
        requireConsent: async () => { throw rejection; },
        privacyLogger: { error() {} },
    });
    const { response, result } = responseRecorder();
    await middleware({ user: { id: USER_ID } }, response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 0);
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.code, 'FACE_SCAN_CONSENT_REQUIRED');

    const unavailable = createPrivacyConsentMiddleware({
        requireConsent: async () => { throw new Error('private database detail'); },
        privacyLogger: { error() {} },
    });
    const second = responseRecorder();
    await unavailable({ user: { id: USER_ID } }, second.response, () => { nextCalls += 1; });
    assert.equal(second.result.statusCode, 503);
    assert.equal(second.result.body.code, 'PRIVACY_STATUS_UNAVAILABLE');
    assert.equal(nextCalls, 0);
});

test('privacy handlers enforce the current server notice and strict affirmative body', async () => {
    let grants = 0;
    const grantHandler = createGrantConsentHandler({
        noticeVersion: () => NOTICE,
        grantConsent: async () => { grants += 1; return { granted: true }; },
        privacyLogger: { error() {} },
    });

    for (const body of [
        {},
        { noticeVersion: NOTICE, faceScanProcessing: false, adultConfirmation: true },
        { noticeVersion: NOTICE, faceScanProcessing: true, adultConfirmation: true, extra: true },
    ]) {
        const { response, result } = responseRecorder();
        await grantHandler({ user: { id: USER_ID }, body }, response);
        assert.equal(result.statusCode, 400);
    }
    assert.equal(grants, 0);

    const old = responseRecorder();
    await grantHandler({
        user: { id: USER_ID },
        body: { noticeVersion: 'face-scan-old', faceScanProcessing: true, adultConfirmation: true },
    }, old.response);
    assert.equal(old.result.statusCode, 409);
    assert.equal(old.result.body.code, 'CONSENT_VERSION_OUTDATED');

    const accepted = responseRecorder();
    await grantHandler({
        user: { id: USER_ID },
        body: { noticeVersion: NOTICE, faceScanProcessing: true, adultConfirmation: true },
    }, accepted.response);
    assert.equal(accepted.result.statusCode, 201);
    assert.equal(grants, 1);

    const status = responseRecorder();
    await createPrivacyStatusHandler({ loadStatus: async () => ({ granted: true }) })({ user: { id: USER_ID } }, status.response);
    assert.equal(status.result.headers['cache-control'], 'private, no-store');

    const withdrawal = responseRecorder();
    await createWithdrawConsentHandler({ withdrawConsent: async () => ({ granted: false }) })({ user: { id: USER_ID }, body: { extra: true } }, withdrawal.response);
    assert.equal(withdrawal.result.statusCode, 400);
});
