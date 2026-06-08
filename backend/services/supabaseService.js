import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required on the server');
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SCAN_REFERENCE_BUCKET = env.SUPABASE_STORAGE_BUCKET;
const PRIMARY_SCAN_TABLE = 'SkinAnalysis';
const FALLBACK_SCAN_TABLE = 'skin_analysis';

const buildDbError = (publicMessage, statusCode = 500, details) => {
    const error = new Error(publicMessage);
    error.publicMessage = publicMessage;
    error.statusCode = statusCode;
    if (details) {
        error.details = details;
    }
    return error;
};

const isRelationMissingError = (error) =>
    error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '');

const runWithScanTableFallback = async (executor) => {
    const primaryResult = await executor(PRIMARY_SCAN_TABLE);
    if (!primaryResult.error || !isRelationMissingError(primaryResult.error)) {
        return primaryResult;
    }
    return executor(FALLBACK_SCAN_TABLE);
};

/**
 * 1. saveScan(data)
 * Writes to SkinAnalysis table with server-side service role key.
 */
export const saveScan = async (data) => {
    try {
        const payload = {
            user_id: data.user_id,
            image_url: data.image_url,
            glow_score: data.glow_score,
            concerns: data.concerns ?? [],
            routine: data.routine ?? {},
        };

        const { data: savedRow, error } = await runWithScanTableFallback((tableName) =>
            supabase
                .from(tableName)
                .insert(payload)
                .select('id, user_id, image_url, glow_score, concerns, routine, created_at')
                .single()
        );

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
        const { data, error } = await runWithScanTableFallback((tableName) =>
            supabase
                .from(tableName)
                .select('id, user_id, image_url, glow_score, concerns, routine, created_at')
                .eq('user_id', user_id)
                .order('created_at', { ascending: false })
        );

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
        const { data, error } = await runWithScanTableFallback((tableName) =>
            supabase
                .from(tableName)
                .select('id, user_id, image_url, glow_score, concerns, routine, created_at')
                .eq('user_id', user_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
        );

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
    imageUrl,
    cloudinaryPublicId,
    glowScore,
    skinType,
    concerns,
    routine,
    rawApiResponse,
    faceMaps,
}) => {
    const saved = await saveScan({
        user_id: userId,
        image_url: imageUrl,
        glow_score: glowScore,
        concerns,
        routine,
    });

    return {
        ...saved,
        cloudinary_public_id: cloudinaryPublicId,
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
        const { data, error } = await runWithScanTableFallback((tableName) =>
            supabase
                .from(tableName)
                .select('glow_score, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(2)
        );

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
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
};

/**
 * Persist Cloudinary URL as a small JSON blob in Supabase Storage for durable record-keeping.
 */
export const saveImageReferenceToStorage = async (userId, scanId, imageUrl) => {
    const objectPath = `${userId}/${scanId}.json`;
    const payload = JSON.stringify({
        scanId,
        imageUrl,
        savedAt: new Date().toISOString(),
    });

    const { error } = await supabase.storage
        .from(SCAN_REFERENCE_BUCKET)
        .upload(objectPath, payload, {
            contentType: 'application/json',
            upsert: true,
        });

    if (error) throw error;
    return objectPath;
};

/**
 * Upsert subscription row based on Dodo webhook events.
 */
export const upsertSubscription = async (userId, subscriptionData) => {
    const { data, error } = await supabase
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
    saveImageReferenceToStorage,
    upsertSubscription,
};
