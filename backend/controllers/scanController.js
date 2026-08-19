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
export const scan = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        logger.info('Scan request started', {
            userId,
            width: req.scanImage.width,
            height: req.scanImage.height,
        });

        let skinAnalysis;
        try {
            skinAnalysis = await runSkinAnalysis(req.scanImage.buffer);
        } catch (serviceError) {
            const statusCode = serviceError.statusCode || 502;
            const message = serviceError.publicMessage || 'Skin analysis service is unavailable';
            logger.warn('Skin analysis service failed', {
                userId,
                statusCode,
                error: serviceError.message,
            });
            return errorResponse(res, message, statusCode, serviceError.publicCode);
        }

        const { skinType, concerns, metrics } = skinAnalysis;
        const { score: glowScore, trend } = await calculateGlowScore(metrics, userId);
        const routine = await generateAIRoutine(skinType, concerns);

        await saveSkinAnalysis(userId, {
            glowScore,
            skinType,
            concerns,
            routine,
            rawApiResponse: { metrics },
            faceMaps: {},
        });

        logger.info('Scan completed successfully', { userId, glowScore, trend });

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
        logger.error('Scan endpoint failed', {
            userId,
            message: error.message,
        });
        return errorResponse(res, 'Unable to process scan request', 500);
    } finally {
        releaseScanImage(req);
    }
});

export default { scan };
