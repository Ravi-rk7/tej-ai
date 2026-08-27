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
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

router.get('/privacy/status', authMiddleware, rateLimitMiddleware, getStatus);
router.post('/privacy/consent', authMiddleware, rateLimitMiddleware, grantConsent);
router.post('/privacy/consent/withdraw', authMiddleware, rateLimitMiddleware, withdrawConsent);
router.delete('/scans/:scanId', authMiddleware, rateLimitMiddleware, deleteScan);
router.delete('/account', authMiddleware, rateLimitMiddleware, deleteAccount);

export default router;
