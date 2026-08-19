import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { runSkinAnalysis } from '../services/skinAnalysisService.js';
import { generateAIRoutine } from '../services/aiRoutineService.js';
import { calculateGlowScore } from '../services/glowScoreService.js';
import { saveSkinAnalysis } from '../services/supabaseService.js';
import { releaseScanImage } from '../middleware/imageUploadMiddleware.js';

/**
 * POST /api/scan
 * Analyze one validated, normalized, transient in-memory JPEG.
 */
export const createScanHandler = ({
    analyzeSkin = runSkinAnalysis,
    calculateScore = calculateGlowScore,
    generateRoutine = generateAIRoutine,
    saveAnalysis = saveSkinAnalysis,
    scanLogger = logger,
    releaseImage = releaseScanImage,
} = {}) => async (req, res) => {
    const userId = req.user.id;

    try {
        scanLogger.info('Scan request started', {
            width: req.scanImage.width,
            height: req.scanImage.height,
        });

        let skinAnalysis;
        try {
            skinAnalysis = await analyzeSkin(req.scanImage.buffer);
        } catch (serviceError) {
            const statusCode = serviceError.statusCode || 502;
            const message = serviceError.publicMessage || 'Skin analysis service is unavailable';
            scanLogger.warn('Skin analysis service failed', {
                statusCode,
                category: serviceError.category || 'unknown',
                code: serviceError.publicCode,
            });
            return errorResponse(res, message, statusCode, serviceError.publicCode);
        }

        const { skinType, concerns, metrics } = skinAnalysis;
        const { score: glowScore, trend } = await calculateScore(metrics, userId);
        const routine = await generateRoutine(skinType, concerns);

        await saveAnalysis(userId, {
            glowScore,
            skinType,
            concerns,
            routine,
            rawApiResponse: { metrics },
            faceMaps: {},
        });

        scanLogger.info('Scan completed successfully', { glowScore, trend });

        return successResponse(res, {
            glowScore,
            concerns,
            routine,
            ...(!req.scanImage.meetsRecommendedFaceCanvas
                ? {
                    imageGuidance: 'For best results, use a photo where the face is at least 400px wide.',
                }
                : {}),
        });
    } catch (error) {
        scanLogger.error('Scan endpoint failed', {
            category: error.category || 'internal',
        });
        return errorResponse(res, 'Unable to process scan request', 500);
    } finally {
        releaseImage(req);
    }
};

export const scan = asyncHandler(createScanHandler());

export default { scan };
