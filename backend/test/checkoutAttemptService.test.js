import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECKOUT_ATTEMPT_TTL_MS,
    createCheckoutAttemptRepository,
    hashIdempotencyKey,
} from '../services/checkoutAttemptService.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const KEY = '33333333-3333-4333-8333-333333333333';
const HASH = hashIdempotencyKey(KEY);

const attemptRow = {
    id: ATTEMPT_ID,
    user_id: USER_ID,
    plan: 'starter',
    idempotency_key_hash: HASH,
    state: 'creating',
    provider_session_id: null,
    checkout_url: null,
    failure_code: null,
    expires_at: '2026-08-24T00:00:00.000Z',
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
    claimed: true,
};

test('hashes rather than stores the raw idempotency key and retains attempts for 24 hours', () => {
    assert.equal(HASH, 'f6222a1106eefe4f6b25302a9d963cfaba14bedfefacc2c311967e41c61cffe4');
    assert.equal(HASH.includes(KEY), false);
    assert.equal(CHECKOUT_ATTEMPT_TTL_MS, 24 * 60 * 60 * 1000);
});

test('claims through the atomic RPC and normalizes the private row', async () => {
    let rpcCall;
    const databaseClient = {
        async rpc(name, parameters) {
            rpcCall = { name, parameters };
            return { data: [attemptRow], error: null };
        },
    };
    const repository = createCheckoutAttemptRepository({ databaseClient });
    const result = await repository.claim({
        userId: USER_ID,
        plan: 'starter',
        idempotencyKeyHash: HASH,
        expiresAt: attemptRow.expires_at,
    });

    assert.deepEqual(rpcCall, {
        name: 'claim_billing_checkout_attempt',
        parameters: {
            p_user_id: USER_ID,
            p_plan: 'starter',
            p_idempotency_key_hash: HASH,
            p_expires_at: attemptRow.expires_at,
        },
    });
    assert.equal(result.claimed, true);
    assert.deepEqual(result.attempt, {
        id: ATTEMPT_ID,
        userId: USER_ID,
        plan: 'starter',
        idempotencyKeyHash: HASH,
        state: 'creating',
        providerSessionId: null,
        checkoutUrl: null,
        failureCode: null,
        expiresAt: '2026-08-24T00:00:00.000Z',
        createdAt: '2026-08-23T00:00:00.000Z',
        updatedAt: '2026-08-23T00:00:00.000Z',
    });
});
