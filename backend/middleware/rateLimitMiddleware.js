import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';
import { hashSecurityIdentifier } from '../utils/securityHash.js';

const limiterCache = new Map();

const getRateLimiter = ({ keyPrefix, limit, window }) => {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
        throw new Error('Upstash Redis credentials are not configured');
    }

    if (!limiterCache.has(keyPrefix)) {
        const redis = new Redis({
            url: env.UPSTASH_REDIS_REST_URL,
            token: env.UPSTASH_REDIS_REST_TOKEN,
        });
        limiterCache.set(keyPrefix, new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(limit, window),
            analytics: false,
            prefix: `tejai:${keyPrefix}`,
            timeout: 750,
        }));
    }

    return limiterCache.get(keyPrefix);
};

const authenticatedIdentifier = (req) => req.user?.id;
const networkIdentifier = (req) => req.ip || req.socket?.remoteAddress || 'unknown-ip';

export const createRateLimitMiddleware = ({
    keyPrefix,
    limit,
    window,
    failureMode = 'open',
    identifier = authenticatedIdentifier,
    limiterFactory = getRateLimiter,
    rateLogger = logger,
    now = () => Date.now(),
    limitedCode = 'RATE_LIMIT_EXCEEDED',
    unavailableCode = 'RATE_LIMIT_UNAVAILABLE',
    limitedMessage = 'Rate limit exceeded. Please try again later.',
    unavailableMessage = 'This operation is temporarily unavailable. Please try again shortly.',
} = {}) => async (req, res, next) => {
    const rawIdentifier = identifier(req);
    if (!rawIdentifier) return next();

    try {
        const result = await limiterFactory({ keyPrefix, limit, window }).limit(
            hashSecurityIdentifier(`${keyPrefix}:${rawIdentifier}`)
        );
        if (result.reason === 'timeout') throw new Error('rate_limit_timeout');

        const reset = Number.isFinite(result.reset) ? result.reset : now();
        const retryAfterSeconds = Math.max(1, Math.ceil((reset - now()) / 1000));
        res.set('X-RateLimit-Limit', String(limit));
        res.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining ?? 0)));
        res.set('X-RateLimit-Reset', String(Math.ceil(reset / 1000)));

        if (!result.success) {
            rateLogger.warn('Rate limit reached', {
                requestId: req.requestId,
                policy: keyPrefix,
            });
            res.set('Retry-After', String(retryAfterSeconds));
            return errorResponse(res, limitedMessage, 429, limitedCode);
        }

        return next();
    } catch (_error) {
        rateLogger.error('Rate limit unavailable', {
            requestId: req.requestId,
            policy: keyPrefix,
            code: unavailableCode,
        });
        if (failureMode === 'open') return next();
        return errorResponse(res, unavailableMessage, 503, unavailableCode);
    }
};

export const rateLimitMiddleware = createRateLimitMiddleware({
    keyPrefix: 'authenticated-read',
    limit: 60,
    window: '1 m',
    failureMode: 'open',
});

export const scanRateLimitMiddleware = createRateLimitMiddleware({
    keyPrefix: 'scan-create',
    limit: 3,
    window: '10 m',
    failureMode: 'closed',
    unavailableCode: 'SCAN_RATE_LIMIT_UNAVAILABLE',
});

export const privacyMutationRateLimitMiddleware = createRateLimitMiddleware({
    keyPrefix: 'privacy-mutation',
    limit: 10,
    window: '1 h',
    failureMode: 'closed',
    unavailableCode: 'PRIVACY_RATE_LIMIT_UNAVAILABLE',
});

export const scanDeletionRateLimitMiddleware = createRateLimitMiddleware({
    keyPrefix: 'scan-delete',
    limit: 10,
    window: '1 h',
    failureMode: 'closed',
    unavailableCode: 'DELETION_RATE_LIMIT_UNAVAILABLE',
});

export const accountDeletionRateLimitMiddleware = createRateLimitMiddleware({
    keyPrefix: 'account-delete',
    limit: 3,
    window: '1 h',
    failureMode: 'closed',
    unavailableCode: 'DELETION_RATE_LIMIT_UNAVAILABLE',
});

export const webhookRateLimitMiddleware = createRateLimitMiddleware({
    keyPrefix: 'billing-webhook',
    limit: 120,
    window: '1 m',
    failureMode: 'open',
    identifier: networkIdentifier,
});

export default rateLimitMiddleware;
