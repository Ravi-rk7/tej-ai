import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertCheckoutAllowedForSubscription,
    createBillingCheckoutHandler,
    createBillingRelayHandler,
    createCheckoutAvailabilityMiddleware,
    createSubscriptionStatusHandler,
    disabledBillingEndpoint,
    disabledWebhookEndpoint,
    serializeBillingSubscription,
} from '../controllers/paymentController.js';

const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';

const responseRecorder = () => {
    const result = { body: undefined, headers: {}, location: undefined, statusCode: undefined };
    return {
        result,
        response: {
            json(body) { result.body = body; return this; },
            redirect(code, location) { result.statusCode = code; result.location = location; return this; },
            set(name, value) { result.headers[name.toLowerCase()] = value; return this; },
            status(code) { result.statusCode = code; return this; },
        },
    };
};

const checkoutRequest = (overrides = {}) => ({
    body: { plan: 'starter' },
    headers: { 'idempotency-key': IDEMPOTENCY_KEY },
    user: { id: 'authenticated-owner', email: 'owner@example.com' },
    ...overrides,
});

test('checkout rejects disabled billing before database or provider calls', async () => {
    let called = false;
    const handler = createBillingCheckoutHandler({
        enabled: () => false,
        loadSubscription: async () => { called = true; },
        createCheckoutSession: async () => { called = true; },
    });
    const { response, result } = responseRecorder();

    await handler(checkoutRequest(), response);

    assert.equal(result.statusCode, 503);
    assert.equal(result.body.code, 'BILLING_CHECKOUT_DISABLED');
    assert.equal(result.headers['cache-control'], 'private, no-store');
    assert.equal(called, false);
});

test('checkout accepts only a strict server-known plan and a UUID idempotency key', async () => {
    let calls = 0;
    const handler = createBillingCheckoutHandler({
        enabled: () => true,
        loadSubscription: async () => { calls += 1; return null; },
        createCheckoutSession: async () => { calls += 1; },
    });

    const extra = responseRecorder();
    await handler(checkoutRequest({
        body: { plan: 'starter', productId: 'browser-product', price: 1 },
    }), extra.response);
    assert.equal(extra.result.statusCode, 400);
    assert.equal(extra.result.body.code, 'BILLING_REQUEST_INVALID');

    const missingKey = responseRecorder();
    await handler(checkoutRequest({ headers: {} }), missingKey.response);
    assert.equal(missingKey.result.statusCode, 400);
    assert.equal(missingKey.result.body.code, 'BILLING_IDEMPOTENCY_KEY_INVALID');
    assert.equal(calls, 0);
});

test('checkout uses only authenticated identity and returns the canonical contract', async () => {
    let received;
    const handler = createBillingCheckoutHandler({
        enabled: () => true,
        loadSubscription: async (userId) => {
            assert.equal(userId, 'authenticated-owner');
            return { plan: 'free', status: 'active' };
        },
        createCheckoutSession: async (input) => {
            received = input;
            return {
                checkoutUrl: 'https://test.checkout.dodopayments.com/session/cks_test',
                checkoutSessionId: 'cks_test',
                reused: false,
            };
        },
    });
    const { response, result } = responseRecorder();

    await handler(checkoutRequest(), response);

    assert.deepEqual(received, {
        userId: 'authenticated-owner',
        email: 'owner@example.com',
        plan: 'starter',
        idempotencyKey: IDEMPOTENCY_KEY,
    });
    assert.equal(result.statusCode, 201);
    assert.deepEqual(result.body, {
        success: true,
        data: {
            checkoutUrl: 'https://test.checkout.dodopayments.com/session/cks_test',
            checkoutSessionId: 'cks_test',
            reused: false,
        },
    });
});

test('checkout returns 200 when the durable core reuses a session', async () => {
    const handler = createBillingCheckoutHandler({
        enabled: () => true,
        loadSubscription: async () => null,
        createCheckoutSession: async () => ({
            checkoutUrl: 'https://test.checkout.dodopayments.com/session/cks_test',
            checkoutSessionId: 'cks_test',
            reused: true,
        }),
    });
    const { response, result } = responseRecorder();

    await handler(checkoutRequest(), response);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.reused, true);
});

test('active-like paid subscription states cannot create another subscription', () => {
    for (const status of ['active', 'on_hold', 'past_due', 'pending']) {
        assert.throws(
            () => assertCheckoutAllowedForSubscription({ plan: 'growth', status }),
            (error) => error.statusCode === 409
                && error.publicCode === 'SUBSCRIPTION_ALREADY_ACTIVE'
        );
    }

    assert.throws(
        () => assertCheckoutAllowedForSubscription(
            {
                plan: 'starter',
                status: 'cancelled',
                current_period_end: '2026-09-01T00:00:00.000Z',
            },
            new Date('2026-08-23T00:00:00.000Z')
        ),
        (error) => error.statusCode === 409
    );
});

test('only free or definitively expired paid subscriptions may checkout', () => {
    assert.doesNotThrow(() => assertCheckoutAllowedForSubscription(null));
    assert.doesNotThrow(() => assertCheckoutAllowedForSubscription({
        plan: 'starter',
        status: 'expired',
    }));
    assert.doesNotThrow(() => assertCheckoutAllowedForSubscription(
        {
            plan: 'starter',
            status: 'cancelled',
            current_period_end: '2026-08-01T00:00:00.000Z',
        },
        new Date('2026-08-23T00:00:00.000Z')
    ));

    assert.throws(
        () => assertCheckoutAllowedForSubscription({ plan: 'pro', status: 'mystery' }),
        (error) => error.statusCode === 503
            && error.publicCode === 'SUBSCRIPTION_STATE_INVALID'
    );
});

test('subscription status is owner-scoped, explicit, and missing rows resolve to Free', async () => {
    assert.deepEqual(serializeBillingSubscription(null), {
        schemaVersion: 1,
        plan: 'free',
        status: 'active',
        scanLimit: 1,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: null,
    });

    const handler = createSubscriptionStatusHandler({
        loadSubscription: async (userId) => {
            assert.equal(userId, 'authenticated-owner');
            return {
                plan: 'growth',
                status: 'active',
                current_period_end: '2026-09-01T00:00:00Z',
                cancel_at_period_end: true,
                updated_at: '2026-08-23T00:00:00Z',
                dodo_customer_id: 'must-not-leak',
            };
        },
    });
    const { response, result } = responseRecorder();
    await handler(checkoutRequest(), response);

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers['cache-control'], 'private, no-store');
    assert.deepEqual(result.body.data, {
        schemaVersion: 1,
        plan: 'growth',
        status: 'active',
        scanLimit: 30,
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
        updatedAt: '2026-08-23T00:00:00.000Z',
    });
});

test('public billing relays discard provider query data and use fixed 303 locations', () => {
    const handler = createBillingRelayHandler(
        'https://staging.tejai.example/settings?checkout=returned'
    );
    const { response, result } = responseRecorder();
    handler({ query: { status: 'success', plan: 'pro', email: 'private@example.com' } }, response);

    assert.equal(result.statusCode, 303);
    assert.equal(
        result.location,
        'https://staging.tejai.example/settings?checkout=returned'
    );
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['referrer-policy'], 'no-referrer');
});

test('availability and legacy endpoint handlers fail closed with stable codes', () => {
    const availability = createCheckoutAvailabilityMiddleware({ enabled: () => false });
    const unavailable = responseRecorder();
    availability({}, unavailable.response, () => assert.fail('must not continue'));
    assert.equal(unavailable.result.body.code, 'BILLING_CHECKOUT_DISABLED');

    const legacy = responseRecorder();
    disabledBillingEndpoint({}, legacy.response);
    assert.equal(legacy.result.body.code, 'BILLING_ENDPOINT_DISABLED');

    const webhook = responseRecorder();
    disabledWebhookEndpoint({}, webhook.response);
    assert.equal(webhook.result.body.code, 'WEBHOOK_NOT_READY');
});
