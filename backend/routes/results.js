import express from 'express';
import { getResult } from '../controllers/resultController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';

const router = express.Router();
const noStore = (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
};

/**
 * GET /api/results/:scanId
 * Authenticate -> rate limit -> return one owner-scoped, sanitized result.
 */
router.get(
    '/results/:scanId',
    noStore,
    authMiddleware,
    rateLimitMiddleware,
    getResult
);

export default router;
