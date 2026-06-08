import express from 'express';
import { scan } from '../controllers/scanController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';
import scanLimitMiddleware from '../middleware/scanLimitMiddleware.js';

const router = express.Router();

/**
 * POST /api/scan
 * Authenticate -> Check rate limit -> Check scan limit -> Analyze imageUrl
 */
router.post(
    '/scan',
    authMiddleware,
    rateLimitMiddleware,
    scanLimitMiddleware,
    scan
);

export default router;
