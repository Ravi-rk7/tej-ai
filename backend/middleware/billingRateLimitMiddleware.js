import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';

export const BILLING_RATE_LIMIT = 5;
export const BILLING_RATE_WINDOW = '15 m';

let billingRateLimiter;

const getBillingRateLimiter = () => {
    if (!billingRateLimiter) {
        if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
            throw new Error('Billing rate-limit storage is not configured');
        }

        const redis = new Redis({
            url: env.UPSTASH_REDIS_REST_URL,
            token: env.UPSTASH_REDIS_REST_TOKEN,
        });

        billingRateLimiter = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(BILLING_RATE_LIMIT, BILLING_RATE_WINDOW),
            analytics: false,
            prefix: 'tejai:billing',
        });
    }

    return billingRateLimiter;
};

export const createBillingRateLimitMiddleware = ({
    limiter,
    now = () => Date.now(),
    billingLogger = logger,
} = {}) => async (req, res, next) => {
    if (!req.user?.id) {
        return errorResponse(res, 'Unauthorized', 401);
    }

    try {
        const activeLimiter = limiter || getBillingRateLimiter();
        const subjectHash = crypto
            .createHash('sha256')
            .update(req.user.id, 'utf8')
            .digest('hex');
        const result = await activeLimiter.limit(`checkout:${subjectHash}`);
        const reset = Number.isFinite(result.reset) ? result.reset : now();
        const retryAfterSeconds = Math.max(0, Math.ceil((reset - now()) / 1000));

        res.set('X-RateLimit-Limit', String(BILLING_RATE_LIMIT));
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

export default billingRateLimitMiddleware;
