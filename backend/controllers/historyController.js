import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { getUserScanHistory } from '../services/supabaseService.js';

/**
 * GET /api/history
 * Fetch user's scan history
 */
export const getHistory = asyncHandler(async (req, res) => {
    try {
        logger.info('History request', { userId: req.user.id });

        const scanHistory = await getUserScanHistory(req.user.id);

        const history = scanHistory.map((scan) => ({
            date: scan.created_at,
            glowScore: scan.glow_score,
            concerns: scan.concerns,
        }));

        logger.info('History retrieved', { userId: req.user.id, count: scanHistory.length });

        return successResponse(res, history);
    } catch (error) {
        logger.error('History error', { userId: req.user.id, message: error.message });
        return errorResponse(res, 'Failed to fetch history', 500);
    }
});

export default { getHistory };
