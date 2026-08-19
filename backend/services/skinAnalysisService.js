import axios from 'axios';
import FormData from 'form-data';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { MAX_IMAGE_BYTES } from './imageService.js';

const API_TIMEOUT_MS = 8000;
const RETRY_ATTEMPTS = 1;
const MAX_PROVIDER_BODY_BYTES = MAX_IMAGE_BYTES + (256 * 1024);

const ExternalMetricSchema = z.union([
    z.number(),
    z.object({
        score: z.number().optional(),
        value: z.number().optional(),
    }).passthrough(),
]).optional();

const ResultSchema = z.object({
    skin_type: z.union([z.string(), z.number(), z.object({
        skin_type: z.union([z.string(), z.number()]).optional(),
    }).passthrough()]).optional(),
    skinType: z.string().optional(),
    acne: ExternalMetricSchema,
    pigmentation: ExternalMetricSchema,
    skin_spot: ExternalMetricSchema,
    texture: ExternalMetricSchema,
}).passthrough();

const ExternalResponseSchema = z.object({
    error_code: z.number().optional(),
    error_msg: z.string().optional(),
    result: ResultSchema.optional(),
}).merge(ResultSchema).passthrough();

const buildServiceError = (publicMessage, statusCode, details, publicCode) => {
    const error = new Error(publicMessage);
    error.publicMessage = publicMessage;
    error.statusCode = statusCode;
    error.publicCode = publicCode;
    if (details) {
        error.details = details;
    }
    return error;
};

const clampMetric = (value) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
};

const extractMetric = (metricValue) => {
    if (typeof metricValue === 'number') {
        return clampMetric(metricValue);
    }
    return clampMetric(metricValue?.score ?? metricValue?.value);
};

const titleCase = (value) => String(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');

const shouldRetry = (error, attempt) => {
    if (attempt >= RETRY_ATTEMPTS || !axios.isAxiosError(error)) {
        return false;
    }

    if (error.code === 'ECONNABORTED' || !error.response) {
        return true;
    }

    return error.response.status >= 500;
};

const normalizeResponse = (apiData) => {
    const parsed = ExternalResponseSchema.parse(apiData);

    if (parsed.error_code && parsed.error_code !== 0) {
        throw buildServiceError(
            'Skin analysis request was rejected',
            400,
            parsed.error_msg,
            'SKIN_ANALYSIS_REJECTED'
        );
    }

    const result = parsed.result || parsed;
    const metrics = {
        acne: extractMetric(result.acne),
        pigmentation: extractMetric(result.pigmentation ?? result.skin_spot),
        texture: extractMetric(result.texture),
    };

    const concerns = [];
    if (metrics.acne >= 50) concerns.push('Acne');
    if (metrics.pigmentation >= 50) concerns.push('Pigmentation');
    if (metrics.texture < 40) concerns.push('Texture');

    const skinTypeValue = typeof result.skin_type === 'object'
        ? result.skin_type.skin_type
        : (result.skin_type ?? result.skinType ?? 'Unknown');

    return {
        skinType: titleCase(skinTypeValue),
        concerns,
        metrics,
    };
};

export const createProviderForm = (imageBuffer) => {
    const form = new FormData();
    form.append('image', imageBuffer, {
        filename: 'scan.jpg',
        contentType: 'image/jpeg',
        knownLength: imageBuffer.length,
    });
    return form;
};

/**
 * Send transient JPEG bytes directly to AILabTools using its multipart API.
 */
export const runSkinAnalysis = async (imageBuffer) => {
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        throw buildServiceError('A processed scan image is required', 500);
    }

    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt += 1) {
        try {
            const form = createProviderForm(imageBuffer);
            const response = await axios.post(env.AILAB_API_URL, form, {
                headers: {
                    ...form.getHeaders(),
                    'ailabapi-api-key': env.AILAB_API_KEY,
                },
                timeout: API_TIMEOUT_MS,
                maxBodyLength: MAX_PROVIDER_BODY_BYTES,
                maxContentLength: MAX_PROVIDER_BODY_BYTES,
            });

            const normalized = normalizeResponse(response.data);
            logger.info('Skin analysis completed', {
                skinType: normalized.skinType,
                attempt: attempt + 1,
            });
            return normalized;
        } catch (error) {
            if (error.publicMessage) {
                throw error;
            }

            if (error instanceof z.ZodError) {
                throw buildServiceError('Skin analysis response format is invalid', 502);
            }

            if (shouldRetry(error, attempt)) {
                logger.warn('Skin analysis request failed, retrying once', {
                    attempt: attempt + 1,
                    reason: error.message,
                    status: error.response?.status,
                });
                continue;
            }

            logger.error('Skin analysis API error', {
                message: error.message,
                status: error.response?.status,
            });

            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED') {
                    throw buildServiceError('Skin analysis service timed out', 504);
                }

                if (error.response) {
                    const statusCode = error.response.status >= 500 ? 502 : 400;
                    const message = statusCode === 502
                        ? 'Skin analysis service request failed'
                        : 'Skin analysis request was rejected';
                    throw buildServiceError(message, statusCode);
                }

                throw buildServiceError('Skin analysis service is unavailable', 502);
            }

            throw buildServiceError('Skin analysis failed', 500);
        }
    }

    throw buildServiceError('Skin analysis failed after retry', 502);
};

export const analyzeSkinWithAILab = runSkinAnalysis;

export default { runSkinAnalysis, analyzeSkinWithAILab };
