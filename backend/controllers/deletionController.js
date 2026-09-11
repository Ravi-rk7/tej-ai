import { z } from 'zod';
import logger from '../utils/logger.js';
import { errorResponse, successResponse } from '../utils/responseFormatter.js';
import { deleteOwnedScan } from '../services/deletionService.js';

const ScanIdSchema = z.string().uuid();
const setPrivateNoStore = (res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');
};

const deletionFailure = (res, error, deletionLogger) => {
    if (error.publicMessage) {
        return errorResponse(res, error.publicMessage, error.statusCode || 503, error.publicCode);
    }
    deletionLogger.error('Deletion operation failed', {
        code: 'DELETION_UNAVAILABLE',
    });
    return errorResponse(res, 'Deletion is temporarily unavailable', 503, 'DELETION_UNAVAILABLE');
};

export const createDeleteScanHandler = ({
    deleteScan = deleteOwnedScan,
    deletionLogger = logger,
} = {}) => async (req, res) => {
    setPrivateNoStore(res);
    const parsedId = ScanIdSchema.safeParse(req.params.scanId);
    if (!parsedId.success) {
        return errorResponse(res, 'Invalid scan ID', 400, 'SCAN_ID_INVALID');
    }
    try {
        return successResponse(res, await deleteScan({
            userId: req.user.id,
            scanId: parsedId.data,
        }));
    } catch (error) {
        return deletionFailure(res, error, deletionLogger);
    }
};

export const deleteScan = createDeleteScanHandler();

export default { deleteScan };
