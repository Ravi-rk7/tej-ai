import express from 'express';
import {
    getStatus,
    grantConsent,
    withdrawConsent,
} from '../controllers/privacyController.js';
import {
    deleteScan,
} from '../controllers/deletionController.js';
import { portfolioDeletionHandlers } from '../controllers/portfolioDeletionController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware, {
    accountDeletionRateLimitMiddleware,
    privacyMutationRateLimitMiddleware,
    scanDeletionRateLimitMiddleware,
} from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

router.get('/privacy/status', authMiddleware, rateLimitMiddleware, getStatus);
router.post('/privacy/consent', authMiddleware, privacyMutationRateLimitMiddleware, grantConsent);
router.post('/privacy/consent/withdraw', authMiddleware, privacyMutationRateLimitMiddleware, withdrawConsent);
router.delete('/scans/:scanId', authMiddleware, scanDeletionRateLimitMiddleware, deleteScan);
router.post('/account/deletion-challenge', authMiddleware, accountDeletionRateLimitMiddleware, portfolioDeletionHandlers.challenge);
router.delete('/account', authMiddleware, accountDeletionRateLimitMiddleware, portfolioDeletionHandlers.deleteAccount);

export default router;
