import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeletionService, DeletionError } from '../services/deletionService.js';
import { createDeleteAccountHandler, createDeleteScanHandler } from '../controllers/deletionController.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '22222222-2222-4222-8222-222222222222';
const AUDIT_ID = '33333333-3333-4333-8333-333333333333';
const SECRET = 'day-ten-deletion-audit-secret-value-123456789';
const NOW = new Date('2026-08-28T00:00:00.000Z');
const runtimeEnv = {
    DELETION_AUDIT_HMAC_SECRET: SECRET,
    PRIVACY_AUDIT_RETENTION_DAYS: 365,
    DODO_API_KEY: 'dodo-test-key',
    DODO_API_BASE_URL: 'https://test.dodopayments.com',
    DODO_ENVIRONMENT: 'test_mode',
};

const responseRecorder = () => {
    const result = { statusCode: undefined, headers: {}, body: undefined };
    return { result, response: { set(name, value) { result.headers[name.toLowerCase()] = value; return this; }, status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } } };
};

const baseRepository = (overrides = {}) => ({
    deleteScan: async () => true,
    claimAccountDeletion: async () => ({ auditId: AUDIT_ID, stage: 'claimed', claimed: true }),
    getAccountSubscription: async () => ({ plan: 'free', status: 'active', dodo_customer_id: null, dodo_subscription_id: null }),
    markAudit: async () => {},
    prepareBillingDeletion: async () => {},
    clearLegacyImageReferences: async () => {},
    ...overrides,
});

const verifiedPassword = async () => ({ data: { user: { id: USER_ID } }, error: null });

test('individual scan deletion sends only keyed audit hashes and preserves a privacy-safe not-found result', async () => {
    let input;
    const service = createDeletionService({
        repository: baseRepository({ deleteScan: async (value) => { input = value; return true; } }),
        runtimeEnv,
        now: () => NOW,
    });
    assert.deepEqual(await service.deleteScan({ userId: USER_ID, scanId: SCAN_ID }), { scanId: SCAN_ID, deleted: true });
    assert.match(input.subjectHash, /^[0-9a-f]{64}$/);
    assert.match(input.targetHash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(input).includes(USER_ID), true);
    assert.notEqual(input.subjectHash, USER_ID);
    assert.notEqual(input.targetHash, SCAN_ID);

    const missing = createDeletionService({
        repository: baseRepository({ deleteScan: async () => false }),
        runtimeEnv,
    });
    await assert.rejects(
        missing.deleteScan({ userId: USER_ID, scanId: SCAN_ID }),
        (error) => error instanceof DeletionError && error.publicCode === 'SCAN_NOT_FOUND'
    );
});

test('free account deletion reauthenticates, clears legacy references, hard-deletes auth, and completes a pseudonymous audit', async () => {
    const calls = [];
    const repository = baseRepository({
        claimAccountDeletion: async (input) => { calls.push(['claim', input]); return { auditId: AUDIT_ID, claimed: true }; },
        getAccountSubscription: async (id) => { calls.push(['subscription', id]); return null; },
        clearLegacyImageReferences: async (id) => { calls.push(['images', id]); },
        markAudit: async (id, state) => { calls.push(['audit', id, state]); },
    });
    let removedUser;
    const service = createDeletionService({
        repository,
        runtimeEnv,
        verifyPassword: verifiedPassword,
        removeAuthUser: async (id) => { removedUser = id; return { error: null }; },
        now: () => NOW,
        deletionLogger: { error() {} },
    });

    assert.deepEqual(await service.deleteAccount({ userId: USER_ID, email: 'owner@example.com', currentPassword: 'secret' }), { deleted: true });
    assert.equal(removedUser, USER_ID);
    assert.equal(calls[0][1].subjectHash.length, 64);
    assert.equal(calls.some(([name]) => name === 'images'), true);
    assert.equal(calls.at(-1)[2].outcome, 'completed');
});

test('paid account deletion confirms immediate Dodo cancellation before billing tombstone and auth deletion', async () => {
    const order = [];
    let providerRequest;
    let prepared;
    const repository = baseRepository({
        getAccountSubscription: async () => ({
            plan: 'growth', status: 'active', dodo_customer_id: 'cus_test', dodo_subscription_id: 'sub_test',
        }),
        markAudit: async (_id, state) => { order.push(`audit:${state.stage}`); },
        prepareBillingDeletion: async (input) => { order.push('billing'); prepared = input; },
        clearLegacyImageReferences: async () => { order.push('images'); },
    });
    const service = createDeletionService({
        repository,
        runtimeEnv,
        verifyPassword: verifiedPassword,
        httpClient: { patch: async (...args) => { order.push('provider'); providerRequest = args; return { data: { subscription_id: 'sub_test', status: 'cancelled', cancelled_at: NOW.toISOString() } }; } },
        removeAuthUser: async () => { order.push('auth'); return { error: null }; },
        now: () => NOW,
        deletionLogger: { error() {} },
    });

    await service.deleteAccount({ userId: USER_ID, email: 'owner@example.com', currentPassword: 'secret' });
    assert.deepEqual(order.slice(0, 5), ['provider', 'audit:provider_cancelled', 'billing', 'images', 'auth']);
    assert.match(providerRequest[0], /\/subscriptions\/sub_test$/);
    assert.deepEqual(providerRequest[1], {
        status: 'cancelled',
        cancel_reason: 'cancelled_by_customer',
        cancellation_comment: 'Account deletion request',
    });
    assert.match(prepared.subscriptionHash, /^[0-9a-f]{64}$/);
    assert.match(prepared.customerHash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(prepared).includes('sub_test'), true);
    assert.notEqual(prepared.subscriptionHash, 'sub_test');
});

test('unconfirmed or failed provider cancellation never deletes the account and records only a stable failure code', async () => {
    for (const failure of [
        async () => ({ data: { subscription_id: 'sub_test', status: 'active' } }),
        async () => { const error = new Error('timeout with private transport detail'); error.isAxiosError = true; error.code = 'ETIMEDOUT'; throw error; },
        async () => { const error = new Error('provider rejected'); error.isAxiosError = true; error.response = { status: 429 }; throw error; },
    ]) {
        let authDeleted = false;
        const auditStates = [];
        const service = createDeletionService({
            repository: baseRepository({
                getAccountSubscription: async () => ({ plan: 'growth', status: 'active', dodo_subscription_id: 'sub_test', dodo_customer_id: 'cus_test' }),
                markAudit: async (_id, state) => { auditStates.push(state); },
            }),
            runtimeEnv,
            verifyPassword: verifiedPassword,
            httpClient: { patch: failure },
            removeAuthUser: async () => { authDeleted = true; return { error: null }; },
            deletionLogger: { error() {} },
        });
        await assert.rejects(service.deleteAccount({ userId: USER_ID, email: 'owner@example.com', currentPassword: 'secret' }));
        assert.equal(authDeleted, false);
        assert.equal(auditStates.at(-1).outcome, 'failed');
        assert.match(auditStates.at(-1).failureCode, /^ACCOUNT_/);
        assert.equal(JSON.stringify(auditStates).includes('private transport detail'), false);
    }
});

test('account deletion requires fresh password verification and a single claimed operation', async () => {
    let repositoryCalls = 0;
    const invalid = createDeletionService({
        repository: baseRepository({ claimAccountDeletion: async () => { repositoryCalls += 1; } }),
        runtimeEnv,
        verifyPassword: async () => ({ data: {}, error: new Error('wrong password') }),
    });
    await assert.rejects(
        invalid.deleteAccount({ userId: USER_ID, email: 'owner@example.com', currentPassword: 'bad' }),
        (error) => error.publicCode === 'ACCOUNT_REAUTHENTICATION_FAILED' && error.statusCode === 403
    );
    assert.equal(repositoryCalls, 0);

    const concurrent = createDeletionService({
        repository: baseRepository({ claimAccountDeletion: async () => ({ auditId: AUDIT_ID, claimed: false }) }),
        runtimeEnv,
        verifyPassword: verifiedPassword,
    });
    await assert.rejects(
        concurrent.deleteAccount({ userId: USER_ID, email: 'owner@example.com', currentPassword: 'secret' }),
        (error) => error.publicCode === 'ACCOUNT_DELETION_IN_PROGRESS' && error.statusCode === 409
    );
});

test('deletion controllers validate IDs and irreversible confirmation without leaking service details', async () => {
    let scanCalls = 0;
    const scanHandler = createDeleteScanHandler({ deleteScan: async () => { scanCalls += 1; return { deleted: true }; } });
    const badScan = responseRecorder();
    await scanHandler({ user: { id: USER_ID }, params: { scanId: 'bad' } }, badScan.response);
    assert.equal(badScan.result.statusCode, 400);
    assert.equal(scanCalls, 0);

    const accountHandler = createDeleteAccountHandler({ deleteAccount: async () => ({ deleted: true }) });
    for (const body of [{}, { confirmation: 'delete', currentPassword: 'x' }, { confirmation: 'DELETE MY ACCOUNT', currentPassword: 'x', extra: true }]) {
        const response = responseRecorder();
        await accountHandler({ user: { id: USER_ID, email: 'owner@example.com' }, body }, response.response);
        assert.equal(response.result.statusCode, 400);
    }
});
