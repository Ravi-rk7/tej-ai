import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';

let ratelimit;

const getRateLimiter = () => {
    if (!ratelimit) {
        if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
            throw new Error('Upstash Redis credentials are not configured');
        }

        const redis = new Redis({
            url: env.UPSTASH_REDIS_REST_URL,
            token: env.UPSTASH_REDIS_REST_TOKEN,
        });

        ratelimit = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(10, '1 m'),
            analytics: true,
        });
    }

    return ratelimit;
};

/**
 * Rate limit middleware - sliding window 10 requests/minute per user
 */
export const rateLimitMiddleware = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(); // Skip if not authenticated
        }

        const key = `ratelimit:${req.user.id}`;
        const { success, remaining, reset } = await getRateLimiter().limit(key);
        const nowMs = Date.now();
        const retryAfterSeconds = Math.max(0, Math.ceil((reset - nowMs) / 1000));

        res.set('X-RateLimit-Limit', '10');
        res.set('X-RateLimit-Remaining', String(remaining));
        res.set('X-RateLimit-Reset', String(Math.ceil(reset / 1000)));

        if (!success) {
            logger.warn(`Rate limit exceeded for user ${req.user.id}`);
            res.set('Retry-After', String(retryAfterSeconds));
            return errorResponse(res, 'Rate limit exceeded. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
        }

        next();
    } catch (err) {
        logger.error('Rate limit middleware error', err);
        next(); // Allow request to proceed if rate limit check fails
    }
};

export default rateLimitMiddleware;
