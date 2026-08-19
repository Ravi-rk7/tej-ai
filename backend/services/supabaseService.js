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

const buildDbError = (publicMessage, statusCode = 500, details) => {
    const error = new Error(publicMessage);
    error.publicMessage = publicMessage;
    error.statusCode = statusCode;
    if (details) {
        error.details = details;
    }
    return error;
};

/**
 * 1. saveScan(data)
 * Writes to skin_analysis with the server-side service role key.
 */
export const saveScan = async (data) => {
    try {
        const payload = {
            user_id: data.user_id,
            image_url: null,
            image_retained: false,
            glow_score: data.glow_score,
            concerns: data.concerns ?? [],
            routine: data.routine ?? {},
        };

        const { data: savedRow, error } = await getSupabase()
                .from(SCAN_TABLE)
                .insert(payload)
                .select('id, user_id, image_url, glow_score, concerns, routine, created_at')
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
                .select('id, user_id, image_url, glow_score, concerns, routine, created_at')
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
                .select('id, user_id, image_url, glow_score, concerns, routine, created_at')
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
    rawApiResponse,
    faceMaps,
}) => {
    const saved = await saveScan({
        user_id: userId,
        glow_score: glowScore,
        concerns,
        routine,
    });

    return {
        ...saved,
        skin_type: skinType,
        raw_api_response: rawApiResponse,
        face_maps: faceMaps,
    };
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
    const { data, error } = await getSupabase()
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
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
    getUserScans,
    getLastScan,
    saveSkinAnalysis,
    getUserScanHistory,
    getLatestScan,
    getPreviousScan,
    getUserSubscription,
    upsertSubscription,
};
