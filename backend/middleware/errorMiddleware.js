import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';
import { z } from 'zod';

/**
 * Centralized error handler middleware
 * Must be the last middleware registered
 */
export const errorMiddleware = (err, req, res, next) => {
    logger.error('Unhandled error', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
    });

    // Normalize known validation errors
    if (err instanceof z.ZodError) {
        const firstMessage = err.errors?.[0]?.message || 'Validation failed';
        return errorResponse(res, firstMessage, 400);
    }

    // Default to 500 if no status code
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    return errorResponse(res, message, statusCode);
};

export default errorMiddleware;
