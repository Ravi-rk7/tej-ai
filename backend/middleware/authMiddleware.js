import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const AuthHeaderSchema = z
    .string()
    .min(8)
    .regex(/^Bearer\s+.+$/, 'Missing or invalid authorization header');

/**
 * Verify Supabase JWT and attach user info to request
 */
export const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = AuthHeaderSchema.parse(req.headers.authorization);

        const token = authHeader.slice(7);

        // Verify token with Supabase
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) {
            logger.warn(`Auth failed: ${error?.message || 'Invalid token'}`);
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
        logger.error('Auth middleware error', err);
        return errorResponse(res, 'Unauthorized', 401);
    }
};

export default authMiddleware;
