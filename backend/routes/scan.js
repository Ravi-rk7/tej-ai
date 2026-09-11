import express from 'express';
import { portfolioScan as scan, liveScanEnabled } from '../controllers/portfolioController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { scanRateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';
import {
    prepareScanImage,
    uploadScanImage,
} from '../middleware/imageUploadMiddleware.js';
import privacyConsentMiddleware from '../middleware/privacyConsentMiddleware.js';

const router = express.Router();

/**
 * POST /api/scan
 * Authenticate -> precheck -> parse/normalize -> reserve -> analyze
 */
router.post(
    '/scan',
    authMiddleware,
    liveScanEnabled,
    scanRateLimitMiddleware,
    privacyConsentMiddleware,
    uploadScanImage,
    prepareScanImage,
    scan
);

export default router;
