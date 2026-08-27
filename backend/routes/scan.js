import express from 'express';
import { scan } from '../controllers/scanController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';
import {
    reserveScanQuotaMiddleware,
    scanQuotaPrecheck,
} from '../middleware/scanLimitMiddleware.js';
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
    rateLimitMiddleware,
    privacyConsentMiddleware,
    scanQuotaPrecheck,
    uploadScanImage,
    prepareScanImage,
    reserveScanQuotaMiddleware,
    scan
);

export default router;
