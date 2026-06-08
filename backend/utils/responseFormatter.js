/**
 * Format success response
 */
export const successResponse = (res, data, statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        data,
    });
};

/**
 * Format error response
 */
export const errorResponse = (res, error, statusCode = 500) => {
    return res.status(statusCode).json({
        success: false,
        error,
    });
};

/**
 * Async handler wrapper for cleaner error handling
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
