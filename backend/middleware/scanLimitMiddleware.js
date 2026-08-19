import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';

let supabase;

const getSupabase = () => {
    if (!supabase) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Supabase server credentials are not configured');
        }
        supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return supabase;
};

const SCAN_LIMITS = {
    free: 1,
    starter: 15,
    growth: 30,
    pro: 50,
};

const SCAN_TABLE = 'skin_analysis';

const countScansThisMonth = async (userId, monthStartIso) => {
    return getSupabase()
        .from(SCAN_TABLE)
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
        const { data: subscription, error: subError } = await getSupabase()
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

        const { count, error: countError } = await countScansThisMonth(
            req.user.id,
            monthStartIso
        );

        if (countError) {
            throw countError;
        }

        const scansThisMonth = count || 0;

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
