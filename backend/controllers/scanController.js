import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { runSkinAnalysis } from '../services/skinAnalysisService.js';
import { generateAIRoutine } from '../services/aiRoutineService.js';
import { calculateGlowScore } from '../services/glowScoreService.js';
import { deriveSkinInsights } from '../services/skinInsightsService.js';
import { saveSkinAnalysis } from '../services/supabaseService.js';
import { buildQualityWarnings, serializeScanResult } from '../services/scanResultService.js';
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

        const { skinType, scoreInfo } = skinAnalysis;
        const insights = deriveSkinInsights(scoreInfo);
        const { trend } = await calculateScore(scoreInfo, userId);
        const routine = await generateRoutine({
            skinType,
            concerns: insights.concernDetails,
        });

        const savedScan = await saveAnalysis(userId, {
            glowScore: insights.glowScore,
            skinType,
            concerns: insights.concerns,
            concernDetails: insights.concernDetails,
            metrics: {
                ...insights.metrics,
                qualityWarnings: buildQualityWarnings({
                    scanImage: req.scanImage,
                    imageQuality: skinAnalysis.imageQuality,
                }),
            },
            provider: skinAnalysis.provider,
            providerVersion: skinAnalysis.provider?.version,
            routine,
        });

        const result = serializeScanResult({
            ...savedScan,
            glow_score: savedScan?.glow_score ?? insights.glowScore,
            skin_type: savedScan?.skin_type ?? skinType,
            concerns: savedScan?.concerns ?? insights.concerns,
            metrics: savedScan?.metrics ?? {
                ...insights.metrics,
                qualityWarnings: buildQualityWarnings({
                    scanImage: req.scanImage,
                    imageQuality: skinAnalysis.imageQuality,
                }),
            },
            routine: savedScan?.routine ?? routine,
        });

        scanLogger.info('Scan completed successfully', {
            glowScore: insights.glowScore,
            trend,
            routineSource: routine.source,
        });

        return successResponse(res, result);
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
