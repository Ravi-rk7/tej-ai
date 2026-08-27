import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { errorResponse, successResponse } from '../utils/responseFormatter.js';
import {
    getPrivacyStatus,
    grantFaceScanConsent,
    withdrawFaceScanConsent,
} from '../services/privacyService.js';

const GrantConsentSchema = z.object({
    noticeVersion: z.string().trim().min(1).max(100),
    faceScanProcessing: z.literal(true),
    adultConfirmation: z.literal(true),
}).strict();

const EmptyBodySchema = z.object({}).strict();

const setPrivateNoStore = (res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');
};

const privacyFailure = (res, error, privacyLogger) => {
    if (error.publicMessage) {
        return errorResponse(res, error.publicMessage, error.statusCode || 503, error.publicCode);
    }
    privacyLogger.error('Privacy preference operation failed', {
        code: 'PRIVACY_STATUS_UNAVAILABLE',
    });
    return errorResponse(
        res,
        'Privacy preferences are temporarily unavailable',
        503,
        'PRIVACY_STATUS_UNAVAILABLE'
    );
};

export const createPrivacyStatusHandler = ({
    loadStatus = getPrivacyStatus,
    privacyLogger = logger,
} = {}) => async (req, res) => {
    setPrivateNoStore(res);
    try {
        return successResponse(res, await loadStatus(req.user.id));
    } catch (error) {
        return privacyFailure(res, error, privacyLogger);
    }
};

export const createGrantConsentHandler = ({
    grantConsent = grantFaceScanConsent,
    noticeVersion = () => env.PRIVACY_NOTICE_VERSION,
    privacyLogger = logger,
} = {}) => async (req, res) => {
    setPrivateNoStore(res);
    const parsed = GrantConsentSchema.safeParse(req.body);
    if (!parsed.success) {
        return errorResponse(
            res,
            'Explicit adult confirmation and face-scan consent are required',
            400,
            'CONSENT_REQUEST_INVALID'
        );
    }
    if (parsed.data.noticeVersion !== noticeVersion()) {
        return errorResponse(
            res,
            'The privacy notice has changed. Review the current notice and try again.',
            409,
            'CONSENT_VERSION_OUTDATED'
        );
    }
    try {
        return successResponse(res, await grantConsent(req.user.id), 201);
    } catch (error) {
        return privacyFailure(res, error, privacyLogger);
    }
};

export const createWithdrawConsentHandler = ({
    withdrawConsent = withdrawFaceScanConsent,
    privacyLogger = logger,
} = {}) => async (req, res) => {
    setPrivateNoStore(res);
    if (!EmptyBodySchema.safeParse(req.body || {}).success) {
        return errorResponse(
            res,
            'Consent withdrawal request must not include additional fields',
            400,
            'CONSENT_WITHDRAWAL_INVALID'
        );
    }
    try {
        return successResponse(res, await withdrawConsent(req.user.id));
    } catch (error) {
        return privacyFailure(res, error, privacyLogger);
    }
};

export const getStatus = createPrivacyStatusHandler();
export const grantConsent = createGrantConsentHandler();
export const withdrawConsent = createWithdrawConsentHandler();

export default { getStatus, grantConsent, withdrawConsent };
