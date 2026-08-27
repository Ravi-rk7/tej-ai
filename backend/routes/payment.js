import express from 'express';
import {
    checkoutAvailabilityMiddleware,
    createBillingCheckout,
    disabledBillingEndpoint,
    getSubscriptionStatus,
    portalAvailabilityMiddleware,
    createCustomerPortalHandler,
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

router.post(
    '/billing/portal',
    authMiddleware,
    portalAvailabilityMiddleware,
    billingRateLimitMiddleware,
    createCustomerPortalHandler
);

// Dodo redirects may contain provider-controlled query parameters. These relays
// intentionally discard every incoming parameter before returning to the app.
router.get('/billing/return', relayBillingReturn);
router.get('/billing/cancel', relayBillingCancel);

// The legacy checkout path remains fail-closed. Signed webhooks live in the
// route-specific raw-body router mounted before the JSON parser.
router.post('/create-subscription', disabledBillingEndpoint);

export default router;
