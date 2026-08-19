import express from 'express';
import { scan } from '../controllers/scanController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';
import scanLimitMiddleware from '../middleware/scanLimitMiddleware.js';
import {
    prepareScanImage,
    uploadScanImage,
} from '../middleware/imageUploadMiddleware.js';

const router = express.Router();

/**
 * POST /api/scan
 * Authenticate -> Check limits -> Parse and normalize one bounded JPG -> Analyze
 */
router.post(
    '/scan',
    authMiddleware,
    rateLimitMiddleware,
    scanLimitMiddleware,
    uploadScanImage,
    prepareScanImage,
    scan
);

export default router;
