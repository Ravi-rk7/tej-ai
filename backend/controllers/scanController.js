import { z } from 'zod';
import logger from '../utils/logger.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/responseFormatter.js';
import { runSkinAnalysis } from '../services/skinAnalysisService.js';
import { generateAIRoutine } from '../services/aiRoutineService.js';
import { calculateGlowScore } from '../services/glowScoreService.js';
import { saveSkinAnalysis } from '../services/supabaseService.js';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.js';

const ScanRequestSchema = z.object({
    imageBase64: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    imageUrl: z.string().url('imageUrl must be a valid URL').optional(),
}).refine(
    (data) => data.imageBase64 || data.imageUrl,
    { message: 'Either imageBase64 or imageUrl must be provided' }
);

/**
 * POST /api/scan
 * Analyze remote image and run full skin analysis
 */
export const scan = asyncHandler(async (req, res) => {
    try {
        const body = ScanRequestSchema.parse(req.body);
        const userId = req.user.id;

        logger.info('Scan request started', { userId });

        let resolvedImageUrl = body.imageUrl;

        if (body.imageBase64) {
            const mimeType = body.mimeType || 'image/jpeg';
            const dataUri = `data:${mimeType};base64,${body.imageBase64}`;
            resolvedImageUrl = await uploadToCloudinary(dataUri);
        }

        let skinAnalysis;
        try {
            skinAnalysis = await runSkinAnalysis(resolvedImageUrl);
        } catch (serviceError) {
            const statusCode = serviceError.statusCode || 502;
            const message = serviceError.publicMessage || 'Skin analysis service is unavailable';
            logger.warn('Skin analysis service failed', {
                userId,
                statusCode,
                error: serviceError.message,
            });
            return errorResponse(res, message, statusCode);
        }

        const { skinType, concerns, metrics } = skinAnalysis;

        const { score: glowScore, trend } = await calculateGlowScore(metrics, userId);

        const routine = await generateAIRoutine(skinAnalysis.skinType, skinAnalysis.concerns);

        await saveSkinAnalysis(userId, {
            imageUrl: resolvedImageUrl,
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
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return errorResponse(res, error.errors[0].message, 400);
        }

        logger.error('Scan endpoint failed', {
            userId: req.user?.id,
            message: error.message,
        });
        return errorResponse(res, 'Unable to process scan request', 500);
    }
});

export default { scan };
