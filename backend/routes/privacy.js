import express from 'express';
import {
    getStatus,
    grantConsent,
    withdrawConsent,
} from '../controllers/privacyController.js';
import {
    deleteAccount,
    deleteScan,
} from '../controllers/deletionController.js';
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
router.delete('/account', authMiddleware, accountDeletionRateLimitMiddleware, deleteAccount);

export default router;
