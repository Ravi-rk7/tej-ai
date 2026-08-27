import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';
import {
    getScanQuotaStatus,
    reserveScanQuota,
} from '../services/quotaService.js';
import { releaseScanImage } from './imageUploadMiddleware.js';

const limitReached = (res) => errorResponse(
    res,
    'Scan limit reached',
    403,
    'SCAN_LIMIT_REACHED'
);

/**
 * Cheap UX precheck. The reservation middleware remains authoritative and
 * serializes concurrent requests in PostgreSQL.
 */
export const scanQuotaPrecheck = async (req, res, next) => {
    try {
        if (!req.user) return next();

        const quota = await getScanQuotaStatus(req.user.id);
        req.scanInfo = quota;

        if (quota.used >= quota.limit) {
            logger.warn('Monthly scan limit reached', {
                used: quota.used,
                limit: quota.limit,
            });
            return limitReached(res);
        }

        return next();
    } catch (error) {
        logger.error('Scan quota precheck failed', {
            code: error.publicCode || 'SCAN_LIMIT_UNAVAILABLE',
        });
        return errorResponse(res, 'Unable to verify scan limit', 503, 'SCAN_LIMIT_UNAVAILABLE');
    }
};

/**
 * Atomic reservation after image validation and before any paid provider call.
 */
export const reserveScanQuotaMiddleware = async (req, res, next) => {
    try {
        if (!req.user) return next();

        const reservation = await reserveScanQuota(req.user.id);
        if (!reservation.granted || !reservation.reservationId) {
            releaseScanImage(req);
            logger.warn('Atomic scan quota denied', {
                used: reservation.used,
                limit: reservation.limit,
            });
            return limitReached(res);
        }

        req.scanQuota = reservation;
        req.scanInfo = reservation;
        return next();
    } catch (error) {
        releaseScanImage(req);
        logger.error('Atomic scan quota reservation failed', {
            code: error.publicCode || 'SCAN_LIMIT_UNAVAILABLE',
        });
        return errorResponse(res, 'Unable to verify scan limit', 503, 'SCAN_LIMIT_UNAVAILABLE');
    }
};

export const scanLimitMiddleware = scanQuotaPrecheck;

export default scanQuotaPrecheck;
