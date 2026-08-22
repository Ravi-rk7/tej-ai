import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';
import { countUserScansSince, getDashboardSubscription } from '../services/supabaseService.js';
import { monthWindow, resolveEntitlement } from '../services/entitlementService.js';

/**
 * Check if user has reached their scan limit for the current month
 */
export const scanLimitMiddleware = async (req, res, next) => {
    try {
        if (!req.user) {
            return next();
        }

        // Get user's subscription
        const subscription = await getDashboardSubscription(req.user.id);
        const { plan, limit } = resolveEntitlement(subscription);

        // Count scans in current calendar month (UTC)
        const { start: monthStartIso } = monthWindow();
        const scansThisMonth = await countUserScansSince(req.user.id, monthStartIso);

        if (scansThisMonth >= limit) {
            logger.warn(`Scan limit reached for user ${req.user.id} (${scansThisMonth}/${limit})`);
            return errorResponse(res, 'Scan limit reached', 403, 'SCAN_LIMIT_REACHED');
        }

        // Attach info to request for logging
        req.scanInfo = { plan, limit, used: scansThisMonth };
        next();
    } catch (err) {
        logger.error('Scan limit middleware error', err);
        return errorResponse(res, 'Unable to verify scan limit', 503, 'SCAN_LIMIT_UNAVAILABLE');
    }
};

export default scanLimitMiddleware;
