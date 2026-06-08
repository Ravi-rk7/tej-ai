import axios from 'axios';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const API_TIMEOUT_MS = 8000;
const RETRY_ATTEMPTS = 1;
const AILAB_SKIN_ANALYSIS_URL = 'https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro';

const ImageUrlSchema = z.string().url('Invalid image URL format');

const ExternalMetricSchema = z.union([
    z.number(),
    z.object({
        score: z.number().optional(),
    }).passthrough(),
]).optional();

const ExternalResponseSchema = z.object({
    skin_type: z.string().optional(),
    skinType: z.string().optional(),
    acne: ExternalMetricSchema,
    pigmentation: ExternalMetricSchema,
    texture: ExternalMetricSchema,
}).passthrough();

const buildServiceError = (publicMessage, statusCode, details) => {
    const error = new Error(publicMessage);
    error.publicMessage = publicMessage;
    error.statusCode = statusCode;
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
    return clampMetric(metricValue?.score);
};

const titleCase = (value) => value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');

const isPrivateIpv4Host = (hostname) => {
    const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) {
        return false;
    }

    const octets = match.slice(1).map(Number);
    if (octets.some((part) => part < 0 || part > 255)) {
        return true;
    }

    const [a, b] = octets;
    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
};

const validateImageUrlSecurity = (imageUrl) => {
    const parsed = new URL(imageUrl);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw buildServiceError('imageUrl must use http or https', 400);
    }

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || host.startsWith('127.')) {
        throw buildServiceError('imageUrl host is not allowed', 400);
    }

    if (isPrivateIpv4Host(host) || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
        throw buildServiceError('imageUrl host is not allowed', 400);
    }

    const allowedDomainsRaw = process.env.SKIN_ANALYSIS_ALLOWED_DOMAINS;
    if (allowedDomainsRaw) {
        const allowedDomains = allowedDomainsRaw
            .split(',')
            .map((domain) => domain.trim().toLowerCase())
            .filter(Boolean);

        const isAllowed = allowedDomains.some((allowedDomain) => (
            host === allowedDomain || host.endsWith(`.${allowedDomain}`)
        ));

        if (!isAllowed) {
            throw buildServiceError('imageUrl domain is not allowed', 400);
        }
    }
};

const shouldRetry = (error, attempt) => {
    if (attempt >= RETRY_ATTEMPTS) {
        return false;
    }
    if (!axios.isAxiosError(error)) {
        return false;
    }

    if (error.code === 'ECONNABORTED' || !error.response) {
        return true;
    }

    return error.response.status >= 500;
};

const normalizeResponse = (apiData) => {
    const parsed = ExternalResponseSchema.parse(apiData);

    const metrics = {
        acne: extractMetric(parsed.acne),
        pigmentation: extractMetric(parsed.pigmentation),
        texture: extractMetric(parsed.texture),
    };

    const concerns = [];
    if (metrics.acne >= 50) concerns.push('Acne');
    if (metrics.pigmentation >= 50) concerns.push('Pigmentation');
    if (metrics.texture < 40) concerns.push('Texture');

    return {
        skinType: titleCase(parsed.skin_type || parsed.skinType || 'Unknown'),
        concerns,
        metrics,
    };
};

/**
 * Run skin analysis against external API and return normalized output.
 */
export const runSkinAnalysis = async (imageUrl) => {
    let validatedImageUrl = '';

    try {
        validatedImageUrl = ImageUrlSchema.parse(imageUrl);
        validateImageUrlSecurity(validatedImageUrl);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw buildServiceError(error.errors[0].message, 400);
        }
        throw error;
    }

    for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt += 1) {
        try {
            const response = await axios.post(
                AILAB_SKIN_ANALYSIS_URL,
                { image_url: validatedImageUrl },
                {
                    headers: {
                        'ailabapi-api-key': env.AILAB_API_KEY,
                        'Content-Type': 'application/json',
                    },
                    timeout: API_TIMEOUT_MS,
                }
            );

            const normalized = normalizeResponse(response.data);
            logger.info('Skin analysis completed', {
                skinType: normalized.skinType,
                attempt: attempt + 1,
            });
            return normalized;
        } catch (error) {
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
