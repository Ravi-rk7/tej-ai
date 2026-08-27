import { errorResponse } from '../utils/responseFormatter.js';

const QUERY_ALLOWLIST = new Map([
    ['/api/history', new Set(['limit', 'cursor'])],
    // Provider-controlled callback query values are deliberately discarded by
    // fixed redirects and never influence application state.
    ['/api/billing/return', null],
    ['/api/billing/cancel', null],
]);

const hasRequestBody = (req) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    return contentLength > 0 || Boolean(req.headers['transfer-encoding']);
};

export const requestShapeMiddleware = (req, res, next) => {
    const allowedQuery = QUERY_ALLOWLIST.has(req.path)
        ? QUERY_ALLOWLIST.get(req.path)
        : new Set();
    if (allowedQuery !== null) {
        const unexpectedKey = Object.keys(req.query || {}).find(
            (key) => !allowedQuery.has(key)
        );
        if (unexpectedKey) {
            return errorResponse(
                res,
                'Unexpected query parameter',
                400,
                'UNEXPECTED_QUERY_PARAMETER'
            );
        }
    }

    if (!hasRequestBody(req)) return next();

    const expectedType = req.path === '/api/scan'
        ? 'multipart/form-data'
        : 'application/json';
    if (!req.is(expectedType)) {
        return errorResponse(
            res,
            'Unsupported content type',
            415,
            'UNSUPPORTED_CONTENT_TYPE'
        );
    }

    return next();
};

export default requestShapeMiddleware;
