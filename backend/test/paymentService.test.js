import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DODO_API_TIMEOUT_MS,
    PAYMENT_ERROR_CODES,
    createPaymentService,
    getPlanCatalog,
} from '../services/paymentService.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-23T00:00:00.000Z');

const quietLogger = {
    info() {},
    warn() {},
    error() {},
};

const testEnv = Object.freeze({
    DODO_API_KEY: 'dodo_test_key',
    DODO_API_BASE_URL: 'https://test.dodopayments.com',
    DODO_CHECKOUT_RETURN_URL: 'https://api.staging.example.com/api/billing/return',
    DODO_CHECKOUT_CANCEL_URL: 'https://api.staging.example.com/api/billing/cancel',
    DODO_PRODUCT_ID_STARTER: 'pdt_starter',
    DODO_PRODUCT_ID_GROWTH: 'pdt_growth',
    DODO_PRODUCT_ID_PRO: 'pdt_pro',
});

const input = Object.freeze({
    userId: USER_ID,
    email: 'person@example.com',
    plan: 'starter',
    idempotencyKey: IDEMPOTENCY_KEY,
});

const makeAttempt = (overrides = {}) => ({
    id: ATTEMPT_ID,
    userId: USER_ID,
    plan: 'starter',
    idempotencyKeyHash: 'a'.repeat(64),
    state: 'creating',
    providerSessionId: null,
    checkoutUrl: null,
    failureCode: null,
    expiresAt: '2026-08-23T00:30:00.000Z',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
});

const createMemoryRepository = ({ initialAttempt = null } = {}) => {
    let attempt = initialAttempt;
    const transitions = [];
    let claimCount = 0;

    return {
        get attempt() { return attempt; },
        get transitions() { return transitions; },
        get claimCount() { return claimCount; },
        async claim({ userId, plan, idempotencyKeyHash, expiresAt }) {
            claimCount += 1;
            if (attempt) return { attempt: { ...attempt }, claimed: false };
            attempt = makeAttempt({ userId, plan, idempotencyKeyHash, expiresAt });
            return { attempt: { ...attempt }, claimed: true };
        },
        async markReady(_attemptId, { providerSessionId, checkoutUrl }) {
            transitions.push('ready');
            attempt = { ...attempt, state: 'ready', providerSessionId, checkoutUrl };
            return attempt;
        },
        async markFailed(_attemptId, failureCode) {
            transitions.push('failed');
            attempt = { ...attempt, state: 'failed', failureCode };
            return attempt;
        },
        async markAmbiguous(_attemptId, failureCode) {
            transitions.push('ambiguous');
            attempt = { ...attempt, state: 'ambiguous', failureCode };
            return attempt;
        },
        async markExpired() {
            transitions.push('expired');
            attempt = { ...attempt, state: 'expired', checkoutUrl: null, providerSessionId: null };
            return attempt;
        },
    };
};

const createService = ({ httpClient, attemptRepository, runtimeEnv = testEnv } = {}) => createPaymentService({
    httpClient,
    attemptRepository: attemptRepository || createMemoryRepository(),
    runtimeEnv,
    paymentLogger: quietLogger,
    now: () => NOW,
});

test('creates one strict Dodo checkout and returns only sanitized session fields', async () => {
    let capturedRequest;
    const repository = createMemoryRepository();
    const httpClient = {
        async post(url, body, config) {
            capturedRequest = { url, body, config };
            return {
                data: {
                    session_id: 'cks_test_123',
                    checkout_url: 'https://test.checkout.dodopayments.com/session/cks_test_123',
                    payment_id: 'must-not-return',
                    client_secret: 'must-not-return',
                },
            };
        },
    };

    const result = await createService({ httpClient, attemptRepository: repository })
        .createCheckout(input);

    assert.deepEqual(result, {
        checkoutUrl: 'https://test.checkout.dodopayments.com/session/cks_test_123',
        checkoutSessionId: 'cks_test_123',
        reused: false,
    });
    assert.equal(repository.claimCount, 1);
    assert.deepEqual(repository.transitions, ['ready']);
    assert.equal(capturedRequest.url, 'https://test.dodopayments.com/checkouts');
    assert.deepEqual(capturedRequest.body, {
        product_cart: [{ product_id: 'pdt_starter', quantity: 1 }],
        customer: { email: 'person@example.com' },
        subscription_data: { trial_period_days: 0 },
        mandate_min_amount_inr_paise: 1,
        return_url: 'https://api.staging.example.com/api/billing/return',
        cancel_url: 'https://api.staging.example.com/api/billing/cancel',
        metadata: {
            user_id: USER_ID,
            plan: 'starter',
            checkout_attempt_id: ATTEMPT_ID,
        },
    });
    assert.deepEqual(capturedRequest.config, {
        headers: {
            Authorization: 'Bearer dodo_test_key',
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        timeout: DODO_API_TIMEOUT_MS,
        maxRedirects: 0,
    });
    assert.equal(Object.hasOwn(capturedRequest.body, 'price'), false);
    assert.equal(Object.hasOwn(capturedRequest.body, 'discount_code'), false);
    assert.equal(Object.hasOwn(capturedRequest.body, 'addons'), false);
});

test('maps all paid plans to distinct server-owned products', () => {
    const catalog = getPlanCatalog(testEnv);
    assert.deepEqual(Object.keys(catalog), ['starter', 'growth', 'pro']);
    assert.deepEqual(Object.values(catalog).map(({ productId }) => productId), [
        'pdt_starter',
        'pdt_growth',
        'pdt_pro',
    ]);
    assert.deepEqual(Object.values(catalog).map(({ scans }) => scans), [15, 30, 50]);
});

test('accepts only the official live checkout host for the live API', async () => {
    const runtimeEnv = {
        ...testEnv,
        DODO_API_BASE_URL: 'https://live.dodopayments.com',
        DODO_API_KEY: 'dodo_live_key',
    };
    let requestUrl;
    const httpClient = {
        async post(url) {
            requestUrl = url;
            return {
                data: {
                    session_id: 'cks_live_123',
                    checkout_url: 'https://checkout.dodopayments.com/session/cks_live_123',
                },
            };
        },
    };

    const result = await createService({ httpClient, runtimeEnv }).createCheckout(input);
    assert.equal(requestUrl, 'https://live.dodopayments.com/checkouts');
    assert.equal(result.checkoutSessionId, 'cks_live_123');
});

test('reuses a ready attempt without another provider request', async () => {
    let providerCalls = 0;
    const checkoutUrl = 'https://test.checkout.dodopayments.com/session/cks_existing';
    const repository = createMemoryRepository({
        initialAttempt: makeAttempt({
            state: 'ready',
            checkoutUrl,
            providerSessionId: 'cks_existing',
        }),
    });
    const service = createService({
        attemptRepository: repository,
        httpClient: { async post() { providerCalls += 1; } },
    });

    assert.deepEqual(await service.createCheckout(input), {
        checkoutUrl,
        checkoutSessionId: 'cks_existing',
        reused: true,
    });
    assert.equal(providerCalls, 0);
});

test('rejects reuse of an idempotency key for another plan', async () => {
    const repository = createMemoryRepository({
        initialAttempt: makeAttempt({ plan: 'growth' }),
    });
    const service = createService({
        attemptRepository: repository,
        httpClient: { async post() { throw new Error('must not run'); } },
    });

    await assert.rejects(service.createCheckout(input), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.IDEMPOTENCY_CONFLICT);
        assert.equal(error.statusCode, 409);
        return true;
    });
});

test('twenty concurrent requests make exactly one provider call', async () => {
    let releaseProvider;
    const providerGate = new Promise((resolve) => { releaseProvider = resolve; });
    let providerCalls = 0;
    const repository = createMemoryRepository();
    const service = createService({
        attemptRepository: repository,
        httpClient: {
            async post() {
                providerCalls += 1;
                await providerGate;
                return {
                    data: {
                        session_id: 'cks_concurrent',
                        checkout_url: 'https://test.checkout.dodopayments.com/session/cks_concurrent',
                    },
                };
            },
        },
    });

    const requests = Array.from({ length: 20 }, () => service.createCheckout(input));
    const settledRequests = Promise.allSettled(requests);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(providerCalls, 1);
    releaseProvider();
    const results = await settledRequests;

    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 19);
    assert.equal(results.filter(({ status, reason }) => (
        status === 'rejected'
        && reason.publicCode === PAYMENT_ERROR_CODES.CHECKOUT_IN_PROGRESS
    )).length, 19);
    assert.equal((await service.createCheckout(input)).reused, true);
    assert.equal(providerCalls, 1);
});

test('timeout becomes ambiguous and the same key never calls Dodo again', async () => {
    let providerCalls = 0;
    const repository = createMemoryRepository();
    const timeoutError = new Error('timeout');
    timeoutError.isAxiosError = true;
    timeoutError.code = 'ECONNABORTED';
    const service = createService({
        attemptRepository: repository,
        httpClient: {
            async post() {
                providerCalls += 1;
                throw timeoutError;
            },
        },
    });

    await assert.rejects(service.createCheckout(input), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.PROVIDER_TIMEOUT);
        assert.equal(error.ambiguous, true);
        return true;
    });
    assert.deepEqual(repository.transitions, ['ambiguous']);
    await assert.rejects(service.createCheckout(input), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.CHECKOUT_AMBIGUOUS);
        return true;
    });
    assert.equal(providerCalls, 1);
});

test('provider rejection is persisted as failed and is not retried with the same key', async () => {
    let providerCalls = 0;
    const repository = createMemoryRepository();
    const providerError = new Error('rejected');
    providerError.isAxiosError = true;
    providerError.response = { status: 429 };
    const service = createService({
        attemptRepository: repository,
        httpClient: {
            async post() {
                providerCalls += 1;
                throw providerError;
            },
        },
    });

    await assert.rejects(service.createCheckout(input), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.PROVIDER_REJECTED);
        return true;
    });
    assert.deepEqual(repository.transitions, ['failed']);
    await assert.rejects(service.createCheckout(input), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.CHECKOUT_FAILED);
        return true;
    });
    assert.equal(providerCalls, 1);
});

test('provider 5xx is ambiguous and cannot be retried with the same key', async () => {
    let providerCalls = 0;
    const repository = createMemoryRepository();
    const providerError = new Error('internal provider error');
    providerError.isAxiosError = true;
    providerError.response = { status: 503 };
    const service = createService({
        attemptRepository: repository,
        httpClient: {
            async post() {
                providerCalls += 1;
                throw providerError;
            },
        },
    });

    await assert.rejects(service.createCheckout(input), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.PROVIDER_UNAVAILABLE);
        assert.equal(error.ambiguous, true);
        return true;
    });
    assert.deepEqual(repository.transitions, ['ambiguous']);
    await assert.rejects(service.createCheckout(input), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.CHECKOUT_AMBIGUOUS);
        return true;
    });
    assert.equal(providerCalls, 1);
});

test('malformed responses and non-Dodo checkout URLs become ambiguous', async () => {
    const responses = [
        { data: { session_id: 'cks_missing_url' } },
        {
            data: {
                session_id: 'cks_hostile',
                checkout_url: 'https://checkout.attacker.example/session/cks_hostile',
            },
        },
    ];

    for (const response of responses) {
        const repository = createMemoryRepository();
        const service = createService({
            attemptRepository: repository,
            httpClient: { async post() { return response; } },
        });
        await assert.rejects(service.createCheckout(input), (error) => {
            assert.equal(error.publicCode, PAYMENT_ERROR_CODES.INVALID_PROVIDER_RESPONSE);
            assert.equal(error.ambiguous, true);
            return true;
        });
        assert.deepEqual(repository.transitions, ['ambiguous']);
    }
});

test('invalid browser-shaped input and unsafe configuration fail before persistence', async () => {
    let claims = 0;
    let providerCalls = 0;
    const repository = {
        async claim() { claims += 1; },
    };
    const service = createService({
        attemptRepository: repository,
        httpClient: { async post() { providerCalls += 1; } },
    });

    await assert.rejects(service.createCheckout({ ...input, productId: 'pdt_attacker' }), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.INVALID_REQUEST);
        return true;
    });
    await assert.rejects(service.createCheckout({ ...input, plan: 'enterprise' }), (error) => {
        assert.equal(error.publicCode, PAYMENT_ERROR_CODES.INVALID_PLAN);
        return true;
    });

    const duplicateProducts = {
        ...testEnv,
        DODO_PRODUCT_ID_GROWTH: testEnv.DODO_PRODUCT_ID_STARTER,
    };
    await assert.rejects(
        createService({ attemptRepository: repository, runtimeEnv: duplicateProducts })
            .createCheckout(input),
        (error) => {
            assert.equal(error.publicCode, PAYMENT_ERROR_CODES.CONFIGURATION_ERROR);
            return true;
        }
    );
    assert.equal(claims, 0);
    assert.equal(providerCalls, 0);
});
