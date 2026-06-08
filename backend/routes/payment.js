import express from 'express';
import { createSubscription, handleWebhook } from '../controllers/paymentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

/**
 * POST /api/create-subscription
 * Authenticate → Create checkout session
 */
router.post(
    '/create-subscription',
    authMiddleware,
    rateLimitMiddleware,
    createSubscription
);

/**
 * POST /api/webhook
 * No auth required (signature verified instead)
 */
router.post('/webhook', handleWebhook);

export default router;
