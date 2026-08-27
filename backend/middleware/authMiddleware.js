import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
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

const AuthHeaderSchema = z
    .string()
    .min(8)
    .max(4096)
    .regex(/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'Missing or invalid authorization header');

/**
 * Verify Supabase JWT and attach user info to request
 */
export const createAuthMiddleware = ({
    getUser = (token) => getSupabase().auth.getUser(token),
    authLogger = logger,
} = {}) => async (req, res, next) => {
    try {
        const authHeader = AuthHeaderSchema.parse(req.headers.authorization);

        const token = authHeader.slice(7);

        // Verify token with Supabase
        const { data, error } = await getUser(token);
        if (error || !data.user) {
            authLogger.warn('Authentication rejected', {
                requestId: req.requestId,
                code: 'AUTH_TOKEN_REJECTED',
            });
            return errorResponse(res, 'Unauthorized', 401);
        }

        // Attach user to request
        req.user = {
            id: data.user.id,
            email: data.user.email,
        };

        next();
    } catch (err) {
        if (err instanceof z.ZodError) {
            return errorResponse(res, 'Unauthorized', 401);
        }
        authLogger.error('Authentication unavailable', {
            requestId: req.requestId,
            code: 'AUTH_VERIFICATION_FAILED',
            errorType: err?.name || 'Error',
        });
        return errorResponse(res, 'Unauthorized', 401);
    }
};

export const authMiddleware = createAuthMiddleware();

export default authMiddleware;
