import express from 'express';
import {
    checkoutAvailabilityMiddleware,
    createBillingCheckout,
    disabledBillingEndpoint,
    disabledWebhookEndpoint,
    getSubscriptionStatus,
    relayBillingCancel,
    relayBillingReturn,
} from '../controllers/paymentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import billingRateLimitMiddleware from '../middleware/billingRateLimitMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

router.post(
    '/billing/checkout',
    authMiddleware,
    checkoutAvailabilityMiddleware,
    billingRateLimitMiddleware,
    createBillingCheckout
);

router.get(
    '/billing/subscription',
    authMiddleware,
    rateLimitMiddleware,
    getSubscriptionStatus
);

// Dodo redirects may contain provider-controlled query parameters. These relays
// intentionally discard every incoming parameter before returning to the app.
router.get('/billing/return', relayBillingReturn);
router.get('/billing/cancel', relayBillingCancel);

// The legacy checkout and unsigned/non-standard webhook paths stay fail-closed
// until the signed Day 9 webhook lifecycle replaces them.
router.post('/create-subscription', disabledBillingEndpoint);
router.post('/webhook', disabledWebhookEndpoint);

export default router;
