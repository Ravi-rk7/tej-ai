import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { getUserHistoryPage } from '../services/supabaseService.js';
import { buildHistoryPage, parseHistoryQuery } from '../services/historyService.js';

export const createHistoryHandler = ({
    loadHistory = getUserHistoryPage,
    historyLogger = logger,
} = {}) => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');

    try {
        const query = parseHistoryQuery(req.query);
        const rows = await loadHistory(req.user.id, query);
        return successResponse(res, buildHistoryPage({ ...query, rows }));
    } catch (error) {
        if (error.statusCode === 400 && error.publicCode) {
            return errorResponse(res, error.publicMessage, 400, error.publicCode);
        }
        historyLogger.error('History error', {
            category: error.category || 'database',
            statusCode: error.statusCode || 503,
        });
        return errorResponse(res, 'Unable to load history', 503, 'HISTORY_FETCH_FAILED');
    }
};

export const getHistory = asyncHandler(createHistoryHandler());

export default { getHistory };
