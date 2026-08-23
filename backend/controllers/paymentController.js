import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse, successResponse } from '../utils/responseFormatter.js';
import { createCheckout } from '../services/paymentService.js';
import { getBillingSubscription } from '../services/supabaseService.js';
import { PLAN_LIMITS } from '../services/entitlementService.js';

const PAID_PLANS = new Set(['starter', 'growth', 'pro']);
const KNOWN_PLANS = new Set(['free', ...PAID_PLANS]);
const KNOWN_STATUSES = new Set([
    'active',
    'cancelled',
    'past_due',
    'pending',
    'on_hold',
    'expired',
]);
const BLOCKED_PAID_STATUSES = new Set([
    'active',
    'on_hold',
    'past_due',
    'pending',
]);

const CheckoutRequestSchema = z
    .object({
        plan: z.enum(['starter', 'growth', 'pro']),
    })
    .strict();

const IdempotencyKeySchema = z.string().uuid();

const setPrivateNoStore = (res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');
};

const safeDate = (value) => {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
};

const publicPaymentError = (res, error) => {
    const statusCode = Number.isInteger(error.statusCode)
        && error.statusCode >= 400
        && error.statusCode <= 504
        ? error.statusCode
        : 502;
    const publicCode = typeof error.publicCode === 'string'
        ? error.publicCode
        : undefined;
    return errorResponse(
        res,
        error.publicMessage || 'Unable to create checkout session',
        statusCode,
        publicCode
    );
};

export const serializeBillingSubscription = (subscription) => {
    if (!subscription) {
        return {
            schemaVersion: 1,
            plan: 'free',
            status: 'active',
            scanLimit: PLAN_LIMITS.free,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            updatedAt: null,
        };
    }

    const plan = KNOWN_PLANS.has(subscription.plan) ? subscription.plan : 'free';
    const status = KNOWN_STATUSES.has(subscription.status)
        ? subscription.status
        : 'unavailable';

    return {
        schemaVersion: 1,
        plan,
        status,
        scanLimit: PLAN_LIMITS[plan],
        currentPeriodEnd: safeDate(subscription.current_period_end),
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        updatedAt: safeDate(subscription.updated_at),
    };
};

export const assertCheckoutAllowedForSubscription = (
    subscription,
    now = new Date()
) => {
    if (!subscription || subscription.plan === 'free') return;

    if (!PAID_PLANS.has(subscription.plan) || !KNOWN_STATUSES.has(subscription.status)) {
        const error = new Error('Subscription state is unavailable');
        error.publicMessage = 'Unable to verify the current subscription';
        error.publicCode = 'SUBSCRIPTION_STATE_INVALID';
        error.statusCode = 503;
        throw error;
    }

    if (subscription.status === 'expired') return;

    if (subscription.status === 'cancelled') {
        const periodEnd = safeDate(subscription.current_period_end);
        if (periodEnd && Date.parse(periodEnd) <= now.getTime()) return;
        if (!periodEnd) {
            const error = new Error('Cancelled subscription has no valid period end');
            error.publicMessage = 'Unable to verify the current subscription';
            error.publicCode = 'SUBSCRIPTION_STATE_INVALID';
            error.statusCode = 503;
            throw error;
        }
    }

    if (
        BLOCKED_PAID_STATUSES.has(subscription.status)
        || subscription.status === 'cancelled'
    ) {
        const error = new Error('A paid subscription is already active');
        error.publicMessage = 'A paid subscription is already active for this account';
        error.publicCode = 'SUBSCRIPTION_ALREADY_ACTIVE';
        error.statusCode = 409;
        throw error;
    }

    const error = new Error('Paid subscription state is not definitively expired');
    error.publicMessage = 'Unable to verify the current subscription';
    error.publicCode = 'SUBSCRIPTION_STATE_INVALID';
    error.statusCode = 503;
    throw error;
};

export const createCheckoutAvailabilityMiddleware = ({
    enabled = () => env.BILLING_CHECKOUT_ENABLED,
} = {}) => (req, res, next) => {
    if (!enabled(req)) {
        setPrivateNoStore(res);
        return errorResponse(
            res,
            'Checkout is temporarily unavailable',
            503,
            'BILLING_CHECKOUT_DISABLED'
        );
    }

    return next();
};

export const createBillingCheckoutHandler = ({
    createCheckoutSession = createCheckout,
    loadSubscription = getBillingSubscription,
    enabled = () => env.BILLING_CHECKOUT_ENABLED,
    now = () => new Date(),
    paymentLogger = logger,
} = {}) => async (req, res) => {
    setPrivateNoStore(res);

    if (!enabled(req)) {
        return errorResponse(
            res,
            'Checkout is temporarily unavailable',
            503,
            'BILLING_CHECKOUT_DISABLED'
        );
    }

    const requestResult = CheckoutRequestSchema.safeParse(req.body);
    if (!requestResult.success) {
        return errorResponse(
            res,
            'Checkout request must contain only a supported plan',
            400,
            'BILLING_REQUEST_INVALID'
        );
    }

    const idempotencyResult = IdempotencyKeySchema.safeParse(
        req.headers?.['idempotency-key']
    );
    if (!idempotencyResult.success) {
        return errorResponse(
            res,
            'A valid Idempotency-Key header is required',
            400,
            'BILLING_IDEMPOTENCY_KEY_INVALID'
        );
    }

    const emailResult = z.string().email().safeParse(req.user?.email);
    if (!req.user?.id || !emailResult.success) {
        return errorResponse(
            res,
            'A verified account email is required for checkout',
            400,
            'BILLING_EMAIL_REQUIRED'
        );
    }

    try {
        const subscription = await loadSubscription(req.user.id);
        assertCheckoutAllowedForSubscription(subscription, now());

        const checkout = await createCheckoutSession({
            userId: req.user.id,
            email: emailResult.data,
            plan: requestResult.data.plan,
            idempotencyKey: idempotencyResult.data,
        });

        if (
            typeof checkout?.checkoutUrl !== 'string'
            || typeof checkout?.checkoutSessionId !== 'string'
            || typeof checkout?.reused !== 'boolean'
        ) {
            throw new Error('Checkout service returned an invalid response');
        }

        return successResponse(
            res,
            {
                checkoutUrl: checkout.checkoutUrl,
                checkoutSessionId: checkout.checkoutSessionId,
                reused: checkout.reused,
            },
            checkout.reused ? 200 : 201
        );
    } catch (error) {
        if (error.publicMessage) return publicPaymentError(res, error);

        paymentLogger.error('Billing checkout failed', {
            code: 'BILLING_CHECKOUT_FAILED',
        });
        return errorResponse(
            res,
            'Unable to create checkout session',
            502,
            'BILLING_CHECKOUT_FAILED'
        );
    }
};

export const createSubscriptionStatusHandler = ({
    loadSubscription = getBillingSubscription,
    paymentLogger = logger,
} = {}) => async (req, res) => {
    setPrivateNoStore(res);

    try {
        const subscription = await loadSubscription(req.user.id);
        return successResponse(res, serializeBillingSubscription(subscription));
    } catch (_error) {
        paymentLogger.error('Billing subscription status failed', {
            code: 'SUBSCRIPTION_STATUS_UNAVAILABLE',
        });
        return errorResponse(
            res,
            'Unable to load subscription status',
            503,
            'SUBSCRIPTION_STATUS_UNAVAILABLE'
        );
    }
};

export const createBillingRelayHandler = (location) => (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    return res.redirect(303, location);
};

export const disabledBillingEndpoint = (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return errorResponse(
        res,
        'This billing endpoint is not available',
        503,
        'BILLING_ENDPOINT_DISABLED'
    );
};

export const disabledWebhookEndpoint = (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return errorResponse(
        res,
        'Payment webhooks are not available yet',
        503,
        'WEBHOOK_NOT_READY'
    );
};

export const checkoutAvailabilityMiddleware = createCheckoutAvailabilityMiddleware();
export const createBillingCheckout = createBillingCheckoutHandler();
export const getSubscriptionStatus = createSubscriptionStatusHandler();
export const relayBillingReturn = createBillingRelayHandler(
    env.BILLING_RETURN_REDIRECT_URL
);
export const relayBillingCancel = createBillingRelayHandler(
    env.BILLING_CANCEL_REDIRECT_URL
);

export default {
    checkoutAvailabilityMiddleware,
    createBillingCheckout,
    disabledBillingEndpoint,
    disabledWebhookEndpoint,
    getSubscriptionStatus,
    relayBillingCancel,
    relayBillingReturn,
};
