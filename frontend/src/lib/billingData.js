const CHECKOUT_ORIGINS = new Set([
    "https://test.checkout.dodopayments.com",
    "https://checkout.dodopayments.com",
]);

export const PLAN_ORDER = Object.freeze(["free", "starter", "growth", "pro"]);

export const BILLING_PLANS = Object.freeze([
    Object.freeze({
        slug: "free",
        name: "Free",
        price: "$0",
        period: "/month",
        scans: 1,
        description: "One monthly scan with the complete TejAi result experience.",
    }),
    Object.freeze({
        slug: "starter",
        name: "Starter",
        price: "$6.99",
        period: "/month",
        scans: 15,
        description: "A practical allowance for checking in throughout the month.",
    }),
    Object.freeze({
        slug: "growth",
        name: "Growth",
        price: "$12.99",
        period: "/month",
        scans: 30,
        description: "More room for regular cosmetic-wellness check-ins.",
    }),
    Object.freeze({
        slug: "pro",
        name: "Pro",
        price: "$19.99",
        period: "/month",
        scans: 50,
        description: "The largest monthly scan allowance available in TejAi.",
    }),
]);

export const PAID_PLANS = Object.freeze(BILLING_PLANS.filter(({ slug }) => slug !== "free"));

export const BILLING_PLAN_BY_SLUG = Object.freeze(Object.fromEntries(
    BILLING_PLANS.map((plan) => [plan.slug, plan])
));

const SUBSCRIPTION_STATUSES = new Set([
    "active",
    "pending",
    "past_due",
    "on_hold",
    "cancelled",
    "expired",
    "failed",
]);

const CHECKOUT_STATUSES = new Set([
    "pending",
    "processing",
    "succeeded",
    "failed",
    "cancelled",
    "expired",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_ATTEMPT_KEY = "tejai.checkout-attempt.v1";
const CHECKOUT_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
export const RETURN_STATUS_POLL_MAX_ATTEMPTS = 5;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isIsoDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));

export const isPlanSlug = (value) => typeof value === "string" && PLAN_ORDER.includes(value);
export const isPaidPlan = (value) => isPlanSlug(value) && value !== "free";

export const canCreatePaidCheckout = (subscription, candidatePlan) => {
    if (!isObject(subscription) || !isPaidPlan(candidatePlan)) return false;
    return (subscription.plan === "free" && subscription.status === "active")
        || subscription.status === "expired";
};

export const getPlanFromSearch = (searchParams) => {
    const value = searchParams?.get?.("plan");
    return isPaidPlan(value) ? value : null;
};

export const getCheckoutMarker = (searchParams) => {
    const value = searchParams?.get?.("checkout");
    return value === "returned" || value === "cancelled" ? value : null;
};

export const normalizeCheckoutSession = (data) => {
    if (!isObject(data)) return null;
    const checkoutUrl = typeof data.checkoutUrl === "string" ? data.checkoutUrl : "";
    const checkoutSessionId = typeof data.checkoutSessionId === "string"
        ? data.checkoutSessionId.trim()
        : "";

    try {
        const parsedUrl = new URL(checkoutUrl);
        if (!CHECKOUT_ORIGINS.has(parsedUrl.origin) || parsedUrl.username || parsedUrl.password) {
            return null;
        }
    } catch {
        return null;
    }

    if (!checkoutSessionId) return null;

    return {
        checkoutUrl,
        checkoutSessionId,
        reused: data.reused === true,
    };
};

export const normalizeSubscription = (data) => {
    if (!isObject(data)) return null;
    const source = isObject(data.subscription) ? data.subscription : data;
    if (!isPlanSlug(source.plan)) return null;

    const plan = BILLING_PLAN_BY_SLUG[source.plan];
    const rawStatus = typeof source.status === "string" ? source.status.toLowerCase() : "";
    const rawCheckout = isObject(data.checkout)
        ? data.checkout
        : isObject(data.latestCheckout)
            ? data.latestCheckout
            : null;
    const rawCheckoutStatus = typeof rawCheckout?.status === "string"
        ? rawCheckout.status.toLowerCase()
        : null;

    return {
        schemaVersion: Number.isInteger(data.schemaVersion) ? data.schemaVersion : 1,
        plan: source.plan,
        status: SUBSCRIPTION_STATUSES.has(rawStatus) ? rawStatus : "unknown",
        scanLimit: Number.isInteger(source.scanLimit) && source.scanLimit > 0
            ? source.scanLimit
            : plan.scans,
        currentPeriodEnd: isIsoDate(source.currentPeriodEnd) ? source.currentPeriodEnd : null,
        cancelAtPeriodEnd: source.cancelAtPeriodEnd === true,
        updatedAt: isIsoDate(source.updatedAt) ? source.updatedAt : null,
        checkout: rawCheckout
            ? {
                plan: isPaidPlan(rawCheckout.plan || rawCheckout.targetPlan)
                    ? rawCheckout.plan || rawCheckout.targetPlan
                    : null,
                status: CHECKOUT_STATUSES.has(rawCheckoutStatus) ? rawCheckoutStatus : "unknown",
            }
            : null,
    };
};

export const getSubscriptionStatusLabel = (status) => ({
    active: "Active",
    pending: "Pending",
    past_due: "Payment issue",
    on_hold: "On hold",
    cancelled: "Cancelled",
    expired: "Expired",
    failed: "Payment failed",
    unknown: "Unavailable",
}[status] || "Unavailable");

export const shouldPollSubscriptionReturn = ({
    subscription,
    targetPlan,
    attempt,
    maxAttempts = RETURN_STATUS_POLL_MAX_ATTEMPTS,
}) => {
    if (!isObject(subscription) || !Number.isInteger(attempt) || attempt >= maxAttempts - 1) return false;
    if (["failed", "cancelled", "expired"].includes(subscription.status)) return false;
    if (["failed", "cancelled", "expired"].includes(subscription.checkout?.status)) return false;
    if (targetPlan && subscription.plan === targetPlan && subscription.status === "active") return false;
    return isPaidPlan(targetPlan);
};

export const getSafeCheckoutError = (error) => {
    const code = error?.body?.code;
    if (code === "BILLING_RATE_LIMITED" || error?.status === 429) return "Too many checkout attempts. Please wait a moment and try again.";
    if (error?.status === 401) return "Your session expired. Please sign in again.";
    if (code === "SUBSCRIPTION_ALREADY_ACTIVE") return "That plan is already active. Refresh your subscription status.";
    if (code === "BILLING_IDEMPOTENCY_CONFLICT") return "That checkout request no longer matches this plan. Please try again.";
    if (code === "BILLING_CHECKOUT_FAILED") return "The checkout session failed. Start a new checkout when you are ready.";
    if (code === "BILLING_CHECKOUT_EXPIRED") return "The checkout session expired. Start a new checkout when you are ready.";
    if (code === "BILLING_PROVIDER_REJECTED") return "The payment provider rejected the checkout request. Please try again.";
    if (code === "BILLING_CHECKOUT_IN_PROGRESS") return "A checkout request is already in progress. Retry safely in a moment.";
    if (code === "BILLING_CHECKOUT_AMBIGUOUS") return "Checkout may already have started. Retry safely; TejAi will reuse the same request.";
    if (code === "BILLING_INVALID_PROVIDER_RESPONSE") return "Checkout may already have started, but the provider response was incomplete. Retry safely with the same request.";
    if (code === "BILLING_CHECKOUT_DISABLED") return "Checkout is temporarily disabled. Your current plan has not changed.";
    if (code === "BILLING_RATE_LIMIT_UNAVAILABLE") return "Checkout protection is temporarily unavailable. Please try again later.";
    if (code === "BILLING_PROVIDER_TIMEOUT") return "The payment provider took too long to respond. Retry safely in a moment.";
    if (code === "BILLING_PROVIDER_UNAVAILABLE" || error?.status >= 500) {
        return "Secure checkout is temporarily unavailable. Retry safely in a moment.";
    }
    return "We could not open secure checkout. Please try again.";
};

export const shouldPreserveCheckoutAttempt = (error) => {
    const code = error?.body?.code;
    return !error?.status || [
        "BILLING_CHECKOUT_AMBIGUOUS",
        "BILLING_CHECKOUT_IN_PROGRESS",
        "BILLING_PROVIDER_TIMEOUT",
        "BILLING_PROVIDER_UNAVAILABLE",
        "BILLING_INVALID_PROVIDER_RESPONSE",
    ].includes(code);
};

const getStorage = (storage) => {
    if (storage) return storage;
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
};

export const readCheckoutAttempt = ({ storage, now = Date.now() } = {}) => {
    const resolvedStorage = getStorage(storage);
    if (!resolvedStorage) return null;

    try {
        const parsed = JSON.parse(resolvedStorage.getItem(CHECKOUT_ATTEMPT_KEY));
        const age = now - parsed?.createdAt;
        if (
            !isPaidPlan(parsed?.plan)
            || !UUID_PATTERN.test(parsed?.idempotencyKey || "")
            || !Number.isFinite(age)
            || age < 0
            || age >= CHECKOUT_ATTEMPT_TTL_MS
        ) {
            resolvedStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
            return null;
        }
        return parsed;
    } catch {
        resolvedStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
        return null;
    }
};

export const getOrCreateCheckoutAttempt = ({
    plan,
    storage,
    now = Date.now(),
    createUuid = () => globalThis.crypto.randomUUID(),
} = {}) => {
    if (!isPaidPlan(plan)) return null;
    const resolvedStorage = getStorage(storage);
    const existing = readCheckoutAttempt({ storage: resolvedStorage, now });
    if (existing?.plan === plan) return existing;
    if (existing) {
        return {
            ...existing,
            blocked: true,
            requestedPlan: plan,
        };
    }

    const idempotencyKey = createUuid();
    if (!UUID_PATTERN.test(idempotencyKey)) return null;
    const attempt = { plan, idempotencyKey, createdAt: now };
    resolvedStorage?.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt));
    return attempt;
};

export const clearCheckoutAttempt = ({ storage } = {}) => {
    getStorage(storage)?.removeItem(CHECKOUT_ATTEMPT_KEY);
};

const billingData = {
    BILLING_PLANS,
    PAID_PLANS,
    getCheckoutMarker,
    getOrCreateCheckoutAttempt,
    getPlanFromSearch,
    normalizeCheckoutSession,
    normalizeSubscription,
};

export default billingData;
