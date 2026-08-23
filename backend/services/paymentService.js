import axios from 'axios';
import crypto from 'crypto';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import {
    CHECKOUT_ATTEMPT_STATES,
    CHECKOUT_ATTEMPT_TTL_MS,
    CheckoutAttemptStoreError,
    createCheckoutAttemptRepository,
    hashIdempotencyKey,
} from './checkoutAttemptService.js';

export const DODO_API_TIMEOUT_MS = 10_000;

const PLAN_DEFINITIONS = Object.freeze({
    starter: Object.freeze({
        key: 'starter',
        name: 'Starter',
        scans: 15,
        productIdEnv: 'DODO_PRODUCT_ID_STARTER',
    }),
    growth: Object.freeze({
        key: 'growth',
        name: 'Growth',
        scans: 30,
        productIdEnv: 'DODO_PRODUCT_ID_GROWTH',
    }),
    pro: Object.freeze({
        key: 'pro',
        name: 'Pro',
        scans: 50,
        productIdEnv: 'DODO_PRODUCT_ID_PRO',
    }),
});

const DODO_ENVIRONMENTS = Object.freeze({
    'https://test.dodopayments.com': Object.freeze({
        checkoutHost: 'test.checkout.dodopayments.com',
        mode: 'test_mode',
    }),
    'https://live.dodopayments.com': Object.freeze({
        checkoutHost: 'checkout.dodopayments.com',
        mode: 'live_mode',
    }),
});

export const PAYMENT_ERROR_CODES = Object.freeze({
    INVALID_REQUEST: 'BILLING_INVALID_REQUEST',
    INVALID_PLAN: 'BILLING_INVALID_PLAN',
    CONFIGURATION_ERROR: 'BILLING_CONFIGURATION_ERROR',
    IDEMPOTENCY_CONFLICT: 'BILLING_IDEMPOTENCY_CONFLICT',
    CHECKOUT_IN_PROGRESS: 'BILLING_CHECKOUT_IN_PROGRESS',
    CHECKOUT_FAILED: 'BILLING_CHECKOUT_FAILED',
    CHECKOUT_AMBIGUOUS: 'BILLING_CHECKOUT_AMBIGUOUS',
    CHECKOUT_EXPIRED: 'BILLING_CHECKOUT_EXPIRED',
    PROVIDER_REJECTED: 'BILLING_PROVIDER_REJECTED',
    PROVIDER_UNAVAILABLE: 'BILLING_PROVIDER_UNAVAILABLE',
    PROVIDER_TIMEOUT: 'BILLING_PROVIDER_TIMEOUT',
    INVALID_PROVIDER_RESPONSE: 'BILLING_INVALID_PROVIDER_RESPONSE',
    BILLING_UNAVAILABLE: 'BILLING_UNAVAILABLE',
});

const CheckoutInputSchema = z.object({
    userId: z.string().uuid(),
    email: z.string().trim().email().max(320),
    plan: z.enum(Object.keys(PLAN_DEFINITIONS)),
    idempotencyKey: z.string().uuid(),
}).strict();

const CheckoutResponseSchema = z.object({
    session_id: z.string().trim().min(1).max(255),
    checkout_url: z.string().trim().url(),
});

const ProductIdSchema = z.string().trim().min(1).max(255);

export class PaymentError extends Error {
    constructor(publicCode, publicMessage, statusCode, { ambiguous = false } = {}) {
        super(publicMessage);
        this.name = 'PaymentError';
        this.code = publicCode;
        this.publicCode = publicCode;
        this.publicMessage = publicMessage;
        this.statusCode = statusCode;
        this.ambiguous = ambiguous;
    }
}

const paymentError = (publicCode, publicMessage, statusCode, options) => (
    new PaymentError(publicCode, publicMessage, statusCode, options)
);

const configurationError = () => paymentError(
    PAYMENT_ERROR_CODES.CONFIGURATION_ERROR,
    'Billing is not configured',
    503
);

export const getPlanCatalog = (runtimeEnv = env) => {
    const catalog = Object.fromEntries(Object.entries(PLAN_DEFINITIONS).map(([key, definition]) => {
        const parsedProductId = ProductIdSchema.safeParse(runtimeEnv[definition.productIdEnv]);
        if (!parsedProductId.success) throw configurationError();
        return [key, Object.freeze({
            key,
            name: definition.name,
            scans: definition.scans,
            productId: parsedProductId.data,
        })];
    }));

    const productIds = Object.values(catalog).map((plan) => plan.productId);
    if (new Set(productIds).size !== productIds.length) throw configurationError();
    return Object.freeze(catalog);
};

export const PLAN_INFO = Object.freeze(Object.fromEntries(
    Object.entries(PLAN_DEFINITIONS).map(([key, definition]) => [key, Object.freeze({
        key,
        name: definition.name,
        scans: definition.scans,
        productId: env[definition.productIdEnv],
    })])
));

const getDodoEnvironment = (runtimeEnv) => {
    try {
        const apiBaseUrl = new URL(runtimeEnv.DODO_API_BASE_URL);
        const isRootUrl = ['/', ''].includes(apiBaseUrl.pathname)
            && !apiBaseUrl.search
            && !apiBaseUrl.hash
            && !apiBaseUrl.username
            && !apiBaseUrl.password;
        const dodoEnvironment = DODO_ENVIRONMENTS[apiBaseUrl.origin];
        if (!isRootUrl || !dodoEnvironment) throw new Error('Unsupported Dodo API origin');
        return {
            ...dodoEnvironment,
            checkoutEndpoint: `${apiBaseUrl.origin}/checkouts`,
        };
    } catch {
        throw configurationError();
    }
};

const requireServerUrl = (value) => {
    try {
        const parsedUrl = new URL(value);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported URL');
        return parsedUrl.toString();
    } catch {
        throw configurationError();
    }
};

export const validateCheckoutUrl = (value, expectedHostname) => {
    let parsedUrl;
    try {
        parsedUrl = new URL(value);
    } catch {
        throw paymentError(
            PAYMENT_ERROR_CODES.INVALID_PROVIDER_RESPONSE,
            'Payment provider returned an invalid response',
            502,
            { ambiguous: true }
        );
    }

    const valid = parsedUrl.protocol === 'https:'
        && parsedUrl.hostname === expectedHostname
        && parsedUrl.port === ''
        && parsedUrl.username === ''
        && parsedUrl.password === '';

    if (!valid) {
        throw paymentError(
            PAYMENT_ERROR_CODES.INVALID_PROVIDER_RESPONSE,
            'Payment provider returned an invalid response',
            502,
            { ambiguous: true }
        );
    }
    return parsedUrl.toString();
};

const buildProviderError = (error) => {
    if (error instanceof PaymentError) return error;

    if (axios.isAxiosError(error)) {
        if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
            return paymentError(
                PAYMENT_ERROR_CODES.PROVIDER_TIMEOUT,
                'Payment provider timed out',
                504,
                { ambiguous: true }
            );
        }
        if (error.response) {
            if (error.response.status >= 500) {
                return paymentError(
                    PAYMENT_ERROR_CODES.PROVIDER_UNAVAILABLE,
                    'Payment provider is unavailable',
                    503,
                    { ambiguous: true }
                );
            }
            return paymentError(
                PAYMENT_ERROR_CODES.PROVIDER_REJECTED,
                'Payment provider rejected the request',
                502
            );
        }
        return paymentError(
            PAYMENT_ERROR_CODES.PROVIDER_UNAVAILABLE,
            'Payment provider is unavailable',
            503,
            { ambiguous: true }
        );
    }

    return paymentError(
        PAYMENT_ERROR_CODES.PROVIDER_UNAVAILABLE,
        'Payment provider is unavailable',
        503,
        { ambiguous: true }
    );
};

const resolveExistingAttempt = async ({ attempt, plan, repository, now }) => {
    if (attempt.plan !== plan) {
        throw paymentError(
            PAYMENT_ERROR_CODES.IDEMPOTENCY_CONFLICT,
            'This checkout key was already used for another plan',
            409
        );
    }

    const expired = Date.parse(attempt.expiresAt) <= now().getTime();
    if (expired && [CHECKOUT_ATTEMPT_STATES.CREATING, CHECKOUT_ATTEMPT_STATES.READY].includes(attempt.state)) {
        try {
            await repository.markExpired(attempt.id);
        } catch {
            // The existing row still prevents another provider request with this key.
        }
        throw paymentError(
            PAYMENT_ERROR_CODES.CHECKOUT_EXPIRED,
            'Checkout session expired; start a new checkout',
            409
        );
    }

    switch (attempt.state) {
        case CHECKOUT_ATTEMPT_STATES.READY:
            if (!attempt.checkoutUrl || !attempt.providerSessionId) {
                throw paymentError(
                    PAYMENT_ERROR_CODES.BILLING_UNAVAILABLE,
                    'Billing is temporarily unavailable',
                    503
                );
            }
            return {
                checkoutUrl: attempt.checkoutUrl,
                checkoutSessionId: attempt.providerSessionId,
                reused: true,
            };
        case CHECKOUT_ATTEMPT_STATES.CREATING:
            throw paymentError(
                PAYMENT_ERROR_CODES.CHECKOUT_IN_PROGRESS,
                'Checkout creation is already in progress',
                409
            );
        case CHECKOUT_ATTEMPT_STATES.AMBIGUOUS:
            throw paymentError(
                PAYMENT_ERROR_CODES.CHECKOUT_AMBIGUOUS,
                'Checkout status is unknown; start a new checkout only after checking billing status',
                409,
                { ambiguous: true }
            );
        case CHECKOUT_ATTEMPT_STATES.FAILED:
            throw paymentError(
                PAYMENT_ERROR_CODES.CHECKOUT_FAILED,
                'The previous checkout attempt failed; start a new checkout',
                409
            );
        case CHECKOUT_ATTEMPT_STATES.EXPIRED:
        default:
            throw paymentError(
                PAYMENT_ERROR_CODES.CHECKOUT_EXPIRED,
                'Checkout session expired; start a new checkout',
                409
            );
    }
};

export const createPaymentService = ({
    httpClient = axios,
    attemptRepository = createCheckoutAttemptRepository(),
    runtimeEnv = env,
    paymentLogger = logger,
    now = () => new Date(),
} = {}) => {
    const updateAttemptAfterProviderError = async (attemptId, error) => {
        try {
            if (error.ambiguous) {
                await attemptRepository.markAmbiguous(attemptId, error.publicCode);
            } else {
                await attemptRepository.markFailed(attemptId, error.publicCode);
            }
        } catch {
            paymentLogger.warn('Checkout attempt state could not be finalized', {
                code: PAYMENT_ERROR_CODES.BILLING_UNAVAILABLE,
            });
        }
    };

    const createCheckout = async (input) => {
        const parsedInput = CheckoutInputSchema.safeParse(input);
        if (!parsedInput.success) {
            const invalidPlan = input?.plan && !PLAN_DEFINITIONS[input.plan];
            throw paymentError(
                invalidPlan ? PAYMENT_ERROR_CODES.INVALID_PLAN : PAYMENT_ERROR_CODES.INVALID_REQUEST,
                invalidPlan ? 'Invalid subscription plan' : 'Invalid checkout request',
                400
            );
        }

        const { userId, email, plan, idempotencyKey } = parsedInput.data;
        const planCatalog = getPlanCatalog(runtimeEnv);
        const dodoEnvironment = getDodoEnvironment(runtimeEnv);
        const apiKey = String(runtimeEnv.DODO_API_KEY || '').trim();
        if (!apiKey) throw configurationError();
        const returnUrl = requireServerUrl(runtimeEnv.DODO_CHECKOUT_RETURN_URL);
        const cancelUrl = requireServerUrl(runtimeEnv.DODO_CHECKOUT_CANCEL_URL);
        const requestedAt = now();
        const expiresAt = new Date(requestedAt.getTime() + CHECKOUT_ATTEMPT_TTL_MS).toISOString();

        let claimResult;
        try {
            claimResult = await attemptRepository.claim({
                userId,
                plan,
                idempotencyKeyHash: hashIdempotencyKey(idempotencyKey),
                expiresAt,
            });
        } catch (error) {
            if (error instanceof CheckoutAttemptStoreError) {
                throw paymentError(
                    PAYMENT_ERROR_CODES.BILLING_UNAVAILABLE,
                    'Billing is temporarily unavailable',
                    503
                );
            }
            throw error;
        }

        if (!claimResult.claimed) {
            return resolveExistingAttempt({
                attempt: claimResult.attempt,
                plan,
                repository: attemptRepository,
                now,
            });
        }

        const attempt = claimResult.attempt;
        if (attempt.state !== CHECKOUT_ATTEMPT_STATES.CREATING) {
            throw paymentError(
                PAYMENT_ERROR_CODES.BILLING_UNAVAILABLE,
                'Billing is temporarily unavailable',
                503
            );
        }

        try {
            const response = await httpClient.post(
                dodoEnvironment.checkoutEndpoint,
                {
                    product_cart: [{
                        product_id: planCatalog[plan].productId,
                        quantity: 1,
                    }],
                    customer: { email },
                    subscription_data: { trial_period_days: 0 },
                    mandate_min_amount_inr_paise: 1,
                    return_url: returnUrl,
                    cancel_url: cancelUrl,
                    metadata: {
                        user_id: userId,
                        plan,
                        checkout_attempt_id: attempt.id,
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    timeout: DODO_API_TIMEOUT_MS,
                    maxRedirects: 0,
                }
            );

            const parsedResponse = CheckoutResponseSchema.safeParse(response?.data);
            if (!parsedResponse.success) {
                throw paymentError(
                    PAYMENT_ERROR_CODES.INVALID_PROVIDER_RESPONSE,
                    'Payment provider returned an invalid response',
                    502,
                    { ambiguous: true }
                );
            }

            const checkoutUrl = validateCheckoutUrl(
                parsedResponse.data.checkout_url,
                dodoEnvironment.checkoutHost
            );

            try {
                await attemptRepository.markReady(attempt.id, {
                    providerSessionId: parsedResponse.data.session_id,
                    checkoutUrl,
                });
            } catch {
                paymentLogger.warn('Provider checkout could not be persisted', {
                    code: PAYMENT_ERROR_CODES.CHECKOUT_AMBIGUOUS,
                });
                throw paymentError(
                    PAYMENT_ERROR_CODES.CHECKOUT_AMBIGUOUS,
                    'Checkout status is unknown; start a new checkout only after checking billing status',
                    503,
                    { ambiguous: true }
                );
            }

            paymentLogger.info('Checkout session created', { plan, mode: dodoEnvironment.mode });
            return {
                checkoutUrl,
                checkoutSessionId: parsedResponse.data.session_id,
                reused: false,
            };
        } catch (error) {
            const providerError = buildProviderError(error);
            await updateAttemptAfterProviderError(attempt.id, providerError);
            paymentLogger.warn('Checkout provider request failed', {
                code: providerError.publicCode,
                providerStatus: error?.response?.status,
            });
            throw providerError;
        }
    };

    return Object.freeze({ createCheckout });
};

const defaultPaymentService = createPaymentService();

export const createCheckout = (input) => defaultPaymentService.createCheckout(input);

// Compatibility export for callers transitioning from the Day 1 route. The new
// controller must always supply the required idempotency key.
export const createCheckoutSession = (userId, email, plan, idempotencyKey) => createCheckout({
    userId,
    email,
    plan,
    idempotencyKey,
});

/**
 * Legacy verification remains import-compatible only until the old webhook
 * route is quarantined. Day 9 replaces it with Standard Webhooks verification.
 */
export const verifyWebhookSignature = (payload, signature) => {
    if (!payload || !signature) return false;
    const expected = crypto
        .createHmac('sha256', env.DODO_WEBHOOK_SECRET)
        .update(payload, 'utf8')
        .digest('hex');
    const normalizedSignature = signature.trim().replace(/^sha256=/, '');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(normalizedSignature, 'hex')
        );
    } catch {
        return false;
    }
};

export default {
    createCheckout,
    createCheckoutSession,
    createPaymentService,
    getPlanCatalog,
    verifyWebhookSignature,
    PAYMENT_ERROR_CODES,
    PLAN_INFO,
};
