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

const RESULT_SELECT = 'id, glow_score, skin_type, concerns, routine, metrics, provider, provider_version, created_at';

const DASHBOARD_SCAN_SELECT = RESULT_SELECT;

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
