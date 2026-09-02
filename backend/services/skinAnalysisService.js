import axios from 'axios';
import FormData from 'form-data';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { MAX_IMAGE_BYTES } from './imageService.js';
import {
    finalizeProviderCall,
    reserveProviderCall,
} from './providerBudgetService.js';

const API_TIMEOUT_MS = 8000;
const RETRY_ATTEMPTS = 1;
const MAX_PROVIDER_BODY_BYTES = MAX_IMAGE_BYTES + (256 * 1024);
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30_000;
const PROVIDER_OPERATION = 'skin-analysis-pro';
export const PROVIDER_NAME = 'ailabtools';
export const PROVIDER_VERSION = 'skin-analysis-pro-v1.7.1';

const ScoreSchema = z.number().int().min(0).max(100);
const RatioSchema = z.number().min(0).max(1);

export const ProviderRequestSchema = z.object({
    image: z.instanceof(Buffer).refine((value) => value.length > 0, {
        message: 'Image buffer must not be empty',
    }),
    mimeType: z.literal('image/jpeg'),
});

export const ProviderErrorDetailSchema = z.object({
    status_code: z.number().int().optional(),
    code: z.string(),
    code_message: z.string(),
    message: z.string(),
}).passthrough();

export const ProviderScoreInfoSchema = z.object({
    dark_circle_score: ScoreSchema,
    skin_type_score: ScoreSchema,
    wrinkle_score: ScoreSchema,
    oily_intensity_score: ScoreSchema,
    pores_score: ScoreSchema,
    blackhead_score: ScoreSchema,
    acne_score: ScoreSchema,
    sensitivity_score: ScoreSchema,
    melanin_score: ScoreSchema,
    water_score: ScoreSchema,
    rough_score: ScoreSchema,
    total_score: ScoreSchema,
    pores_type_score: z.object({
        pores_forehead_score: ScoreSchema,
        pores_leftcheek_score: ScoreSchema,
        pores_rightcheek_score: ScoreSchema,
        pores_jaw_score: ScoreSchema,
    }).passthrough().optional(),
    dark_circle_type_score: z.object({
        left_dark_circle_score: ScoreSchema,
        right_dark_circle_score: ScoreSchema,
    }).passthrough().optional(),
}).passthrough();

const FaceRectSchema = z.object({
    top: z.number(),
    left: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
}).passthrough();

const ProviderResultSchema = z.object({
    skin_type: z.object({
        skin_type: z.number().int().min(0).max(3),
    }).passthrough(),
    score_info: ProviderScoreInfoSchema,
    image_quality: z.object({
        face_ratio: RatioSchema,
        face_orientation: z.object({
            yaw: z.number(),
            pitch: z.number(),
            roll: z.number(),
        }).passthrough(),
        face_rect: FaceRectSchema,
        hair_occlusion: RatioSchema,
        glasses: z.number().int().min(0).max(1),
    }).passthrough().optional(),
    acne: z.object({
        count: z.number().int().nonnegative(),
    }).passthrough().optional(),
    melanin: z.object({
        brown_area: RatioSchema,
        melanin_concentration: ScoreSchema,
    }).passthrough().optional(),
    rough: z.object({
        rough_severity: ScoreSchema,
        rough_area: RatioSchema,
    }).passthrough().optional(),
    sensitivity: z.object({
        sensitivity_area: RatioSchema,
        sensitivity_intensity: ScoreSchema,
    }).passthrough().optional(),
}).passthrough();

export const ProviderSuccessResponseSchema = z.object({
    request_id: z.string().min(1),
    log_id: z.string().min(1),
    error_detail: ProviderErrorDetailSchema,
    face_rectangle: FaceRectSchema.optional(),
    result: ProviderResultSchema,
}).passthrough();

const ProviderEnvelopeSchema = z.object({
    request_id: z.string().optional(),
    log_id: z.string().optional(),
    error_code: z.number().optional(),
    error_msg: z.string().optional(),
    error_detail: ProviderErrorDetailSchema.optional(),
}).passthrough();

const SKIN_TYPES = Object.freeze({
    0: 'Oily',
    1: 'Dry',
    2: 'Neutral',
    3: 'Combination',
});

const QUALITY_ERROR_CODES = new Set([
    'ERROR_NO_FACE_IN_FILE',
    'ERROR_FACE_SIZE_NOT_MEET_REQUIREMENTS',
    'ERROR_FACE_SIZE_RATIO_NOT_MET',
    'ERROR_SMALL_FACE_SIZE',
    'ERROR_FACE_UNRECOGNIZABLE',
    'ERROR_POOR_FACE_QUALITY',
    'ERROR_BLURRY_FACE',
    'ERROR_OBSTRUCTED_FACE',
    'ERROR_POOR_FACE_LIGHTING',
    'ERROR_INCOMPLETE_FACE',
    'ERROR_FACE_NOT_FACING_FORWARD',
    'ERROR_QUALITY_SCORE_NOT_MEET_REQUIREMENTS',
    'ERROR_CARTOON_FACE_NOT_SUPPORTED',
]);

const QUALITY_MESSAGES = Object.freeze({
    ERROR_NO_FACE_IN_FILE: 'We could not find a face. Use a clear, front-facing portrait.',
    ERROR_BLURRY_FACE: 'The photo is too blurry. Retake it in focus and hold the camera steady.',
    ERROR_POOR_FACE_LIGHTING: 'The lighting is not suitable. Retake the photo in bright, even light.',
    ERROR_OBSTRUCTED_FACE: 'Part of the face is covered. Remove obstructions and retake the photo.',
    ERROR_INCOMPLETE_FACE: 'The full face must be visible. Center it in the frame and try again.',
    ERROR_FACE_NOT_FACING_FORWARD: 'Look straight at the camera and retake the photo.',
    ERROR_SMALL_FACE_SIZE: 'Move closer so your face fills more of the frame.',
    ERROR_FACE_SIZE_NOT_MEET_REQUIREMENTS: 'Move closer so your face fills more of the frame.',
    ERROR_FACE_SIZE_RATIO_NOT_MET: 'Move closer so your face fills more of the frame.',
});

const INVALID_IMAGE_ERROR_CODES = new Set([
    'ERROR_FILE_FORMAT_NOT_SUPPORTED',
    'ERROR_FILE_SIZE_EXCEEDED',
    'ERROR_IMAGE_SIZE_NOT_SUPPORTED',
    'ERROR_INVALID_FILE',
    'ERROR_FILE_DAMAGED',
]);

const TIMEOUT_ERROR_CODES = new Set([
    'AI_SERVICE_TIMEOUT',
    'ERROR_SERVICE_TIMEOUT',
]);

const createServiceError = ({
    publicMessage,
    statusCode,
    publicCode,
    category,
    providerCode,
    retryable = false,
    affectsCircuit = false,
}) => {
    const error = new Error(publicMessage);
    error.publicMessage = publicMessage;
    error.statusCode = statusCode;
    error.publicCode = publicCode;
    error.category = category;
    error.providerCode = providerCode;
    error.retryable = retryable;
    error.affectsCircuit = affectsCircuit;
    return error;
};

const qualityMessageFor = (providerCode) => QUALITY_MESSAGES[providerCode]
    || 'This photo does not meet the analysis quality requirements. Use a clear, front-facing portrait in even light.';

const isQualityErrorCode = (providerCode = '') => QUALITY_ERROR_CODES.has(providerCode)
    || providerCode.includes('OCCLUSION');

const mapProviderFailure = ({ status, providerCode }) => {
    if (isQualityErrorCode(providerCode)) {
        return createServiceError({
            publicMessage: qualityMessageFor(providerCode),
            statusCode: 422,
            publicCode: 'SCAN_IMAGE_QUALITY',
            category: 'image_quality',
            providerCode,
        });
    }

    if (TIMEOUT_ERROR_CODES.has(providerCode) || status === 504) {
        return createServiceError({
            publicMessage: 'Skin analysis timed out. Please try again in a moment.',
            statusCode: 504,
            publicCode: 'SKIN_PROVIDER_TIMEOUT',
            category: 'timeout',
            providerCode,
            retryable: true,
            affectsCircuit: true,
        });
    }

    if (status === 429) {
        return createServiceError({
            publicMessage: 'Skin analysis is busy right now. Please try again shortly.',
            statusCode: 503,
            publicCode: 'SKIN_PROVIDER_LIMITED',
            category: 'rate_limited',
            providerCode,
            retryable: true,
        });
    }

    if (status === 401 || status === 403) {
        return createServiceError({
            publicMessage: 'Skin analysis is temporarily unavailable. Please try again later.',
            statusCode: 503,
            publicCode: 'SKIN_PROVIDER_UNAVAILABLE',
            category: 'configuration',
            providerCode,
        });
    }

    if (status >= 500) {
        return createServiceError({
            publicMessage: 'Skin analysis is temporarily unavailable. Please try again in a moment.',
            statusCode: 503,
            publicCode: 'SKIN_PROVIDER_UNAVAILABLE',
            category: 'provider_unavailable',
            providerCode,
            retryable: true,
            affectsCircuit: true,
        });
    }

    if (INVALID_IMAGE_ERROR_CODES.has(providerCode) || status === 413 || status === 415) {
        return createServiceError({
            publicMessage: 'This photo could not be analyzed. Upload a clear front-facing JPEG.',
            statusCode: 422,
            publicCode: 'SCAN_IMAGE_REJECTED',
            category: 'invalid_image',
            providerCode,
        });
    }

    return createServiceError({
        publicMessage: 'This photo could not be analyzed. Check the image and try again.',
        statusCode: 422,
        publicCode: 'SCAN_IMAGE_REJECTED',
        category: 'provider_rejected',
        providerCode,
    });
};

const malformedResponseError = () => createServiceError({
    publicMessage: 'Skin analysis returned an invalid response. Please try again later.',
    statusCode: 502,
    publicCode: 'SKIN_PROVIDER_INVALID_RESPONSE',
    category: 'invalid_response',
});

const networkError = () => createServiceError({
    publicMessage: 'Skin analysis is temporarily unavailable. Please try again in a moment.',
    statusCode: 503,
    publicCode: 'SKIN_PROVIDER_UNAVAILABLE',
    category: 'network',
    retryable: true,
    affectsCircuit: true,
});

const timeoutError = () => createServiceError({
    publicMessage: 'Skin analysis timed out. Please try again in a moment.',
    statusCode: 504,
    publicCode: 'SKIN_PROVIDER_TIMEOUT',
    category: 'timeout',
    retryable: true,
    affectsCircuit: true,
});

const circuitOpenError = () => createServiceError({
    publicMessage: 'Skin analysis is temporarily unavailable. Please try again in a moment.',
    statusCode: 503,
    publicCode: 'SKIN_PROVIDER_UNAVAILABLE',
    category: 'circuit_open',
    retryable: true,
});

const scoreInfoToDomain = (scoreInfo) => ({
    totalScore: scoreInfo.total_score,
    darkCircleScore: scoreInfo.dark_circle_score,
    skinTypeScore: scoreInfo.skin_type_score,
    wrinkleScore: scoreInfo.wrinkle_score,
    oilyIntensityScore: scoreInfo.oily_intensity_score,
    poresScore: scoreInfo.pores_score,
    blackheadScore: scoreInfo.blackhead_score,
    acneScore: scoreInfo.acne_score,
    sensitivityScore: scoreInfo.sensitivity_score,
    melaninScore: scoreInfo.melanin_score,
    waterScore: scoreInfo.water_score,
    roughScore: scoreInfo.rough_score,
});

const parseProviderResponse = (apiData) => {
    const envelopeResult = ProviderEnvelopeSchema.safeParse(apiData);
    if (!envelopeResult.success) {
        throw malformedResponseError();
    }

    const envelope = envelopeResult.data;
    const providerCode = envelope.error_detail?.code || '';
    const legacyFailure = typeof envelope.error_code === 'number' && envelope.error_code !== 0;
    if (providerCode || legacyFailure) {
        throw mapProviderFailure({
            status: envelope.error_detail?.status_code || envelope.error_code || 400,
            providerCode: providerCode || envelope.error_msg || 'UNKNOWN_PROVIDER_ERROR',
        });
    }

    const responseResult = ProviderSuccessResponseSchema.safeParse(apiData);
    if (!responseResult.success) {
        throw malformedResponseError();
    }

    return responseResult.data;
};

export const normalizeProviderResponse = (apiData) => {
    const parsed = parseProviderResponse(apiData);
    const { result } = parsed;
    const scoreInfo = scoreInfoToDomain(result.score_info);

    return {
        skinType: SKIN_TYPES[result.skin_type.skin_type],
        scoreInfo,
        provider: {
            name: PROVIDER_NAME,
            version: PROVIDER_VERSION,
        },
        providerConcerns: {
            acneCount: result.acne?.count,
            pigmentationArea: result.melanin?.brown_area,
            pigmentationIntensity: result.melanin?.melanin_concentration,
            roughnessArea: result.rough?.rough_area,
            roughnessSeverity: result.rough?.rough_severity,
            sensitivityArea: result.sensitivity?.sensitivity_area,
            sensitivityIntensity: result.sensitivity?.sensitivity_intensity,
        },
        imageQuality: result.image_quality
            ? {
                faceRatio: result.image_quality.face_ratio,
                yaw: result.image_quality.face_orientation.yaw,
                pitch: result.image_quality.face_orientation.pitch,
                roll: result.image_quality.face_orientation.roll,
                hairOcclusion: result.image_quality.hair_occlusion,
                glasses: Boolean(result.image_quality.glasses),
            }
            : undefined,
    };
};

export const createCircuitBreaker = ({
    failureThreshold = CIRCUIT_FAILURE_THRESHOLD,
    cooldownMs = CIRCUIT_COOLDOWN_MS,
    now = Date.now,
} = {}) => {
    let state = 'CLOSED';
    let consecutiveFailures = 0;
    let openedAt = 0;

    return {
        allowRequest() {
            if (state !== 'OPEN') return true;
            if (now() - openedAt < cooldownMs) return false;
            state = 'HALF_OPEN';
            return true;
        },
        recordSuccess() {
            state = 'CLOSED';
            consecutiveFailures = 0;
            openedAt = 0;
        },
        recordFailure() {
            consecutiveFailures += 1;
            if (state === 'HALF_OPEN' || consecutiveFailures >= failureThreshold) {
                state = 'OPEN';
                openedAt = now();
            }
        },
        snapshot() {
            return { state, consecutiveFailures, openedAt };
        },
    };
};

const defaultCircuitBreaker = createCircuitBreaker();

export const createProviderForm = (imageBuffer) => {
    ProviderRequestSchema.parse({ image: imageBuffer, mimeType: 'image/jpeg' });
    const form = new FormData();
    form.append('image', imageBuffer, {
        filename: 'scan.jpg',
        contentType: 'image/jpeg',
        knownLength: imageBuffer.length,
    });
    return form;
};

const normalizeThrownError = (error) => {
    if (error.publicMessage) return error;
    if (error instanceof z.ZodError) return malformedResponseError();

    if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return timeoutError();
        }
        if (!error.response) return networkError();

        const envelope = ProviderEnvelopeSchema.safeParse(error.response.data);
        const providerCode = envelope.success
            ? envelope.data.error_detail?.code
            : undefined;
        return mapProviderFailure({
            status: error.response.status,
            providerCode: providerCode || 'UNKNOWN_PROVIDER_ERROR',
        });
    }

    return createServiceError({
        publicMessage: 'Skin analysis failed. Please try again later.',
        statusCode: 500,
        publicCode: 'SKIN_ANALYSIS_FAILED',
        category: 'internal',
    });
};

const budgetOutcomeFor = (error) => {
    if (error.category === 'timeout') return 'timeout';
    if (error.category === 'rate_limited') return 'quota';
    if (error.category === 'invalid_response') return 'invalid_response';
    return 'provider_error';
};

export const createSkinAnalysisService = ({
    httpClient = axios,
    apiUrl = env.AILAB_API_URL,
    apiKey = env.AILAB_API_KEY,
    serviceLogger = logger,
    timeoutMs = API_TIMEOUT_MS,
    retryAttempts = RETRY_ATTEMPTS,
    circuitBreaker = defaultCircuitBreaker,
    now = Date.now,
    reserveBudget = reserveProviderCall,
    finalizeBudget = finalizeProviderCall,
    providerDailyLimit = env.AILAB_DAILY_CALL_LIMIT,
} = {}) => ({
    async runSkinAnalysis(imageBuffer) {
        try {
            ProviderRequestSchema.parse({ image: imageBuffer, mimeType: 'image/jpeg' });
        } catch {
            throw createServiceError({
                publicMessage: 'A processed scan image is required.',
                statusCode: 500,
                publicCode: 'SCAN_IMAGE_MISSING',
                category: 'invalid_request',
            });
        }

        if (!circuitBreaker.allowRequest()) {
            throw circuitOpenError();
        }
        const isHalfOpenProbe = circuitBreaker.snapshot().state === 'HALF_OPEN';

        const startedAt = now();
        let finalError;

        for (let attempt = 0; attempt <= retryAttempts; attempt += 1) {
            let budgetReservationId = null;
            const finalizeBudgetSafely = async (details) => {
                if (!budgetReservationId) return;
                const reservationId = budgetReservationId;
                budgetReservationId = null;
                try {
                    await finalizeBudget(reservationId, details);
                } catch (error) {
                    // A reserved row still consumes capacity if finalization fails.
                    serviceLogger.error('Skin provider usage finalization failed', {
                        provider: 'ailabtools',
                        operation: PROVIDER_OPERATION,
                        code: error.publicCode || 'PROVIDER_BUDGET_UNAVAILABLE',
                    });
                }
            };

            try {
                const budgetReservation = await reserveBudget(
                    'ailabtools',
                    providerDailyLimit
                );
                budgetReservationId = budgetReservation.reservationId;
                const form = createProviderForm(imageBuffer);
                const response = await httpClient.post(apiUrl, form, {
                    headers: {
                        ...form.getHeaders(),
                        'ailabapi-api-key': apiKey,
                    },
                    timeout: timeoutMs,
                    maxBodyLength: MAX_PROVIDER_BODY_BYTES,
                    maxContentLength: MAX_PROVIDER_BODY_BYTES,
                });

                if (response.status !== 200) {
                    throw mapProviderFailure({
                        status: response.status,
                        providerCode: response.data?.error_detail?.code || 'UNKNOWN_PROVIDER_ERROR',
                    });
                }

                const normalized = normalizeProviderResponse(response.data);
                await finalizeBudgetSafely({ state: 'succeeded', outcome: 'success' });
                circuitBreaker.recordSuccess();
                serviceLogger.info('Skin provider request completed', {
                    provider: 'ailabtools',
                    operation: PROVIDER_OPERATION,
                    outcome: 'success',
                    latencyMs: Math.max(0, now() - startedAt),
                    attempt: attempt + 1,
                });
                return normalized;
            } catch (error) {
                const serviceError = normalizeThrownError(error);
                await finalizeBudgetSafely({
                    state: 'failed',
                    outcome: budgetOutcomeFor(serviceError),
                });
                finalError = serviceError;

                if (
                    serviceError.affectsCircuit
                    && !isHalfOpenProbe
                    && attempt < retryAttempts
                ) {
                    serviceLogger.warn('Skin provider request retrying', {
                        provider: 'ailabtools',
                        operation: PROVIDER_OPERATION,
                        outcome: 'retry',
                        category: serviceError.category,
                        providerCode: serviceError.providerCode,
                        attempt: attempt + 1,
                    });
                    continue;
                }
                break;
            }
        }

        if (finalError.affectsCircuit) {
            circuitBreaker.recordFailure();
        }

        const logMethod = finalError.category === 'image_quality' ? 'warn' : 'error';
        serviceLogger[logMethod]('Skin provider request failed', {
            provider: 'ailabtools',
            operation: PROVIDER_OPERATION,
            outcome: 'error',
            category: finalError.category,
            providerCode: finalError.providerCode,
            retryable: finalError.retryable,
            latencyMs: Math.max(0, now() - startedAt),
        });
        throw finalError;
    },
});

const defaultService = createSkinAnalysisService();

export const runSkinAnalysis = (imageBuffer) => defaultService.runSkinAnalysis(imageBuffer);
export const analyzeSkinWithAILab = runSkinAnalysis;

export default { runSkinAnalysis, analyzeSkinWithAILab };
