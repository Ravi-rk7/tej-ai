import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';

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

const SCAN_TABLE = 'skin_analysis';
const DEFAULT_PROVIDER = 'ailabtools';
const DEFAULT_PROVIDER_VERSION = 'skin-analysis-pro-v1.7.1';
const SCAN_SELECT = 'id, user_id, image_url, image_retained, glow_score, skin_type, concerns, routine, metrics, provider, provider_version, created_at, updated_at';
const RESULT_SELECT = 'id, glow_score, skin_type, concerns, routine, metrics, created_at';
const DASHBOARD_SCAN_SELECT = 'id, created_at, glow_score, skin_type, concerns';
const HISTORY_SCAN_SELECT = DASHBOARD_SCAN_SELECT;

const buildDbError = (publicMessage, statusCode = 500, details) => {
    const error = new Error(publicMessage);
    error.publicMessage = publicMessage;
    error.statusCode = statusCode;
    if (details) {
        error.details = details;
    }
    return error;
};

export const buildScanPayload = (data) => ({
    user_id: data.user_id,
    image_url: null,
    image_retained: false,
    glow_score: data.glow_score,
    skin_type: data.skin_type ?? null,
    concerns: data.concerns ?? [],
    routine: data.routine ?? {},
    metrics: data.metrics ?? {},
    raw_api_response: null,
    provider: data.provider ?? DEFAULT_PROVIDER,
    provider_version: data.provider_version ?? DEFAULT_PROVIDER_VERSION,
});

/**
 * Writes one sanitized scan to skin_analysis with the server-side service role key.
 */
export const saveScan = async (data) => {
    try {
        const payload = buildScanPayload(data);

        const { data: savedRow, error } = await getSupabase()
                .from(SCAN_TABLE)
                .insert(payload)
                .select(SCAN_SELECT)
                .single();

        if (error) {
            throw buildDbError('Failed to save scan', 503, error.message);
        }

        return savedRow;
    } catch (error) {
        if (error.publicMessage) {
            throw error;
        }
        throw buildDbError('Failed to save scan', 503, error.message);
    }
};

/**
 * 2. getUserScans(user_id)
 * Returns latest-first scan list for the provided user.
 */
export const getUserScans = async (user_id) => {
    try {
        const { data, error } = await getSupabase()
                .from(SCAN_TABLE)
                .select(SCAN_SELECT)
                .eq('user_id', user_id)
                .order('created_at', { ascending: false });

        if (error) {
            throw buildDbError('Failed to fetch scans', 503, error.message);
        }

        return data || [];
    } catch (error) {
        if (error.publicMessage) {
            throw error;
        }
        throw buildDbError('Failed to fetch scans', 503, error.message);
    }
};

/**
 * 3. getLastScan(user_id)
 * Returns most recent scan or null when no rows exist.
 */
export const getLastScan = async (user_id) => {
    try {
        const { data, error } = await getSupabase()
                .from(SCAN_TABLE)
                .select(SCAN_SELECT)
                .eq('user_id', user_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

        if (error) {
            throw buildDbError('Failed to fetch latest scan', 503, error.message);
        }

        return data || null;
    } catch (error) {
        if (error.publicMessage) {
            throw error;
        }
        throw buildDbError('Failed to fetch latest scan', 503, error.message);
    }
};

/**
 * Save skin analysis result to Supabase
 */
export const saveSkinAnalysis = async (userId, {
    glowScore,
    skinType,
    concerns,
    routine,
    metrics,
    provider,
    providerVersion,
}) => {
    return saveScan({
        user_id: userId,
        glow_score: glowScore,
        skin_type: skinType,
        concerns,
        routine,
        metrics,
        provider: provider?.name || provider,
        provider_version: provider?.version || providerVersion,
    });
};

export const getDashboardSubscription = async (userId) => {
    try {
        const { data, error } = await getSupabase()
            .from('subscriptions')
            .select('plan, status, current_period_end, cancel_at_period_end, dodo_customer_id')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) throw buildDbError('Failed to fetch dashboard subscription', 503, error.message);
        return data || null;
    } catch (error) {
        if (error.publicMessage) throw error;
        throw buildDbError('Failed to fetch dashboard subscription', 503, error.message);
    }
};

/**
 * Fetch billing status for one authenticated owner without exposing provider IDs.
 * The service-role client bypasses RLS, so the owner predicate is mandatory.
 */
export const getBillingSubscription = async (userId) => {
    try {
        const { data, error } = await getSupabase()
            .from('subscriptions')
            .select('plan, status, current_period_end, cancel_at_period_end, dodo_customer_id, updated_at')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            throw buildDbError('Failed to fetch billing subscription', 503, error.message);
        }

        return data || null;
    } catch (error) {
        if (error.publicMessage) throw error;
        throw buildDbError('Failed to fetch billing subscription', 503, error.message);
    }
};

export const countUserScansSince = async (userId, monthStartIso) => {
    try {
        const { count, error } = await getSupabase()
            .from(SCAN_TABLE)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('created_at', monthStartIso);

        if (error) throw buildDbError('Failed to count scans', 503, error.message);
        return count || 0;
    } catch (error) {
        if (error.publicMessage) throw error;
        throw buildDbError('Failed to count scans', 503, error.message);
    }
};

export const getDashboardScans = async (userId, limit = 12) => {
    try {
        const { data, error } = await getSupabase()
            .from(SCAN_TABLE)
            .select(DASHBOARD_SCAN_SELECT)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(limit);

        if (error) throw buildDbError('Failed to fetch dashboard scans', 503, error.message);
        return data || [];
    } catch (error) {
        if (error.publicMessage) throw error;
        throw buildDbError('Failed to fetch dashboard scans', 503, error.message);
    }
};

export const getUserHistoryPage = async (userId, { limit = 12, cursor } = {}) => {
    try {
        let query = getSupabase()
            .from(SCAN_TABLE)
            .select(HISTORY_SCAN_SELECT)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });

        if (cursor) {
            query = query.or(
                `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.scanId})`
            );
        }

        const { data, error } = await query.limit(limit + 1);
        if (error) throw buildDbError('Failed to fetch history', 503, error.message);
        return data || [];
    } catch (error) {
        if (error.publicMessage) throw error;
        throw buildDbError('Failed to fetch history', 503, error.message);
    }
};

/**
 * Get user's scan history
 */
export const getUserScanHistory = async (userId) => {
    return getUserScans(userId);
};

/**
 * Get user's latest scan
 */
export const getLatestScan = async (userId) => {
    return getLastScan(userId);
};

/**
 * Fetch one result only when it belongs to the authenticated user.
 * The service-role client bypasses RLS, so both predicates are required.
 */
export const getUserScanById = async (userId, scanId) => {
    try {
        const { data, error } = await getSupabase()
            .from(SCAN_TABLE)
            .select(RESULT_SELECT)
            .eq('id', scanId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            throw buildDbError('Failed to fetch scan result', 503, error.message);
        }

        return data || null;
    } catch (error) {
        if (error.publicMessage) throw error;
        throw buildDbError('Failed to fetch scan result', 503, error.message);
    }
};

/**
 * Get user's previous scan (for trend calculation)
 */
export const getPreviousScan = async (userId) => {
    try {
        const { data, error } = await getSupabase()
                .from(SCAN_TABLE)
                .select('glow_score, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(2);

        if (error) {
            throw buildDbError('Failed to fetch previous scan', 503, error.message);
        }

        return data?.[1] || null;
    } catch (error) {
        if (error.publicMessage) {
            throw error;
        }
        throw buildDbError('Failed to fetch previous scan', 503, error.message);
    }
};

/**
 * Get user's subscription info
 */
export const getUserSubscription = async (userId) => {
    return getBillingSubscription(userId);
};

/**
 * Upsert subscription row based on Dodo webhook events.
 */
export const upsertSubscription = async (userId, subscriptionData) => {
    const { data, error } = await getSupabase()
        .from('subscriptions')
        .upsert(
            {
                user_id: userId,
                ...subscriptionData,
            },
            {
                onConflict: 'user_id',
            }
        )
        .select()
        .single();

    if (error) throw error;
    return data;
};

export default {
    saveScan,
    buildScanPayload,
    getUserScans,
    getLastScan,
    saveSkinAnalysis,
    getUserScanHistory,
    getLatestScan,
    getUserScanById,
    getDashboardSubscription,
    getBillingSubscription,
    countUserScansSince,
    getDashboardScans,
    getUserHistoryPage,
    getPreviousScan,
    getUserSubscription,
    upsertSubscription,
};
