import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Webhook } from 'standardwebhooks';
import { z } from 'zod';
import env from '../config/env.js';
import { getPlanCatalog } from './paymentService.js';

export const DODO_SUBSCRIPTION_EVENTS = Object.freeze(new Set([
    'subscription.active',
    'subscription.renewed',
    'subscription.updated',
    'subscription.on_hold',
    'subscription.cancelled',
    'subscription.failed',
    'subscription.expired',
    'subscription.paused',
    'subscription.unpaused',
    'subscription.plan_changed',
    'subscription.update_payment_method',
]));

const StatusSchema = z.enum([
    'active',
    'cancelled',
    'past_due',
    'pending',
    'on_hold',
    'paused',
    'failed',
    'expired',
]);

const MetadataSchema = z.record(z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
]));

const SubscriptionDataSchema = z.object({
    payload_type: z.string().max(80).optional(),
    subscription_id: z.string().trim().min(1).max(255),
    product_id: z.string().trim().min(1).max(255),
    status: StatusSchema,
    customer: z.object({
        customer_id: z.string().trim().min(1).max(255),
    }).passthrough().optional(),
    customer_id: z.string().trim().min(1).max(255).optional(),
    metadata: MetadataSchema.optional(),
    object: z.object({
        metadata: MetadataSchema.optional(),
    }).passthrough().optional(),
    previous_billing_date: z.string().datetime({ offset: true }).nullable().optional(),
    next_billing_date: z.string().datetime({ offset: true }).nullable().optional(),
    cancel_at_next_billing_date: z.boolean().optional(),
    cancelled_at: z.string().datetime({ offset: true }).nullable().optional(),
    expires_at: z.string().datetime({ offset: true }).nullable().optional(),
}).passthrough();

const EnvelopeSchema = z.object({
    business_id: z.string().trim().min(1).max(255),
    type: z.string().trim().min(1).max(120),
    timestamp: z.string().datetime({ offset: true }),
    data: z.unknown(),
}).passthrough();

export class WebhookError extends Error {
    constructor(publicMessage, statusCode, publicCode, { retry = false } = {}) {
        super(publicMessage);
        this.name = 'WebhookError';
        this.publicMessage = publicMessage;
        this.statusCode = statusCode;
        this.publicCode = publicCode;
        this.retry = retry;
    }
}

const webhookError = (message, status, code, options) => (
    new WebhookError(message, status, code, options)
);

const headerValue = (headers, name, maxLength) => {
    const value = headers?.[name]
        ?? headers?.[Object.keys(headers || {}).find((key) => key.toLowerCase() === name)];
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) return null;
    return normalized;
};

const parseSentAt = (value) => {
    if (!/^\d{10,11}$/.test(value)) return null;
    const seconds = Number(value);
    if (!Number.isSafeInteger(seconds)) return null;
    return new Date(seconds * 1000);
};

const toUuid = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = z.string().uuid().safeParse(String(value));
    if (!parsed.success) {
        throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
    }
    return parsed.data;
};

const parseMetadata = (data) => {
    const metadata = data.metadata || data.object?.metadata || {};
    const userId = toUuid(metadata.user_id);
    const checkoutAttemptId = toUuid(metadata.checkout_attempt_id);
    const metadataPlan = metadata.plan === undefined || metadata.plan === null
        ? null
        : String(metadata.plan).trim().toLowerCase();
    if (metadataPlan !== null && !['starter', 'growth', 'pro'].includes(metadataPlan)) {
        throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
    }
    return { userId, checkoutAttemptId, metadataPlan };
};

const parseCustomerId = (data) => {
    const nested = data.customer?.customer_id || null;
    const flat = data.customer_id || null;
    if (nested && flat && nested !== flat) {
        throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
    }
    if (!nested && !flat) {
        throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
    }
    return nested || flat;
};

const sha256 = (body) => crypto.createHash('sha256').update(body).digest('hex');
const hmacSha256 = (value, secret) => crypto
    .createHmac('sha256', secret)
    .update(String(value), 'utf8')
    .digest('hex');

const normalizeRpcRow = (data) => Array.isArray(data) ? data[0] : data;

export const createWebhookProcessor = ({ databaseClient, runtimeEnv = env } = {}) => {
    let client = databaseClient;
    const getDatabase = () => {
        if (client) return client;
        if (!runtimeEnv.SUPABASE_URL || !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY) {
            throw webhookError('Webhook storage is unavailable', 503, 'WEBHOOK_STORAGE_UNAVAILABLE', { retry: true });
        }
        client = createClient(runtimeEnv.SUPABASE_URL, runtimeEnv.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return client;
    };

    const rpc = async (name, args) => {
        try {
            const { data, error } = await getDatabase().rpc(name, args);
            if (error) {
                throw webhookError('Webhook storage is unavailable', 503, 'WEBHOOK_STORAGE_UNAVAILABLE', { retry: true });
            }
            return normalizeRpcRow(data);
        } catch (error) {
            if (error instanceof WebhookError) throw error;
            throw webhookError('Webhook storage is unavailable', 503, 'WEBHOOK_STORAGE_UNAVAILABLE', { retry: true });
        }
    };

    const handle = async (rawBody, headers = {}) => {
        if (!runtimeEnv.BILLING_WEBHOOK_ENABLED) {
            throw webhookError('Webhook processing is temporarily unavailable', 503, 'WEBHOOK_DISABLED', { retry: true });
        }

        if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
            throw webhookError('Invalid webhook request', 400, 'WEBHOOK_BODY_INVALID');
        }

        const webhookId = headerValue(headers, 'webhook-id', 255);
        const signature = headerValue(headers, 'webhook-signature', 4096);
        const timestamp = headerValue(headers, 'webhook-timestamp', 20);
        const sentAt = timestamp ? parseSentAt(timestamp) : null;
        if (!webhookId || !signature || !timestamp || !sentAt) {
            throw webhookError('Webhook verification failed', 401, 'WEBHOOK_VERIFICATION_FAILED');
        }

        let envelope;
        try {
            const verifier = new Webhook(String(runtimeEnv.DODO_WEBHOOK_SECRET || ''));
            envelope = verifier.verify(rawBody, {
                'webhook-id': webhookId,
                'webhook-signature': signature,
                'webhook-timestamp': timestamp,
            });
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
            }
            throw webhookError('Webhook verification failed', 401, 'WEBHOOK_VERIFICATION_FAILED');
        }

        const parsedEnvelope = EnvelopeSchema.safeParse(envelope);
        if (!parsedEnvelope.success) {
            throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
        }

        const { business_id: businessId, type: eventType, timestamp: eventTimestamp, data: rawData } = parsedEnvelope.data;
        if (businessId !== String(runtimeEnv.DODO_BUSINESS_ID || '').trim()) {
            throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_BUSINESS_INVALID');
        }

        const payloadHash = sha256(rawBody);
        const eventAt = new Date(eventTimestamp);

        if (!DODO_SUBSCRIPTION_EVENTS.has(eventType)) {
            await rpc('record_dodo_webhook_event', {
                p_provider_event_id: webhookId,
                p_event_type: eventType,
                p_payload_hash: payloadHash,
                p_event_at: eventAt.toISOString(),
                p_sent_at: sentAt.toISOString(),
            });
            return { outcome: 'ignored' };
        }

        const parsedData = SubscriptionDataSchema.safeParse(rawData);
        if (!parsedData.success) {
            throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
        }

        const data = parsedData.data;
        if (data.payload_type && data.payload_type.toLowerCase() !== 'subscription') {
            throw webhookError('Invalid webhook payload', 400, 'WEBHOOK_PAYLOAD_INVALID');
        }

        const deletionSecret = String(runtimeEnv.DELETION_AUDIT_HMAC_SECRET || '');
        if (deletionSecret.length >= 32) {
            const deletedSubject = await rpc('record_deleted_dodo_subscription_event', {
                p_provider_event_id: webhookId,
                p_event_type: eventType,
                p_payload_hash: payloadHash,
                p_event_at: eventAt.toISOString(),
                p_sent_at: sentAt.toISOString(),
                p_subscription_hash: hmacSha256(
                    `subscription:${data.subscription_id}`,
                    deletionSecret
                ),
            });
            if (deletedSubject?.matched === true) {
                return { outcome: deletedSubject.outcome || 'ignored' };
            }
        }

        const planCatalog = getPlanCatalog(runtimeEnv);
        const plan = Object.values(planCatalog).find((entry) => entry.productId === data.product_id)?.key;
        if (!plan) {
            throw webhookError('Invalid webhook product', 400, 'WEBHOOK_PRODUCT_INVALID');
        }

        const customerId = parseCustomerId(data);
        const metadata = parseMetadata(data);
        const row = await rpc('process_dodo_subscription_event', {
            p_provider_event_id: webhookId,
            p_event_type: eventType,
            p_payload_hash: payloadHash,
            p_event_at: eventAt.toISOString(),
            p_sent_at: sentAt.toISOString(),
            p_subscription_id: data.subscription_id,
            p_customer_id: customerId,
            p_product_id: data.product_id,
            p_plan: plan,
            p_status: data.status,
            p_period_start: data.previous_billing_date || null,
            p_period_end: data.next_billing_date || null,
            p_cancel_at_period_end: data.cancel_at_next_billing_date === true,
            p_cancelled_at: data.cancelled_at || null,
            p_expires_at: data.expires_at || null,
            p_metadata_user_id: metadata.userId,
            p_checkout_attempt_id: metadata.checkoutAttemptId,
            p_metadata_plan: metadata.metadataPlan,
        });

        return { outcome: row?.outcome || 'applied' };
    };

    return Object.freeze({ handle });
};

const defaultProcessor = createWebhookProcessor();
export const processDodoWebhook = (rawBody, headers) => defaultProcessor.handle(rawBody, headers);

export default {
    DODO_SUBSCRIPTION_EVENTS,
    WebhookError,
    createWebhookProcessor,
    processDodoWebhook,
};
