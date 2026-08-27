import crypto from 'node:crypto';
import logger from '../utils/logger.js';

const UUID_SEGMENT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export const safeRouteTemplate = (req) => {
    const routePath = typeof req.route?.path === 'string' ? req.route.path : '';
    const mountedPath = typeof req.baseUrl === 'string' ? req.baseUrl : '';
    if (routePath) return `${mountedPath}${routePath}`.replace(UUID_SEGMENT, ':id');

    const pathname = String(req.originalUrl || req.url || '').split('?')[0];
    return pathname.replace(UUID_SEGMENT, ':id').slice(0, 160) || 'unmatched';
};

export const createRequestContextMiddleware = ({
    randomUUID = () => crypto.randomUUID(),
    requestLogger = logger,
    now = () => Date.now(),
} = {}) => (req, res, next) => {
    const startedAt = now();
    const requestId = randomUUID();
    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.set('X-Request-ID', requestId);

    res.once('finish', () => {
        requestLogger.http('request.completed', {
            requestId,
            method: req.method,
            route: safeRouteTemplate(req),
            statusCode: res.statusCode,
            durationMs: Math.max(0, now() - startedAt),
        });
    });

    next();
};

export const requestContextMiddleware = createRequestContextMiddleware();

export default requestContextMiddleware;
