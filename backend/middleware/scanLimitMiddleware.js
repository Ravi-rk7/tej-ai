import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SCAN_LIMITS = {
    free: 1,
    starter: 15,
    growth: 30,
    pro: 50,
};

const PRIMARY_SCAN_TABLE = 'SkinAnalysis';
const FALLBACK_SCAN_TABLE = 'skin_analysis';

const isRelationMissingError = (error) =>
    error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '');

const countScansThisMonth = async (tableName, userId, monthStartIso) => {
    return supabase
        .from(tableName)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', monthStartIso);
};

/**
 * Check if user has reached their scan limit for the current month
 */
export const scanLimitMiddleware = async (req, res, next) => {
    try {
        if (!req.user) {
            return next();
        }

        // Get user's subscription
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('plan, current_period_end')
            .eq('user_id', req.user.id)
            .single();

        if (subError && subError.code !== 'PGRST116') {
            throw subError;
        }

        const rawPlan = String(subscription?.plan || 'free').toLowerCase();
        const plan = ['starter', 'growth', 'pro'].includes(rawPlan) ? rawPlan : 'free';
        const limit = SCAN_LIMITS[plan] || 1;

        // Count scans in current calendar month (UTC)
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const monthStartIso = monthStart.toISOString();

        let { count, error: countError } = await countScansThisMonth(
            PRIMARY_SCAN_TABLE,
            req.user.id,
            monthStartIso
        );

        if (countError && isRelationMissingError(countError)) {
            const fallbackResult = await countScansThisMonth(
                FALLBACK_SCAN_TABLE,
                req.user.id,
                monthStartIso
            );
            count = fallbackResult.count;
            countError = fallbackResult.error;
        }

        if (countError) {
            throw countError;
        }

        const scansThisMonth = count || 0;

        if (scansThisMonth >= limit) {
            logger.warn(`Scan limit reached for user ${req.user.id} (${scansThisMonth}/${limit})`);
            return errorResponse(res, 'Scan limit reached', 403);
        }

        // Attach info to request for logging
        req.scanInfo = { plan, limit, used: scansThisMonth };
        next();
    } catch (err) {
        logger.error('Scan limit middleware error', err);
        return errorResponse(res, 'Unable to verify scan limit', 503);
    }
};

export default scanLimitMiddleware;
