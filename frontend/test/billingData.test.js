import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BILLING_PLANS,
    canCreatePaidCheckout,
    clearCheckoutAttempt,
    getCheckoutMarker,
    getOrCreateCheckoutAttempt,
    getPlanFromSearch,
    normalizeCheckoutSession,
    normalizeSubscription,
    readCheckoutAttempt,
    shouldPollSubscriptionReturn,
    shouldPreserveCheckoutAttempt,
} from '../src/lib/billingData.js';

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.get(key) ?? null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

const UUID_ONE = '11111111-1111-4111-8111-111111111111';
const UUID_TWO = '22222222-2222-4222-8222-222222222222';

test('publishes all four plans with the enforced monthly allowances', () => {
    assert.deepEqual(
        BILLING_PLANS.map(({ slug, scans }) => [slug, scans]),
        [['free', 1], ['starter', 15], ['growth', 30], ['pro', 50]]
    );
});

test('accepts only the two exact HTTPS Dodo checkout origins', () => {
    for (const checkoutUrl of [
        'https://test.checkout.dodopayments.com/session/cks_test',
        'https://checkout.dodopayments.com/session/cks_live',
    ]) {
        assert.equal(normalizeCheckoutSession({ checkoutUrl, checkoutSessionId: 'cks_123', reused: true })?.reused, true);
    }

    for (const checkoutUrl of [
        'http://test.checkout.dodopayments.com/session/cks_test',
        'https://test.checkout.dodopayments.com.evil.example/session/cks_test',
        'https://checkout.dodopayments.com:444/session/cks_test',
        'https://user@checkout.dodopayments.com/session/cks_test',
        'javascript:alert(1)',
    ]) {
        assert.equal(normalizeCheckoutSession({ checkoutUrl, checkoutSessionId: 'cks_123' }), null);
    }
    assert.equal(normalizeCheckoutSession({ checkoutUrl: 'https://checkout.dodopayments.com/session/test' }), null);
});

test('normalizes the authoritative subscription contract without inventing active status', () => {
    const subscription = normalizeSubscription({
        schemaVersion: 1,
        plan: 'growth',
        status: 'active',
        scanLimit: 30,
        currentPeriodEnd: '2026-09-23T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        updatedAt: '2026-08-23T00:00:00.000Z',
    });
    assert.equal(subscription.plan, 'growth');
    assert.equal(subscription.scanLimit, 30);
    assert.equal(subscription.status, 'active');

    const malformedStatus = normalizeSubscription({ plan: 'starter', status: 'made_up' });
    assert.equal(malformedStatus.status, 'unknown');
    assert.equal(normalizeSubscription({ plan: 'made_up', status: 'active' }), null);
});

test('allows only paid plan intent and neutral checkout return markers', () => {
    const returned = new URLSearchParams('plan=growth&checkout=returned&status=succeeded&email=private@example.com');
    assert.equal(getPlanFromSearch(returned), 'growth');
    assert.equal(getCheckoutMarker(returned), 'returned');

    const forged = new URLSearchParams('plan=free&checkout=success&status=succeeded');
    assert.equal(getPlanFromSearch(forged), null);
    assert.equal(getCheckoutMarker(forged), null);
    assert.equal(canCreatePaidCheckout({ plan: 'free', status: 'active' }, 'starter'), true);
    assert.equal(canCreatePaidCheckout({ plan: 'free', status: 'pending' }, 'starter'), false);
    assert.equal(canCreatePaidCheckout({ plan: 'starter', status: 'active' }, 'growth'), false);
    assert.equal(canCreatePaidCheckout({ plan: 'starter', status: 'expired' }, 'growth'), true);
});

test('reuses one valid idempotency key for ambiguous retries and rotates after clearing', () => {
    const storage = new MemoryStorage();
    const first = getOrCreateCheckoutAttempt({ plan: 'starter', storage, now: 1000, createUuid: () => UUID_ONE });
    const retry = getOrCreateCheckoutAttempt({ plan: 'starter', storage, now: 2000, createUuid: () => UUID_TWO });
    assert.equal(first.idempotencyKey, UUID_ONE);
    assert.equal(retry.idempotencyKey, UUID_ONE);
    assert.deepEqual(readCheckoutAttempt({ storage, now: 2000 }), first);

    clearCheckoutAttempt({ storage });
    const newAttempt = getOrCreateCheckoutAttempt({ plan: 'starter', storage, now: 3000, createUuid: () => UUID_TWO });
    assert.equal(newAttempt.idempotencyKey, UUID_TWO);
});

test('blocks a second plan while a different checkout attempt is unresolved', () => {
    const storage = new MemoryStorage();
    const first = getOrCreateCheckoutAttempt({ plan: 'starter', storage, now: 1000, createUuid: () => UUID_ONE });
    const differentPlan = getOrCreateCheckoutAttempt({ plan: 'pro', storage, now: 2000, createUuid: () => UUID_TWO });
    assert.equal(differentPlan.blocked, true);
    assert.equal(differentPlan.plan, 'starter');
    assert.equal(differentPlan.requestedPlan, 'pro');
    assert.equal(differentPlan.idempotencyKey, UUID_ONE);
    assert.deepEqual(readCheckoutAttempt({ storage, now: 2000 }), first);
});

test('expires stored attempts and distinguishes ambiguous from definitive errors', () => {
    const storage = new MemoryStorage();
    getOrCreateCheckoutAttempt({ plan: 'pro', storage, now: 0, createUuid: () => UUID_ONE });
    assert.equal(readCheckoutAttempt({ storage, now: 24 * 60 * 60 * 1000 }), null);

    assert.equal(shouldPreserveCheckoutAttempt({ body: { code: 'BILLING_CHECKOUT_AMBIGUOUS' }, status: 502 }), true);
    assert.equal(shouldPreserveCheckoutAttempt({ body: { code: 'BILLING_PROVIDER_TIMEOUT' }, status: 504 }), true);
    assert.equal(shouldPreserveCheckoutAttempt(new TypeError('network failed')), true);
    assert.equal(shouldPreserveCheckoutAttempt({ body: { code: 'BILLING_CHECKOUT_FAILED' }, status: 502 }), false);
    assert.equal(shouldPreserveCheckoutAttempt({ body: { code: 'BILLING_IDEMPOTENCY_CONFLICT' }, status: 409 }), false);
    assert.equal(shouldPreserveCheckoutAttempt({ body: { code: 'BILLING_INVALID_PROVIDER_RESPONSE' }, status: 502 }), true);
});

test('bounds return polling and stops on confirmed or terminal server status', () => {
    const base = { plan: 'free', status: 'active' };
    assert.equal(shouldPollSubscriptionReturn({ subscription: base, targetPlan: 'starter', attempt: 0 }), true);
    assert.equal(shouldPollSubscriptionReturn({ subscription: base, targetPlan: 'starter', attempt: 4 }), false);
    assert.equal(shouldPollSubscriptionReturn({ subscription: { plan: 'starter', status: 'active' }, targetPlan: 'starter', attempt: 0 }), false);
    for (const status of ['failed', 'cancelled', 'expired']) {
        assert.equal(shouldPollSubscriptionReturn({ subscription: { plan: 'starter', status }, targetPlan: 'starter', attempt: 0 }), false);
    }
});
