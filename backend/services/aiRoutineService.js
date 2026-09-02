import axios from 'axios';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import {
    finalizeProviderCall,
    reserveProviderCall,
} from './providerBudgetService.js';

export const OPENAI_API_TIMEOUT = 15_000;
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_ROUTINE_MODEL = 'gpt-4o-mini-2024-07-18';

const CATALOG = Object.freeze({
    gentle_cleanser: {
        name: 'Gentle cleanser',
        instructions: 'Cleanse gently with lukewarm water and pat dry.',
        active: false,
    },
    hydrating_serum: {
        name: 'Hydrating serum',
        instructions: 'Apply a simple fragrance-free hydrating serum to slightly damp skin.',
        active: false,
    },
    barrier_moisturizer: {
        name: 'Barrier moisturizer',
        instructions: 'Apply a fragrance-free moisturizer to support the skin barrier.',
        active: false,
    },
    spf_30_plus: {
        name: 'Broad-spectrum SPF 30+',
        instructions: 'Apply broad-spectrum SPF 30+ as the final morning step and reapply as directed.',
        active: false,
    },
    salicylic_acid: {
        name: 'Salicylic acid treatment',
        instructions: 'Use one gentle salicylic-acid treatment at night as directed on its label.',
        active: true,
    },
    niacinamide: {
        name: 'Niacinamide serum',
        instructions: 'Apply a gentle niacinamide serum at night as directed on its label.',
        active: true,
    },
    lactic_acid: {
        name: 'Lactic acid treatment',
        instructions: 'Use one gentle lactic-acid treatment at night as directed on its label.',
        active: true,
    },
});

const CATALOG_KEYS = Object.freeze(Object.keys(CATALOG));
const ACTIVE_KEYS = new Set(CATALOG_KEYS.filter((key) => CATALOG[key].active));

const ConcernSchema = z.object({
    key: z.string().min(1),
    severity: z.enum(['mild', 'moderate', 'severe']),
});

const SkinDataSchema = z.object({
    skinType: z.string().min(1),
    concerns: z.array(ConcernSchema).default([]),
});

const ModelRoutineSchema = z.object({
    morning: z.array(z.enum(CATALOG_KEYS)).min(3).max(4),
    night: z.array(z.enum(CATALOG_KEYS)).min(3).max(4),
});

const RoutineSchema = z.object({
    schemaVersion: z.literal(1),
    source: z.enum(['openai', 'fallback']),
    morning: z.array(z.object({
        name: z.string().min(1),
        instructions: z.string().min(1),
    })).min(3).max(4),
    night: z.array(z.object({
        name: z.string().min(1),
        instructions: z.string().min(1),
    })).min(3).max(4),
    safety: z.object({
        patchTest: z.string().min(1),
        spf: z.string().min(1),
        cautions: z.string().min(1),
        disclaimer: z.string().min(1),
        dermatologist: z.string().nullable(),
    }),
});

export const ROUTINE_RESPONSE_FORMAT = Object.freeze({
    type: 'json_schema',
    json_schema: {
        name: 'tejai_skin_routine',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                morning: {
                    type: 'array',
                    minItems: 3,
                    maxItems: 4,
                    items: { type: 'string', enum: CATALOG_KEYS },
                },
                night: {
                    type: 'array',
                    minItems: 3,
                    maxItems: 4,
                    items: { type: 'string', enum: CATALOG_KEYS },
                },
            },
            required: ['morning', 'night'],
        },
    },
});

const DEFAULT_SAFETY = Object.freeze({
    patchTest: 'Patch-test every new product before using it on your full face.',
    spf: 'Use broad-spectrum SPF 30+ every morning, even on cloudy days.',
    cautions: 'If pregnant, breastfeeding, managing allergies or sensitive skin, or taking medication, check with a qualified clinician before starting new actives.',
    disclaimer: 'This is cosmetic wellness guidance, not a medical diagnosis or treatment plan.',
});

const labelToConcernKey = (label) => {
    const normalized = label.toLowerCase();
    if (normalized.includes('pigment') || normalized.includes('tone')) return 'pigmentation';
    if (normalized.includes('dry') || normalized.includes('dehydrat')) return 'dehydration';
    if (normalized.includes('oil')) return 'oiliness';
    if (normalized.includes('pore')) return 'pores';
    if (normalized.includes('blackhead')) return 'blackheads';
    if (normalized.includes('wrinkle')) return 'wrinkles';
    if (normalized.includes('dark circle')) return 'dark_circles';
    if (normalized.includes('sensitiv')) return 'sensitivity';
    if (normalized.includes('texture')) return 'texture';
    if (normalized.includes('acne')) return 'acne';
    return 'general';
};

const normalizeConcerns = (concerns = []) => concerns.map((concern) => {
    if (typeof concern === 'string') {
        return { key: labelToConcernKey(concern), severity: 'mild' };
    }
    return concern;
});

const normalizeInput = (skinData) => SkinDataSchema.parse({
    ...skinData,
    concerns: normalizeConcerns(skinData.concerns),
});

const hasConcern = (concerns, keys, minimumSeverity = 'mild') => {
    const severityRank = { mild: 0, moderate: 1, severe: 2 };
    return concerns.some((concern) => keys.includes(concern.key)
        && severityRank[concern.severity] >= severityRank[minimumSeverity]);
};

const fallbackTokensFor = (concerns) => {
    if (hasConcern(concerns, ['sensitivity', 'dehydration'], 'moderate')) {
        return {
            morning: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer', 'spf_30_plus'],
            night: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer'],
        };
    }

    let active;
    if (hasConcern(concerns, ['acne', 'pores', 'blackheads', 'oiliness'])) active = 'salicylic_acid';
    else if (hasConcern(concerns, ['pigmentation'])) active = 'niacinamide';
    else if (hasConcern(concerns, ['texture'])) active = 'lactic_acid';

    return {
        morning: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer', 'spf_30_plus'],
        night: ['gentle_cleanser', ...(active ? [active] : ['hydrating_serum']), 'barrier_moisturizer'],
    };
};

const safetyFor = (concerns) => ({
    ...DEFAULT_SAFETY,
    dermatologist: concerns.some((concern) => concern.severity === 'severe')
        ? 'A severe concern was detected. Consider seeing a dermatologist for personalized advice.'
        : null,
});

const toPublicRoutine = (tokens, source, concerns) => {
    const routine = {
        schemaVersion: 1,
        source,
        morning: tokens.morning.map((token) => CATALOG[token]),
        night: tokens.night.map((token) => CATALOG[token]),
        safety: safetyFor(concerns),
    };
    return RoutineSchema.parse(routine);
};

const validateTokens = (tokens) => {
    const morning = [...new Set(tokens.morning)];
    const night = [...new Set(tokens.night)];
    const all = [...morning, ...night];
    const activeCount = all.filter((token) => ACTIVE_KEYS.has(token)).length;

    if (morning.length < 3 || morning.length > 4 || night.length < 3 || night.length > 4) return false;
    if (morning[morning.length - 1] !== 'spf_30_plus') return false;
    if (activeCount > 1) return false;
    return true;
};

const parseStructuredResponse = (response) => {
    const message = response?.data?.choices?.[0]?.message;
    if (!message || message.refusal || typeof message.content !== 'string') {
        throw new Error('Structured routine response unavailable');
    }
    return ModelRoutineSchema.parse(JSON.parse(message.content));
};

const readTokenUsage = (response) => {
    const inputUnits = Number(response?.data?.usage?.prompt_tokens);
    const outputUnits = Number(response?.data?.usage?.completion_tokens);
    return {
        inputUnits: Number.isInteger(inputUnits) && inputUnits >= 0 ? inputUnits : 0,
        outputUnits: Number.isInteger(outputUnits) && outputUnits >= 0 ? outputUnits : 0,
        estimatedCostMicros: 0,
    };
};

const failureOutcome = (error) => {
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'timeout';
    if (error?.response?.status === 429) return 'quota';
    if (error?.response?.data?.choices?.[0]?.message?.refusal) return 'refusal';
    if (error instanceof SyntaxError || error instanceof z.ZodError) return 'invalid_response';
    return 'unavailable';
};

const buildPrompt = (skinData) => [
    'Choose a conservative cosmetic skincare routine from the allowed catalog tokens.',
    'Return only the schema-bound JSON object. Do not write instructions, diagnoses, medical claims, or product names.',
    `Derived scan data: ${JSON.stringify({ skinType: skinData.skinType, concerns: skinData.concerns })}`,
    `Allowed tokens: ${CATALOG_KEYS.join(', ')}. Use at most one treatment token total; always end morning with spf_30_plus.`,
].join('\n');

const createFallback = (skinData) => toPublicRoutine(fallbackTokensFor(skinData.concerns), 'fallback', skinData.concerns);

export const createRoutineGenerator = ({
    httpClient = axios,
    runtimeEnv = env,
    routineLogger = logger,
    reserveBudget = reserveProviderCall,
    finalizeBudget = finalizeProviderCall,
} = {}) => async (skinData) => {
    const parsedSkinData = normalizeInput(skinData);
    const fallback = createFallback(parsedSkinData);

    if (!runtimeEnv.OPENAI_API_KEY) {
        routineLogger.warn('OPENAI_API_KEY missing. Using fallback routine.');
        return fallback;
    }

    let budgetReservationId = null;
    try {
        const reservation = await reserveBudget(
            'openai',
            runtimeEnv.OPENAI_DAILY_CALL_LIMIT
        );
        budgetReservationId = reservation.reservationId;
    } catch (error) {
        routineLogger.warn('Using fallback routine because AI capacity is unavailable', {
            provider: 'openai',
            code: error.publicCode || 'PROVIDER_BUDGET_UNAVAILABLE',
        });
        return fallback;
    }

    const finalizeSafely = async (details) => {
        if (!budgetReservationId) return;
        const reservationId = budgetReservationId;
        budgetReservationId = null;
        try {
            await finalizeBudget(reservationId, details);
        } catch (error) {
            routineLogger.error('AI usage finalization failed', {
                provider: 'openai',
                code: error.publicCode || 'PROVIDER_BUDGET_UNAVAILABLE',
            });
        }
    };

    try {
        const response = await httpClient.post(
            OPENAI_API_URL,
            {
                model: OPENAI_ROUTINE_MODEL,
                messages: [
                    { role: 'system', content: 'You select only from an allowlisted cosmetic routine catalog.' },
                    { role: 'user', content: buildPrompt(parsedSkinData) },
                ],
                temperature: 0,
                max_tokens: 500,
                store: false,
                response_format: ROUTINE_RESPONSE_FORMAT,
            },
            {
                headers: {
                    Authorization: `Bearer ${runtimeEnv.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: OPENAI_API_TIMEOUT,
            }
        );

        const modelTokens = parseStructuredResponse(response);
        if (!validateTokens(modelTokens)) throw new Error('Routine catalog rules rejected the response');
        const routine = toPublicRoutine(modelTokens, 'openai', parsedSkinData.concerns);
        await finalizeSafely({
            state: 'succeeded',
            outcome: 'success',
            ...readTokenUsage(response),
        });
        routineLogger.info('AI routine generated', {
            provider: 'openai',
            outcome: 'success',
        });
        return routine;
    } catch (error) {
        await finalizeSafely({
            state: 'failed',
            outcome: failureOutcome(error),
        });
        routineLogger.warn('Using fallback routine due to generation error', {
            status: error.response?.status,
            code: error.code,
            provider: 'openai',
        });
        return fallback;
    }
};

export const generateRoutine = createRoutineGenerator();

export const generateAIRoutine = async (skinTypeOrData, concerns = []) => {
    const skinData = typeof skinTypeOrData === 'object'
        ? skinTypeOrData
        : { skinType: skinTypeOrData, concerns };
    return generateRoutine(skinData);
};

export { CATALOG, RoutineSchema, ModelRoutineSchema, normalizeInput };

export default { generateRoutine, generateAIRoutine, createRoutineGenerator };
