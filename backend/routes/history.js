import express from 'express';
import { portfolioHistory as getHistory } from '../controllers/portfolioController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

/**
 * GET /api/history
 * Authenticate → Check rate limit → Return scan history
 */
router.get(
    '/history',
    authMiddleware,
    rateLimitMiddleware,
    getHistory
);

export default router;
