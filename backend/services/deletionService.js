import crypto from 'node:crypto';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { deleteAuthUser, signInWithPassword } from './authService.js';

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['cancelled', 'failed', 'expired']);

const CancelledSubscriptionSchema = z.object({
    subscription_id: z.string().trim().min(1).max(255),
    status: z.literal('cancelled'),
    cancelled_at: z.string().datetime({ offset: true }).nullable().optional(),
}).passthrough();

export class DeletionError extends Error {
    constructor(publicCode, publicMessage, statusCode = 503) {
        super(publicMessage);
        this.name = 'DeletionError';
        this.publicCode = publicCode;
        this.publicMessage = publicMessage;
        this.statusCode = statusCode;
    }
}

const deletionUnavailable = (code = 'DELETION_UNAVAILABLE') => new DeletionError(
    code,
    'Deletion is temporarily unavailable',
    503
);

const normalizeRpcRow = (data) => Array.isArray(data) ? data[0] : data;

const requireAuditSecret = (runtimeEnv) => {
    const secret = String(runtimeEnv.DELETION_AUDIT_HMAC_SECRET || '');
    if (secret.length < 32) throw deletionUnavailable('DELETION_CONFIGURATION_ERROR');
    return secret;
};

export const hashDeletionReference = (value, secret) => crypto
    .createHmac('sha256', secret)
    .update(String(value), 'utf8')
    .digest('hex');

const getPurgeAfter = (runtimeEnv, now) => {
    const days = Number(runtimeEnv.PRIVACY_AUDIT_RETENTION_DAYS || 365);
    if (!Number.isInteger(days) || days < 30 || days > 3650) {
        throw deletionUnavailable('DELETION_CONFIGURATION_ERROR');
    }
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
};

export const createDeletionRepository = ({ databaseClient } = {}) => {
    let client = databaseClient;

    const getDatabase = () => {
        if (client) return client;
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw deletionUnavailable();
        }
        client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return client;
    };

    const rpc = async (name, args) => {
        try {
            const { data, error } = await getDatabase().rpc(name, args);
            if (error) throw error;
            return normalizeRpcRow(data);
        } catch {
            throw deletionUnavailable();
        }
    };

    const deleteScan = async ({ userId, scanId, subjectHash, targetHash, purgeAfter }) => {
        const row = await rpc('delete_user_scan_with_audit', {
            p_user_id: userId,
            p_scan_id: scanId,
            p_subject_hash: subjectHash,
            p_target_hash: targetHash,
            p_purge_after: purgeAfter,
        });
        return row?.deleted === true;
    };

    const getAccountSubscription = async (userId) => {
        try {
            const { data, error } = await getDatabase()
                .from('subscriptions')
                .select('plan, status, dodo_customer_id, dodo_subscription_id, cancelled_at')
                .eq('user_id', userId)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch {
            throw deletionUnavailable();
        }
    };

    const claimAccountDeletion = async ({ subjectHash, purgeAfter }) => {
        const row = await rpc('claim_account_deletion', {
            p_subject_hash: subjectHash,
            p_purge_after: purgeAfter,
        });
        if (!row?.audit_id) throw deletionUnavailable();
        return {
            auditId: row.audit_id,
            stage: row.stage,
            claimed: row.claimed === true,
        };
    };

    const markAudit = async (auditId, {
        stage,
        outcome = 'in_progress',
        failureCode = null,
        completedAt = null,
    }) => {
        try {
            const { error } = await getDatabase()
                .from('privacy_deletion_audits')
                .update({
                    stage,
                    outcome,
                    failure_code: failureCode,
                    completed_at: completedAt,
                })
                .eq('id', auditId);
            if (error) throw error;
        } catch {
            throw deletionUnavailable();
        }
    };

    const prepareBillingDeletion = async ({
        auditId,
        subscriptionId,
        subscriptionHash,
        customerHash,
        cancelledAt,
        expiresAt,
    }) => {
        const row = await rpc('prepare_account_billing_deletion', {
            p_audit_id: auditId,
            p_subscription_id: subscriptionId,
            p_subscription_hash: subscriptionHash,
            p_customer_hash: customerHash,
            p_cancelled_at: cancelledAt,
            p_expires_at: expiresAt,
        });
        if (row?.prepared !== true) throw deletionUnavailable();
    };

    const clearLegacyImageReferences = async (userId) => {
        try {
            const { error } = await getDatabase()
                .from('skin_analysis')
                .update({
                    image_url: null,
                    cloudinary_public_id: null,
                    image_retained: false,
                    raw_api_response: null,
                })
                .eq('user_id', userId);
            if (error) throw error;
        } catch {
            throw deletionUnavailable('ACCOUNT_IMAGE_CLEANUP_FAILED');
        }
    };

    return Object.freeze({
        claimAccountDeletion,
        clearLegacyImageReferences,
        deleteScan,
        getAccountSubscription,
        markAudit,
        prepareBillingDeletion,
    });
};

const getDodoBaseUrl = (runtimeEnv) => {
    try {
        const parsed = new URL(runtimeEnv.DODO_API_BASE_URL);
        const expected = runtimeEnv.DODO_ENVIRONMENT === 'live_mode'
            ? 'https://live.dodopayments.com'
            : 'https://test.dodopayments.com';
        if (parsed.origin !== expected || parsed.pathname !== '/') throw new Error('Invalid Dodo URL');
        return parsed.origin;
    } catch {
        throw deletionUnavailable('DELETION_CONFIGURATION_ERROR');
    }
};

const cancelProviderSubscription = async ({ subscriptionId, httpClient, runtimeEnv }) => {
    const apiKey = String(runtimeEnv.DODO_API_KEY || '').trim();
    if (!apiKey) throw deletionUnavailable('DELETION_CONFIGURATION_ERROR');

    try {
        const response = await httpClient.patch(
            `${getDodoBaseUrl(runtimeEnv)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
            {
                status: 'cancelled',
                cancel_reason: 'cancelled_by_customer',
                cancellation_comment: 'Account deletion request',
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                timeout: 10_000,
                maxRedirects: 0,
            }
        );
        const parsed = CancelledSubscriptionSchema.safeParse(response?.data);
        if (!parsed.success || parsed.data.subscription_id !== subscriptionId) {
            throw new DeletionError(
                'ACCOUNT_BILLING_CANCELLATION_UNCONFIRMED',
                'Billing cancellation could not be confirmed',
                502
            );
        }
        return parsed.data.cancelled_at || new Date().toISOString();
    } catch (error) {
        if (error instanceof DeletionError) throw error;
        if (axios.isAxiosError(error) && ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
            throw new DeletionError(
                'ACCOUNT_BILLING_CANCELLATION_TIMEOUT',
                'Billing cancellation could not be confirmed',
                504
            );
        }
        throw new DeletionError(
            'ACCOUNT_BILLING_CANCELLATION_FAILED',
            'Billing cancellation could not be confirmed',
            502
        );
    }
};

export const createDeletionService = ({
    repository = createDeletionRepository(),
    httpClient = axios,
    runtimeEnv = env,
    verifyPassword = signInWithPassword,
    removeAuthUser = deleteAuthUser,
    deletionLogger = logger,
    now = () => new Date(),
} = {}) => {
    const deleteScan = async ({ userId, scanId }) => {
        const secret = requireAuditSecret(runtimeEnv);
        const current = now();
        const deleted = await repository.deleteScan({
            userId,
            scanId,
            subjectHash: hashDeletionReference(`user:${userId}`, secret),
            targetHash: hashDeletionReference(`scan:${scanId}`, secret),
            purgeAfter: getPurgeAfter(runtimeEnv, current),
        });
        if (!deleted) {
            throw new DeletionError('SCAN_NOT_FOUND', 'Scan not found', 404);
        }
        return { scanId, deleted: true };
    };

    const deleteAccount = async ({ userId, email, currentPassword, clientIp }) => {
        const secret = requireAuditSecret(runtimeEnv);
        const verified = await verifyPassword({ email, password: currentPassword, clientIp });
        if (verified.error || verified.data?.user?.id !== userId) {
            throw new DeletionError(
                'ACCOUNT_REAUTHENTICATION_FAILED',
                'Current password is incorrect',
                403
            );
        }

        const current = now();
        const purgeAfter = getPurgeAfter(runtimeEnv, current);
        const subjectHash = hashDeletionReference(`user:${userId}`, secret);
        const claim = await repository.claimAccountDeletion({ subjectHash, purgeAfter });
        if (!claim.claimed) {
            throw new DeletionError(
                'ACCOUNT_DELETION_IN_PROGRESS',
                'Account deletion is already in progress',
                409
            );
        }

        const failAudit = async (error) => {
            try {
                await repository.markAudit(claim.auditId, {
                    stage: 'failed',
                    outcome: 'failed',
                    failureCode: error.publicCode || 'ACCOUNT_DELETION_FAILED',
                });
            } catch {
                deletionLogger.error('Account deletion audit could not be finalized', {
                    code: 'DELETION_AUDIT_UPDATE_FAILED',
                });
            }
        };

        try {
            const subscription = await repository.getAccountSubscription(userId);
            const subscriptionId = subscription?.dodo_subscription_id || null;
            let cancelledAt = subscription?.cancelled_at || current.toISOString();

            if (subscriptionId && !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) {
                cancelledAt = await cancelProviderSubscription({
                    subscriptionId,
                    httpClient,
                    runtimeEnv,
                });
                await repository.markAudit(claim.auditId, {
                    stage: 'provider_cancelled',
                });
            }

            if (subscriptionId) {
                await repository.prepareBillingDeletion({
                    auditId: claim.auditId,
                    subscriptionId,
                    subscriptionHash: hashDeletionReference(`subscription:${subscriptionId}`, secret),
                    customerHash: subscription.dodo_customer_id
                        ? hashDeletionReference(`customer:${subscription.dodo_customer_id}`, secret)
                        : null,
                    cancelledAt,
                    expiresAt: purgeAfter,
                });
            }

            await repository.clearLegacyImageReferences(userId);

            const { error: authError } = await removeAuthUser(userId);
            if (authError) {
                throw deletionUnavailable('ACCOUNT_AUTH_DELETION_FAILED');
            }

            try {
                await repository.markAudit(claim.auditId, {
                    stage: 'completed',
                    outcome: 'completed',
                    completedAt: now().toISOString(),
                });
            } catch {
                deletionLogger.error('Deleted account audit completion was delayed', {
                    code: 'DELETION_AUDIT_UPDATE_FAILED',
                });
            }

            return { deleted: true };
        } catch (error) {
            await failAudit(error);
            throw error;
        }
    };

    return Object.freeze({ deleteAccount, deleteScan });
};

const defaultDeletionService = createDeletionService();

export const deleteOwnedScan = (input) => defaultDeletionService.deleteScan(input);
export const deleteUserAccount = (input) => defaultDeletionService.deleteAccount(input);

export default {
    DeletionError,
    createDeletionRepository,
    createDeletionService,
    deleteOwnedScan,
    deleteUserAccount,
    hashDeletionReference,
};
