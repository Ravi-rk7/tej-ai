import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';
import { hashSecurityIdentifier } from '../utils/securityHash.js';

export const BILLING_RATE_LIMIT = 5;
export const BILLING_RATE_WINDOW = '15 m';

const billingRateLimiters = new Map();

const getBillingRateLimiter = ({ keyPrefix, limit }) => {
    if (!billingRateLimiters.has(keyPrefix)) {
        if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
            throw new Error('Billing rate-limit storage is not configured');
        }

        const redis = new Redis({
            url: env.UPSTASH_REDIS_REST_URL,
            token: env.UPSTASH_REDIS_REST_TOKEN,
        });

        billingRateLimiters.set(keyPrefix, new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(limit, BILLING_RATE_WINDOW),
            analytics: false,
            prefix: `tejai:billing:${keyPrefix}`,
            timeout: 750,
        }));
    }

    return billingRateLimiters.get(keyPrefix);
};

export const createBillingRateLimitMiddleware = ({
    limiter,
    now = () => Date.now(),
    billingLogger = logger,
    keyPrefix = 'checkout',
    limit = BILLING_RATE_LIMIT,
} = {}) => async (req, res, next) => {
    if (!req.user?.id) {
        return errorResponse(res, 'Unauthorized', 401);
    }

    try {
        const activeLimiter = limiter || getBillingRateLimiter({ keyPrefix, limit });
        const subjectHash = hashSecurityIdentifier(`${keyPrefix}:${req.user.id}`);
        const result = await activeLimiter.limit(`${keyPrefix}:${subjectHash}`);
        if (result.reason === 'timeout') throw new Error('rate_limit_timeout');
        const reset = Number.isFinite(result.reset) ? result.reset : now();
        const retryAfterSeconds = Math.max(0, Math.ceil((reset - now()) / 1000));

        res.set('X-RateLimit-Limit', String(limit));
        res.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining || 0)));
        res.set('X-RateLimit-Reset', String(Math.ceil(reset / 1000)));

        if (!result.success) {
            res.set('Retry-After', String(retryAfterSeconds));
            billingLogger.warn('Billing checkout rate limit reached');
            return errorResponse(
                res,
                'Too many checkout attempts. Please try again later.',
                429,
                'BILLING_RATE_LIMITED'
            );
        }

        return next();
    } catch (_error) {
        billingLogger.error('Billing rate limit unavailable', {
            code: 'BILLING_RATE_LIMIT_UNAVAILABLE',
        });
        return errorResponse(
            res,
            'Checkout is temporarily unavailable',
            503,
            'BILLING_RATE_LIMIT_UNAVAILABLE'
        );
    }
};

export const billingRateLimitMiddleware = createBillingRateLimitMiddleware();
export const portalRateLimitMiddleware = createBillingRateLimitMiddleware({
    keyPrefix: 'portal',
    limit: 10,
});

export default billingRateLimitMiddleware;
