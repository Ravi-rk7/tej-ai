import test from 'node:test';
import assert from 'node:assert/strict';
import { Webhook } from 'standardwebhooks';
import { createWebhookProcessor, WebhookError } from '../services/webhookService.js';
import { createQuotaRepository } from '../services/quotaService.js';
import { createCustomerPortalService } from '../services/customerPortalService.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const SECRET = `whsec_${Buffer.from('day-nine-test-secret').toString('base64')}`;

const runtimeEnv = {
    BILLING_WEBHOOK_ENABLED: true,
    DODO_BUSINESS_ID: 'biz_test_123',
    DODO_WEBHOOK_SECRET: SECRET,
    DODO_PRODUCT_ID_STARTER: 'prod_starter',
    DODO_PRODUCT_ID_GROWTH: 'prod_growth',
    DODO_PRODUCT_ID_PRO: 'prod_pro',
};
const DELETION_SECRET = 'day-ten-deletion-webhook-secret-123456789';

const signedPayload = (overrides = {}) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const id = `evt_${Math.random().toString(36).slice(2)}`;
    const payload = {
        business_id: runtimeEnv.DODO_BUSINESS_ID,
        type: 'subscription.active',
        timestamp: new Date(timestamp * 1000).toISOString(),
        data: {
            payload_type: 'subscription',
            subscription_id: 'sub_test_123',
            product_id: 'prod_growth',
            status: 'active',
            customer: { customer_id: 'cus_test_123' },
            next_billing_date: new Date(Date.now() + 86400000).toISOString(),
            metadata: { user_id: USER_ID, checkout_attempt_id: ATTEMPT_ID, plan: 'growth' },
        },
        ...overrides,
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = new Webhook(SECRET).sign(id, new Date(timestamp * 1000), raw);
    return {
        raw,
        headers: {
            'webhook-id': id,
            'webhook-signature': signature,
            'webhook-timestamp': String(timestamp),
        },
        payload,
    };
};

test('Standard Webhooks verifies raw bytes and sends only server-derived subscription fields to the RPC', async () => {
    const calls = [];
    const databaseClient = { rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: [{ outcome: 'applied' }], error: null };
    } };
    const processor = createWebhookProcessor({ databaseClient, runtimeEnv });
    const request = signedPayload();
    const result = await processor.handle(request.raw, request.headers);

    assert.deepEqual(result, { outcome: 'applied' });
    assert.equal(calls[0].name, 'process_dodo_subscription_event');
    assert.equal(calls[0].args.p_plan, 'growth');
    assert.equal(calls[0].args.p_metadata_user_id, USER_ID);
    assert.equal(calls[0].args.p_checkout_attempt_id, ATTEMPT_ID);
    assert.equal('raw' in calls[0].args, false);
    assert.equal('image_url' in calls[0].args, false);
});

test('invalid signatures and wrong business IDs are rejected before storage', async () => {
    const databaseClient = { rpc: async () => { throw new Error('must not call'); } };
    const processor = createWebhookProcessor({ databaseClient, runtimeEnv });
    const request = signedPayload();

    await assert.rejects(
        processor.handle(request.raw, { ...request.headers, 'webhook-signature': 'v1,invalid' }),
        (error) => error instanceof WebhookError && error.statusCode === 401
    );
    const wrongBusiness = signedPayload({ business_id: 'biz_other' });
    await assert.rejects(
        processor.handle(wrongBusiness.raw, wrongBusiness.headers),
        (error) => error instanceof WebhookError && error.publicCode === 'WEBHOOK_BUSINESS_INVALID'
    );
});

test('duplicate signed deliveries are delegated to the idempotent database event ledger', async () => {
    const calls = [];
    const processor = createWebhookProcessor({
        databaseClient: { rpc: async (name, args) => {
            calls.push({ name, args });
            return { data: [{ outcome: calls.length === 1 ? 'applied' : 'duplicate' }], error: null };
        } },
        runtimeEnv,
    });
    const request = signedPayload();
    assert.deepEqual(await processor.handle(request.raw, request.headers), { outcome: 'applied' });
    assert.deepEqual(await processor.handle(request.raw, request.headers), { outcome: 'duplicate' });
    assert.equal(calls.length, 2);
});

test('a deleted billing tombstone acknowledges later signed events before owner metadata is used', async () => {
    const calls = [];
    const processor = createWebhookProcessor({
        databaseClient: { rpc: async (name, args) => {
            calls.push({ name, args });
            if (name === 'record_deleted_dodo_subscription_event') {
                return { data: [{ matched: true, outcome: 'ignored' }], error: null };
            }
            throw new Error('deleted billing event must not reach subscription mutation');
        } },
        runtimeEnv: { ...runtimeEnv, DELETION_AUDIT_HMAC_SECRET: DELETION_SECRET },
    });
    const request = signedPayload();
    assert.deepEqual(await processor.handle(request.raw, request.headers), { outcome: 'ignored' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'record_deleted_dodo_subscription_event');
    assert.match(calls[0].args.p_subscription_hash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(calls[0].args).includes('sub_test_123'), false);
});

test('quota repository normalizes atomic reservation, refund, and persistence RPCs', async () => {
    const calls = [];
    const databaseClient = { rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'get_scan_quota_status') return { data: [{ plan: 'growth', status: 'active', effective_plan: 'growth', quota_limit: 30, used: 2, remaining: 28, reserved: 1, window_start: '2026-08-01T00:00:00.000Z', reset_at: '2026-09-01T00:00:00.000Z', current_period_end: null, cancel_at_period_end: false, can_manage_billing: true }], error: null };
        if (name === 'reserve_scan_quota') return { data: [{ granted: true, reservation_id: ATTEMPT_ID, plan: 'growth', status: 'active', effective_plan: 'growth', quota_limit: 30, used: 2, remaining: 27, reserved: 2, window_start: '2026-08-01T00:00:00.000Z', reset_at: '2026-09-01T00:00:00.000Z' }], error: null };
        if (name === 'refund_scan_quota') return { data: [{ refunded: true, state: 'refunded' }], error: null };
        return { data: [{ id: USER_ID, user_id: USER_ID, image_url: null, image_retained: false, glow_score: 84, skin_type: 'Combination', concerns: [], routine: {}, metrics: {}, provider: 'ailabtools', provider_version: 'skin-analysis-pro-v1.7.1', created_at: '2026-08-28T00:00:00.000Z', updated_at: '2026-08-28T00:00:00.000Z' }], error: null };
    } };
    const repository = createQuotaRepository({ databaseClient });
    assert.equal((await repository.getStatus(USER_ID)).remaining, 28);
    assert.equal((await repository.reserve(USER_ID)).reservationId, ATTEMPT_ID);
    assert.equal((await repository.refund(USER_ID, ATTEMPT_ID, 'provider_failed')).refunded, true);
    assert.equal((await repository.persist(USER_ID, ATTEMPT_ID, { glowScore: 84, skinType: 'Combination', concerns: [], routine: {}, metrics: {}, provider: 'ailabtools', providerVersion: 'skin-analysis-pro-v1.7.1' })).glow_score, 84);
    assert.deepEqual(calls.map(({ name }) => name), ['get_scan_quota_status', 'reserve_scan_quota', 'refund_scan_quota', 'persist_scan_and_consume_quota']);
});

test('customer portal accepts only the provider-hosted HTTPS link', async () => {
    let request;
    const service = createCustomerPortalService({
        runtimeEnv: { DODO_ENVIRONMENT: 'test_mode', DODO_API_BASE_URL: 'https://test.dodopayments.com', DODO_API_KEY: 'key', FRONTEND_URL: 'http://localhost:3000' },
        httpClient: { post: async (...args) => { request = args; return { data: { link: 'https://test.customer.dodopayments.com/session/abc' } }; } },
    });
    assert.equal((await service.createSession('cus_test')).portalUrl, 'https://test.customer.dodopayments.com/session/abc');
    assert.match(request[0], /customers\/cus_test\/customer-portal\/session$/);
    assert.equal(request[2].params.send_email, false);
});
