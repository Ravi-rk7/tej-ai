import axios from 'axios';
import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const DODO_API_TIMEOUT = 10000;
const DODO_BASE_URL = env.DODO_API_BASE_URL;

const buildPaymentError = (publicMessage, statusCode = 502, details) => {
    const error = new Error(publicMessage);
    error.publicMessage = publicMessage;
    error.statusCode = statusCode;
    if (details) {
        error.details = details;
    }
    return error;
};

const PLANS = {
    starter: { name: 'Starter', price: 6.99, scans: 15, productId: env.DODO_PRODUCT_ID_STARTER },
    growth: { name: 'Growth', price: 12.99, scans: 30, productId: env.DODO_PRODUCT_ID_GROWTH },
    pro: { name: 'Pro', price: 19.99, scans: 50, productId: env.DODO_PRODUCT_ID_PRO },
};

/**
 * Create checkout session with Dodo Payments
 */
export const createCheckoutSession = async (userId, email, plan) => {
    try {
        if (!PLANS[plan]) {
            throw buildPaymentError('Invalid subscription plan', 400);
        }

        const planInfo = PLANS[plan];

        if (!planInfo.productId) {
            throw buildPaymentError(`Missing Dodo product ID for ${plan} plan`, 500);
        }

        const response = await axios.post(
            `${DODO_BASE_URL}/subscriptions`,
            {
                customer: { email },
                product_id: planInfo.productId,
                payment_link: true,
                return_url: `${env.FRONTEND_URL}/dashboard?upgrade=success`,
                metadata: {
                    user_id: userId,
                    plan,
                    plan_name: planInfo.name,
                },
            },
            {
                headers: {
                    'Authorization': `Bearer ${env.DODO_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: DODO_API_TIMEOUT,
            }
        );

        logger.info('Checkout session created', { userId, plan });
        const checkoutUrl = response.data.payment_link || response.data.checkout_url || response.data.checkoutUrl;
        if (!checkoutUrl) {
            throw buildPaymentError('Dodo checkout URL was not returned', 502);
        }

        return {
            checkoutUrl,
            raw: response.data,
        };
    } catch (error) {
        logger.error('Dodo Payments checkout error', {
            message: error.message,
            status: error.response?.status,
        });

        if (error.publicMessage) {
            throw error;
        }

        if (axios.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') {
                throw buildPaymentError('Payment provider timed out', 504);
            }
            if (error.response) {
                throw buildPaymentError('Payment provider rejected the request', 502);
            }
            throw buildPaymentError('Payment provider is unavailable', 502);
        }

        throw buildPaymentError('Failed to create subscription checkout', 502);
    }
};

/**
 * Verify Dodo webhook signature
 */
export const verifyWebhookSignature = (payload, signature) => {
    if (!payload || !signature) {
        return false;
    }

    const expected = crypto
        .createHmac('sha256', env.DODO_WEBHOOK_SECRET)
        .update(payload, 'utf8')
        .digest('hex');

    const normalizedSignature = signature.trim().replace(/^sha256=/, '');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(normalizedSignature, 'hex')
        );
    } catch {
        return false;
    }
};

export const PLAN_INFO = PLANS;

export default {
    createCheckoutSession,
    verifyWebhookSignature,
    PLAN_INFO,
};
