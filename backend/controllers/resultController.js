import { z } from 'zod';
import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { getUserScanById } from '../services/supabaseService.js';
import { serializeScanResult } from '../services/scanResultService.js';

const ScanIdSchema = z.string().uuid();
const NOT_FOUND_MESSAGE = 'Scan result not found';

export const createResultHandler = ({
    getResult = getUserScanById,
    serialize = serializeScanResult,
    resultLogger = logger,
} = {}) => async (req, res) => {
    res.set('Cache-Control', 'private, no-store');

    const parsedId = ScanIdSchema.safeParse(req.params.scanId);
    if (!parsedId.success) {
        return errorResponse(res, 'Invalid scan result ID', 400, 'RESULT_ID_INVALID');
    }

    try {
        const row = await getResult(req.user.id, parsedId.data);
        if (!row) {
            return errorResponse(res, NOT_FOUND_MESSAGE, 404, 'RESULT_NOT_FOUND');
        }

        const result = serialize(row);
        return successResponse(res, result);
    } catch (error) {
        resultLogger.error('Result lookup failed', {
            category: error.category || 'database',
            statusCode: error.statusCode || 503,
        });
        return errorResponse(res, 'Unable to load scan result', 503, 'RESULT_FETCH_FAILED');
    }
};

export const getResult = asyncHandler(createResultHandler());

export default { getResult };
