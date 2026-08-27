import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';
import { z } from 'zod';

/**
 * Centralized error handler middleware
 * Must be the last middleware registered
 */
export const errorMiddleware = (err, req, res, _next) => {
    if (err?.type === 'entity.too.large' || (err?.status === 413 && req.path === '/api/webhook')) {
        return errorResponse(res, 'Webhook request is too large', 413, 'WEBHOOK_BODY_TOO_LARGE');
    }

    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return errorResponse(
            res,
            'Invalid request body',
            400,
            'INVALID_JSON'
        );
    }

    // Normalize known validation errors
    if (err instanceof z.ZodError) {
        const firstMessage = err.errors?.[0]?.message || 'Validation failed';
        return errorResponse(res, firstMessage, 400);
    }

    // Default to 500 if no status code
    const statusCode = err.statusCode || 500;
    const message = err.publicMessage
        || (statusCode < 500 ? err.message : 'Internal server error');

    const logContext = {
        code: err.publicCode,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
    };

    if (statusCode >= 500) {
        logger.error('Unhandled server error', {
            ...logContext,
            message: err.message,
            stack: err.stack,
        });
    } else {
        logger.warn('Request rejected', logContext);
    }

    return errorResponse(res, message, statusCode, err.publicCode);
};

export default errorMiddleware;
