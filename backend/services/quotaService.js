import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import env from '../config/env.js';

const QuotaStatusSchema = z.object({
    plan: z.string(),
    status: z.string(),
    effective_plan: z.string(),
    quota_limit: z.number().int().positive(),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    window_start: z.string(),
    reset_at: z.string(),
    current_period_end: z.string().nullable(),
    cancel_at_period_end: z.boolean(),
    can_manage_billing: z.boolean(),
});

const ReservationSchema = z.object({
    granted: z.boolean(),
    reservation_id: z.string().uuid().nullable(),
    plan: z.string(),
    status: z.string(),
    effective_plan: z.string(),
    quota_limit: z.number().int().positive(),
    used: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    window_start: z.string(),
    reset_at: z.string(),
});

const RefundSchema = z.object({
    refunded: z.boolean(),
    state: z.string().nullable(),
});

const ScanSchema = z.object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    image_url: z.nullable(z.string()),
    image_retained: z.boolean(),
    glow_score: z.number().int().min(0).max(100),
    skin_type: z.string().nullable(),
    concerns: z.array(z.unknown()),
    routine: z.record(z.unknown()),
    metrics: z.record(z.unknown()),
    provider: z.string(),
    provider_version: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
});

export class QuotaStoreError extends Error {
    constructor(message = 'Quota storage is unavailable', details) {
        super(message);
        this.name = 'QuotaStoreError';
        this.publicMessage = 'Unable to verify scan allowance';
        this.publicCode = 'SCAN_LIMIT_UNAVAILABLE';
        this.statusCode = 503;
        if (details) this.details = details;
    }
}

const unwrap = (data) => Array.isArray(data) ? data[0] : data;

const normalizeStatus = (row) => {
    const parsed = QuotaStatusSchema.parse(row);
    return {
        plan: parsed.plan,
        status: parsed.status,
        effectivePlan: parsed.effective_plan,
        limit: parsed.quota_limit,
        used: parsed.used,
        remaining: parsed.remaining,
        reserved: parsed.reserved,
        windowStart: parsed.window_start,
        resetAt: parsed.reset_at,
        currentPeriodEnd: parsed.current_period_end,
        cancelAtPeriodEnd: parsed.cancel_at_period_end,
        canManageBilling: parsed.can_manage_billing,
    };
};

const normalizeReservation = (row) => {
    const parsed = ReservationSchema.parse(row);
    return {
        granted: parsed.granted,
        reservationId: parsed.reservation_id,
        plan: parsed.plan,
        status: parsed.status,
        effectivePlan: parsed.effective_plan,
        limit: parsed.quota_limit,
        used: parsed.used,
        remaining: parsed.remaining,
        reserved: parsed.reserved,
        windowStart: parsed.window_start,
        resetAt: parsed.reset_at,
    };
};

export const createQuotaRepository = ({ databaseClient } = {}) => {
    let client = databaseClient;

    const getDatabase = () => {
        if (client) return client;
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new QuotaStoreError('Supabase server credentials are not configured');
        }
        client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return client;
    };

    const call = async (name, args, schema) => {
        try {
            const { data, error } = await getDatabase().rpc(name, args);
            if (error) throw new QuotaStoreError(undefined, error.message);
            return schema.parse(unwrap(data));
        } catch (error) {
            if (error instanceof QuotaStoreError) throw error;
            if (error instanceof z.ZodError) throw new QuotaStoreError('Invalid quota response', error.message);
            throw new QuotaStoreError(undefined, error?.message);
        }
    };

    return Object.freeze({
        getStatus: async (userId) => normalizeStatus(await call(
            'get_scan_quota_status',
            { p_user_id: userId },
            QuotaStatusSchema
        )),
        reserve: async (userId) => normalizeReservation(await call(
            'reserve_scan_quota',
            { p_user_id: userId },
            ReservationSchema
        )),
        refund: async (userId, reservationId, failureCode) => {
            const row = await call(
                'refund_scan_quota',
                {
                    p_user_id: userId,
                    p_reservation_id: reservationId,
                    p_failure_code: failureCode,
                },
                RefundSchema
            );
            return RefundSchema.parse(row);
        },
        persist: async (userId, reservationId, payload) => {
            const row = await call(
                'persist_scan_and_consume_quota',
                {
                    p_user_id: userId,
                    p_reservation_id: reservationId,
                    p_glow_score: payload.glowScore,
                    p_skin_type: payload.skinType ?? null,
                    p_concerns: payload.concerns,
                    p_routine: payload.routine,
                    p_metrics: payload.metrics,
                    p_provider: payload.provider,
                    p_provider_version: payload.providerVersion,
                },
                ScanSchema
            );
            return row;
        },
    });
};

const defaultQuotaRepository = createQuotaRepository();

export const getScanQuotaStatus = (userId) => defaultQuotaRepository.getStatus(userId);
export const reserveScanQuota = (userId) => defaultQuotaRepository.reserve(userId);
export const refundScanQuota = (userId, reservationId, failureCode) => defaultQuotaRepository.refund(userId, reservationId, failureCode);
export const persistScanAndConsumeQuota = (userId, reservationId, payload) => defaultQuotaRepository.persist(userId, reservationId, payload);

export default {
    QuotaStoreError,
    createQuotaRepository,
    getScanQuotaStatus,
    reserveScanQuota,
    refundScanQuota,
    persistScanAndConsumeQuota,
};
