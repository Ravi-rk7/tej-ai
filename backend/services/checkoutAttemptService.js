import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import env from '../config/env.js';

const CHECKOUT_ATTEMPT_TABLE = 'billing_checkout_attempts';
const CLAIM_CHECKOUT_ATTEMPT_RPC = 'claim_billing_checkout_attempt';
const CHECKOUT_ATTEMPT_SELECT = [
    'id',
    'user_id',
    'plan',
    'idempotency_key_hash',
    'state',
    'provider_session_id',
    'checkout_url',
    'failure_code',
    'expires_at',
    'created_at',
    'updated_at',
].join(', ');

export const CHECKOUT_ATTEMPT_STATES = Object.freeze({
    CREATING: 'creating',
    READY: 'ready',
    FAILED: 'failed',
    AMBIGUOUS: 'ambiguous',
    EXPIRED: 'expired',
});

export const CHECKOUT_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

const AttemptRowSchema = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    plan: z.enum(['starter', 'growth', 'pro']),
    idempotency_key_hash: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum(Object.values(CHECKOUT_ATTEMPT_STATES)),
    provider_session_id: z.string().nullable(),
    checkout_url: z.string().nullable(),
    failure_code: z.string().nullable(),
    expires_at: z.string().datetime({ offset: true }),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    claimed: z.boolean().optional(),
});

export class CheckoutAttemptStoreError extends Error {
    constructor(message = 'Billing storage is unavailable', details) {
        super(message);
        this.name = 'CheckoutAttemptStoreError';
        this.code = 'CHECKOUT_ATTEMPT_STORE_ERROR';
        this.publicCode = 'BILLING_UNAVAILABLE';
        this.publicMessage = 'Billing is temporarily unavailable';
        this.statusCode = 503;
        if (details) this.details = details;
    }
}

export const hashIdempotencyKey = (idempotencyKey) => crypto
    .createHash('sha256')
    .update(idempotencyKey, 'utf8')
    .digest('hex');

const normalizeAttempt = (row) => {
    const parsed = AttemptRowSchema.parse(row);
    return {
        id: parsed.id,
        userId: parsed.user_id,
        plan: parsed.plan,
        idempotencyKeyHash: parsed.idempotency_key_hash,
        state: parsed.state,
        providerSessionId: parsed.provider_session_id,
        checkoutUrl: parsed.checkout_url,
        failureCode: parsed.failure_code,
        expiresAt: parsed.expires_at,
        createdAt: parsed.created_at,
        updatedAt: parsed.updated_at,
    };
};

const wrapStoreError = (error) => {
    if (error instanceof CheckoutAttemptStoreError) return error;
    return new CheckoutAttemptStoreError(undefined, error?.message);
};

export const createCheckoutAttemptRepository = ({ databaseClient } = {}) => {
    let client = databaseClient;

    const getDatabase = () => {
        if (client) return client;
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new CheckoutAttemptStoreError('Supabase server credentials are not configured');
        }

        client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return client;
    };

    const claim = async ({ userId, plan, idempotencyKeyHash, expiresAt }) => {
        try {
            const { data, error } = await getDatabase().rpc(CLAIM_CHECKOUT_ATTEMPT_RPC, {
                p_user_id: userId,
                p_plan: plan,
                p_idempotency_key_hash: idempotencyKeyHash,
                p_expires_at: expiresAt,
            });

            if (error) throw new CheckoutAttemptStoreError(undefined, error.message);
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) throw new CheckoutAttemptStoreError('Checkout claim returned no row');

            return {
                attempt: normalizeAttempt(row),
                claimed: AttemptRowSchema.parse(row).claimed === true,
            };
        } catch (error) {
            throw wrapStoreError(error);
        }
    };

    const updateAttempt = async (attemptId, values, allowedStates = [CHECKOUT_ATTEMPT_STATES.CREATING]) => {
        try {
            const { data, error } = await getDatabase()
                .from(CHECKOUT_ATTEMPT_TABLE)
                .update(values)
                .eq('id', attemptId)
                .in('state', allowedStates)
                .select(CHECKOUT_ATTEMPT_SELECT)
                .maybeSingle();

            if (error) throw new CheckoutAttemptStoreError(undefined, error.message);
            if (!data) throw new CheckoutAttemptStoreError('Checkout attempt state changed unexpectedly');
            return normalizeAttempt(data);
        } catch (error) {
            throw wrapStoreError(error);
        }
    };

    return Object.freeze({
        claim,
        markReady(attemptId, { providerSessionId, checkoutUrl }) {
            return updateAttempt(attemptId, {
                state: CHECKOUT_ATTEMPT_STATES.READY,
                provider_session_id: providerSessionId,
                checkout_url: checkoutUrl,
                failure_code: null,
            });
        },
        markFailed(attemptId, failureCode) {
            return updateAttempt(attemptId, {
                state: CHECKOUT_ATTEMPT_STATES.FAILED,
                failure_code: failureCode,
            });
        },
        markAmbiguous(attemptId, failureCode) {
            return updateAttempt(attemptId, {
                state: CHECKOUT_ATTEMPT_STATES.AMBIGUOUS,
                failure_code: failureCode,
            });
        },
        markExpired(attemptId) {
            return updateAttempt(attemptId, {
                state: CHECKOUT_ATTEMPT_STATES.EXPIRED,
                provider_session_id: null,
                checkout_url: null,
                failure_code: 'CHECKOUT_ATTEMPT_EXPIRED',
            }, [CHECKOUT_ATTEMPT_STATES.CREATING, CHECKOUT_ATTEMPT_STATES.READY]);
        },
    });
};

export default createCheckoutAttemptRepository;
