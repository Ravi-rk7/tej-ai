import express from 'express';
import { handleDodoWebhook } from '../controllers/webhookController.js';
import { webhookRateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';
import env from '../config/env.js';

const router = express.Router();

router.post(
    '/webhook',
    express.raw({ type: 'application/json', limit: '256kb' }),
    (req, res, next) => env.BILLING_WEBHOOK_ENABLED
        ? webhookRateLimitMiddleware(req, res, next)
        : next(),
    handleDodoWebhook
);

export default router;
