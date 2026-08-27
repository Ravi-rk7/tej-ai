import logger from '../utils/logger.js';
import { errorResponse } from '../utils/responseFormatter.js';
import { requireFaceScanConsent } from '../services/privacyService.js';

export const createPrivacyConsentMiddleware = ({
    requireConsent = requireFaceScanConsent,
    privacyLogger = logger,
} = {}) => async (req, res, next) => {
    try {
        await requireConsent(req.user.id);
        return next();
    } catch (error) {
        if (error.publicCode === 'FACE_SCAN_CONSENT_REQUIRED') {
            return errorResponse(res, error.publicMessage, 403, error.publicCode);
        }
        privacyLogger.error('Face-scan consent check failed', {
            code: error.publicCode || 'PRIVACY_STATUS_UNAVAILABLE',
        });
        return errorResponse(
            res,
            'Privacy preferences are temporarily unavailable',
            503,
            'PRIVACY_STATUS_UNAVAILABLE'
        );
    }
};

export const privacyConsentMiddleware = createPrivacyConsentMiddleware();

export default privacyConsentMiddleware;
