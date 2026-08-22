import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { countUserScansSince, getDashboardScans, getDashboardSubscription } from '../services/supabaseService.js';
import { buildDashboardSummary } from '../services/dashboardService.js';
import { monthWindow } from '../services/entitlementService.js';

export const createDashboardHandler = ({
    loadSubscription = getDashboardSubscription,
    loadCount = countUserScansSince,
    loadScans = getDashboardScans,
    now = () => new Date(),
    dashboardLogger = logger,
} = {}) => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const currentTime = now();
    const { start } = monthWindow(currentTime);

    try {
        const [subscription, scanCount, scans] = await Promise.all([
            loadSubscription(req.user.id),
            loadCount(req.user.id, start),
            loadScans(req.user.id, 12),
        ]);

        return successResponse(res, buildDashboardSummary({
            subscription,
            scanCount,
            scans,
            now: currentTime,
        }));
    } catch (error) {
        dashboardLogger.error('Dashboard summary failed', {
            category: error.category || 'database',
            statusCode: error.statusCode || 503,
        });
        return errorResponse(res, 'Unable to load dashboard summary', 503, 'DASHBOARD_FETCH_FAILED');
    }
};

export const getDashboard = asyncHandler(createDashboardHandler());

export default { getDashboard };
