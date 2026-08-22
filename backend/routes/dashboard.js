import express from 'express';
import { getDashboard } from '../controllers/dashboardController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimitMiddleware from '../middleware/rateLimitMiddleware.js';

const router = express.Router();
const noStore = (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
};

router.get(
    '/dashboard',
    noStore,
    authMiddleware,
    rateLimitMiddleware,
    getDashboard
);

export default router;
