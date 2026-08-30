import logger from "../utils/logger.js";
import { errorResponse } from "../utils/responseFormatter.js";
import {
  getScanQuotaStatus,
  reserveScanQuota,
} from "../services/quotaService.js";
import { releaseScanImage } from "./imageUploadMiddleware.js";

const limitReached = (res) =>
  errorResponse(res, "Scan limit reached", 403, "SCAN_LIMIT_REACHED");

/**
 * Cheap UX precheck. The reservation middleware remains authoritative and
 * serializes concurrent requests in PostgreSQL.
 */
export const createScanQuotaPrecheck =
  ({ loadQuota = getScanQuotaStatus, quotaLogger = logger } = {}) =>
  async (req, res, next) => {
    try {
      if (!req.user) return next();

      const quota = await loadQuota(req.user.id);
      req.scanInfo = quota;

      if (quota.used >= quota.limit) {
        quotaLogger.warn("Monthly scan limit reached", {
          used: quota.used,
          limit: quota.limit,
        });
        return limitReached(res);
      }

      return next();
    } catch (error) {
      quotaLogger.error("Scan quota precheck failed", {
        code: error.publicCode || "SCAN_LIMIT_UNAVAILABLE",
      });
      return errorResponse(
        res,
        "Unable to verify scan limit",
        503,
        "SCAN_LIMIT_UNAVAILABLE",
      );
    }
  };

/**
 * Atomic reservation after image validation and before any paid provider call.
 */
export const createReserveScanQuotaMiddleware =
  ({
    reserveQuota = reserveScanQuota,
    releaseImage = releaseScanImage,
    quotaLogger = logger,
  } = {}) =>
  async (req, res, next) => {
    try {
      if (!req.user) return next();

      const reservation = await reserveQuota(req.user.id);
      if (!reservation.granted || !reservation.reservationId) {
        releaseImage(req);
        quotaLogger.warn("Atomic scan quota denied", {
          used: reservation.used,
          limit: reservation.limit,
        });
        return limitReached(res);
      }

      req.scanQuota = reservation;
      req.scanInfo = reservation;
      return next();
    } catch (error) {
      releaseImage(req);
      quotaLogger.error("Atomic scan quota reservation failed", {
        code: error.publicCode || "SCAN_LIMIT_UNAVAILABLE",
      });
      return errorResponse(
        res,
        "Unable to verify scan limit",
        503,
        "SCAN_LIMIT_UNAVAILABLE",
      );
    }
  };

export const scanQuotaPrecheck = createScanQuotaPrecheck();
export const reserveScanQuotaMiddleware = createReserveScanQuotaMiddleware();

export const scanLimitMiddleware = scanQuotaPrecheck;

export default scanQuotaPrecheck;
