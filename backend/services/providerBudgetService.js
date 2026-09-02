import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import env from '../config/env.js';

export const PROVIDERS = Object.freeze(['ailabtools', 'openai']);

const ReservationSchema = z.object({
    granted: z.boolean(),
    reservation_id: z.string().uuid().nullable(),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    reset_at: z.string(),
});

const FinalizationSchema = z.object({
    finalized: z.boolean(),
    state: z.string().nullable(),
});

const UsageSummarySchema = z.object({
    provider: z.enum(PROVIDERS),
    attempted: z.coerce.number().int().nonnegative(),
    succeeded: z.coerce.number().int().nonnegative(),
    failed: z.coerce.number().int().nonnegative(),
    pending: z.coerce.number().int().nonnegative(),
    input_units: z.coerce.number().int().nonnegative(),
    output_units: z.coerce.number().int().nonnegative(),
    estimated_cost_micros: z.coerce.number().int().nonnegative(),
});

const CleanupCountSchema = z.coerce.number().int().nonnegative();

const unwrap = (data) => Array.isArray(data) ? data[0] : data;

export class ProviderBudgetError extends Error {
    constructor(message = 'Provider budget storage is unavailable', {
        publicCode = 'PROVIDER_BUDGET_UNAVAILABLE',
        publicMessage = 'Scan capacity is temporarily unavailable',
        resetAt = null,
        details,
    } = {}) {
        super(message);
        this.name = 'ProviderBudgetError';
        this.publicCode = publicCode;
        this.publicMessage = publicMessage;
        this.statusCode = 503;
        this.resetAt = resetAt;
        if (details) this.details = details;
    }
}

const normalizeReservation = (row) => {
    const parsed = ReservationSchema.parse(row);
    return {
        granted: parsed.granted,
        reservationId: parsed.reservation_id,
        used: parsed.used,
        remaining: parsed.remaining,
        resetAt: parsed.reset_at,
    };
};

const normalizeSummary = (row) => {
    const parsed = UsageSummarySchema.parse(row);
    return {
        provider: parsed.provider,
        attempted: parsed.attempted,
        succeeded: parsed.succeeded,
        failed: parsed.failed,
        pending: parsed.pending,
        inputUnits: parsed.input_units,
        outputUnits: parsed.output_units,
        estimatedCostMicros: parsed.estimated_cost_micros,
    };
};

export const createProviderBudgetRepository = ({ databaseClient } = {}) => {
    let client = databaseClient;

    const getDatabase = () => {
        if (client) return client;
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new ProviderBudgetError('Supabase server credentials are not configured');
        }
        client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return client;
    };

    const call = async (name, args) => {
        try {
            const { data, error } = await getDatabase().rpc(name, args);
            if (error) throw new ProviderBudgetError(undefined, { details: error.message });
            return data;
        } catch (error) {
            if (error instanceof ProviderBudgetError) throw error;
            if (error instanceof z.ZodError) {
                throw new ProviderBudgetError('Invalid provider budget response', {
                    details: error.message,
                });
            }
            throw new ProviderBudgetError(undefined, { details: error?.message });
        }
    };

    return Object.freeze({
        reserve: async (provider, dailyLimit) => normalizeReservation(unwrap(await call(
            'reserve_provider_call_budget',
            { p_provider: provider, p_daily_limit: dailyLimit }
        ))),
        finalize: async (reservationId, {
            state,
            outcome,
            inputUnits = 0,
            outputUnits = 0,
            estimatedCostMicros = 0,
        }) => FinalizationSchema.parse(unwrap(await call(
            'finalize_provider_call',
            {
                p_reservation_id: reservationId,
                p_state: state,
                p_outcome: outcome,
                p_input_units: inputUnits,
                p_output_units: outputUnits,
                p_estimated_cost_micros: estimatedCostMicros,
            }
        ))),
        getSummary: async (usageDate) => {
            const rows = await call('get_provider_usage_summary', {
                p_usage_date: usageDate,
            });
            return z.array(UsageSummarySchema).parse(rows || []).map(normalizeSummary);
        },
        cleanup: async (beforeDate) => CleanupCountSchema.parse(unwrap(await call(
            'cleanup_provider_call_reservations',
            { p_before: beforeDate }
        ))),
    });
};

const defaultRepository = createProviderBudgetRepository();

const limitFor = (provider, runtimeEnv = env) => {
    if (provider === 'ailabtools') return runtimeEnv.AILAB_DAILY_CALL_LIMIT;
    if (provider === 'openai') return runtimeEnv.OPENAI_DAILY_CALL_LIMIT;
    return 0;
};

export const createProviderBudgetService = ({
    repository = defaultRepository,
    runtimeEnv = env,
} = {}) => Object.freeze({
    reserve: async (provider, explicitLimit) => {
        if (!PROVIDERS.includes(provider)) {
            throw new ProviderBudgetError('Unsupported provider');
        }

        const dailyLimit = explicitLimit ?? limitFor(provider, runtimeEnv);
        if (!Number.isInteger(dailyLimit) || dailyLimit <= 0) {
            return {
                granted: true,
                reservationId: null,
                used: 0,
                remaining: 0,
                resetAt: null,
                bypassed: true,
            };
        }

        const reservation = await repository.reserve(provider, dailyLimit);
        if (!reservation.granted || !reservation.reservationId) {
            throw new ProviderBudgetError('Provider daily capacity reached', {
                publicCode: provider === 'ailabtools'
                    ? 'SCAN_CAPACITY_REACHED'
                    : 'ROUTINE_CAPACITY_REACHED',
                publicMessage: provider === 'ailabtools'
                    ? 'Daily scan capacity has been reached. Please try again after the reset.'
                    : 'AI routine capacity has been reached.',
                resetAt: reservation.resetAt,
            });
        }
        return { ...reservation, bypassed: false };
    },
    finalize: async (reservationId, details) => {
        if (!reservationId) return { finalized: false, state: null, bypassed: true };
        return repository.finalize(reservationId, details);
    },
    getSummary: (usageDate) => repository.getSummary(usageDate),
    cleanup: (beforeDate) => repository.cleanup(beforeDate),
});

const defaultService = createProviderBudgetService();

export const reserveProviderCall = (provider, explicitLimit) =>
    defaultService.reserve(provider, explicitLimit);
export const finalizeProviderCall = (reservationId, details) =>
    defaultService.finalize(reservationId, details);
export const getProviderUsageSummary = (usageDate) =>
    defaultService.getSummary(usageDate);
export const cleanupProviderUsage = (beforeDate) =>
    defaultService.cleanup(beforeDate);

export default {
    ProviderBudgetError,
    createProviderBudgetRepository,
    createProviderBudgetService,
    reserveProviderCall,
    finalizeProviderCall,
    getProviderUsageSummary,
    cleanupProviderUsage,
};
