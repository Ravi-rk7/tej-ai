import { z } from 'zod';
import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { createCheckoutSession, verifyWebhookSignature } from '../services/paymentService.js';
import { upsertSubscription } from '../services/supabaseService.js';

const CreateSubscriptionSchema = z.object({
    plan: z.enum(['starter', 'growth', 'pro']),
});

const WebhookSchema = z.object({
    event: z.string().min(1),
    data: z
        .object({
            metadata: z
                .object({
                    user_id: z.string().uuid().optional(),
                })
                .optional(),
            user_id: z.string().uuid().optional(),
            subscription_plan: z.string().optional(),
            plan: z.string().optional(),
            status: z.string().optional(),
            subscription_id: z.string().optional(),
            customer_id: z.string().optional(),
            current_period_end: z.string().optional(),
            expiry: z.string().optional(),
        })
        .passthrough()
        .optional(),
});

const SUPPORTED_WEBHOOK_EVENTS = new Set([
    'payment_success',
    'subscription_active',
    'subscription_cancelled',
]);

const normalizePlan = (planValue) => {
    const plan = String(planValue || '').toLowerCase();
    if (['starter', 'growth', 'pro'].includes(plan)) {
        return plan;
    }
    return 'starter';
};

/**
 * POST /api/create-subscription
 * Create Dodo Payments checkout session
 */
export const createSubscription = asyncHandler(async (req, res) => {
    try {
        const { plan } = CreateSubscriptionSchema.parse(req.body);

        logger.info('Subscription checkout initiated', { userId: req.user.id, plan });

        const checkoutSession = await createCheckoutSession(
            req.user.id,
            req.user.email,
            plan
        );

        return successResponse(res, {
            checkoutUrl: checkoutSession.checkoutUrl,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return errorResponse(res, error.errors[0].message, 400);
        }

        if (error.publicMessage) {
            return errorResponse(res, error.publicMessage, error.statusCode || 502);
        }

        logger.error('Subscription creation error', { userId: req.user.id, message: error.message });
        return errorResponse(res, 'Subscription creation failed', 502);
    }
});

/**
 * POST /api/webhook
 * Handle Dodo Payments webhook events
 */
export const handleWebhook = asyncHandler(async (req, res) => {
    try {
        const signature = z
            .string()
            .min(1, 'Missing webhook signature')
            .parse(req.headers['x-dodo-signature'] || req.headers['x-signature']);

        const rawPayload = req.rawBody || JSON.stringify(req.body);

        const isValid = verifyWebhookSignature(rawPayload, String(signature));
        if (!isValid) {
            return errorResponse(res, 'Invalid webhook signature', 401);
        }

        const { event, data } = WebhookSchema.parse(req.body);

        logger.info('Webhook received', { event, userId: data?.metadata?.user_id });

        if (!SUPPORTED_WEBHOOK_EVENTS.has(event)) {
            return successResponse(res, { received: true, ignored: true });
        }

        const userId = data?.metadata?.user_id || data?.user_id;

        if (!userId) {
            return errorResponse(res, 'Missing user_id in webhook payload', 400);
        }

        const statusByEvent = {
            payment_success: 'active',
            subscription_active: 'active',
            subscription_cancelled: 'cancelled',
        };

        const resolvedStatus = statusByEvent[event];
        const resolvedPlan = normalizePlan(data?.subscription_plan || data?.plan);
        const resolvedExpiry = data?.expiry || data?.current_period_end || null;

        await upsertSubscription(userId, {
            plan: resolvedPlan,
            status: resolvedStatus,
            dodo_customer_id: data?.customer_id || null,
            dodo_subscription_id: data?.subscription_id || null,
            current_period_end: resolvedExpiry,
        });

        return successResponse(res, { received: true });
    } catch (error) {
        logger.error('Webhook error', error);
        if (error instanceof z.ZodError) {
            return errorResponse(res, error.errors[0].message, 400);
        }
        if (error.publicMessage) {
            return errorResponse(res, error.publicMessage, error.statusCode || 500);
        }
        return errorResponse(res, 'Webhook processing failed', 500);
    }
});

export default { createSubscription, handleWebhook };
