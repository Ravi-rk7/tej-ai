import express from 'express';
import { handleDodoWebhook } from '../controllers/webhookController.js';

const router = express.Router();

router.post(
    '/webhook',
    express.raw({ type: 'application/json', limit: '256kb' }),
    handleDodoWebhook
);

export default router;
