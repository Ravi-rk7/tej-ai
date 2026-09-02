import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import env from '../config/env.js';

const READY = 'ready';
const UNAVAILABLE = 'unavailable';

const withTimeout = async (operation, timeoutMs) => {
    let timeoutId;
    try {
        return await Promise.race([
            Promise.resolve().then(operation),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('readiness_timeout')), timeoutMs);
            }),
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
};

export const createDefaultReadinessProbes = ({ runtimeEnv = env } = {}) => {
    let databaseClient;
    let redisClient;

    const database = async () => {
        if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('database_not_configured');
        }
        if (!databaseClient) {
            databaseClient = createClient(
                runtimeEnv.SUPABASE_URL,
                runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
                { auth: { persistSession: false, autoRefreshToken: false } }
            );
        }
        const { data, error } = await databaseClient.rpc('ops_readiness_probe');
        if (error || data !== true) throw new Error('database_unavailable');
        return true;
    };

    const rateLimitStore = async () => {
        if (!runtimeEnv.UPSTASH_REDIS_REST_URL || !runtimeEnv.UPSTASH_REDIS_REST_TOKEN) {
            throw new Error('rate_limit_store_not_configured');
        }
        if (!redisClient) {
            redisClient = new Redis({
                url: runtimeEnv.UPSTASH_REDIS_REST_URL,
                token: runtimeEnv.UPSTASH_REDIS_REST_TOKEN,
            });
        }
        const result = await redisClient.ping();
        if (String(result).toUpperCase() !== 'PONG') throw new Error('rate_limit_store_unavailable');
        return true;
    };

    return Object.freeze({ database, rateLimitStore });
};

export const createReadinessChecker = ({
    probes = createDefaultReadinessProbes(),
    timeoutMs = env.READINESS_TIMEOUT_MS,
    cacheMs = env.READINESS_CACHE_MS,
    now = () => Date.now(),
} = {}) => {
    let cachedResult = null;
    let cacheExpiresAt = 0;
    let inFlight = null;

    const run = async () => {
        const entries = await Promise.all(
            Object.entries(probes).map(async ([name, probe]) => {
                try {
                    await withTimeout(probe, timeoutMs);
                    return [name, READY];
                } catch {
                    return [name, UNAVAILABLE];
                }
            })
        );
        const checks = Object.fromEntries(entries);
        return {
            ready: Object.values(checks).every((value) => value === READY),
            checks,
        };
    };

    return async () => {
        const currentTime = now();
        if (cachedResult?.ready && currentTime < cacheExpiresAt) return cachedResult;
        if (inFlight) return inFlight;

        inFlight = run();
        try {
            const result = await inFlight;
            if (result.ready && cacheMs > 0) {
                cachedResult = result;
                cacheExpiresAt = now() + cacheMs;
            }
            return result;
        } finally {
            inFlight = null;
        }
    };
};

export const checkReadiness = createReadinessChecker();

export default { createDefaultReadinessProbes, createReadinessChecker, checkReadiness };
