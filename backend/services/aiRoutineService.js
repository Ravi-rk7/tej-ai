import axios from 'axios';
import { z } from 'zod';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const OPENAI_API_TIMEOUT = 15000; // 15 seconds
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const RoutineSchema = z.object({
    morning: z.array(z.string().min(1)).min(3).max(4),
    night: z.array(z.string().min(1)).min(3).max(4),
});

const SkinDataSchema = z.object({
    skinType: z.string().min(1),
    concerns: z.array(z.string().min(1)).default([]),
});

const GENERIC_STEP_BY_CONCERN = {
    acne: 'Salicylic Acid',
    pigmentation: 'Niacinamide',
    texture: 'Lactic Acid',
};

const normalizeConcern = (concern) => concern.toLowerCase().trim();

const dedupe = (items) => [...new Set(items)];

const buildFallbackRoutine = ({ concerns }) => {
    const normalizedConcerns = concerns.map(normalizeConcern);
    const hasAcne = normalizedConcerns.some((concern) => concern.includes('acne'));
    const hasPigmentation = normalizedConcerns.some((concern) => concern.includes('pigmentation') || concern.includes('tone'));
    const hasTexture = normalizedConcerns.some((concern) => concern.includes('texture'));

    const morningTreatment = hasPigmentation
        ? GENERIC_STEP_BY_CONCERN.pigmentation
        : (hasAcne ? 'Niacinamide' : 'Hydrating Serum');

    const nightTreatment = hasAcne
        ? GENERIC_STEP_BY_CONCERN.acne
        : (hasTexture ? GENERIC_STEP_BY_CONCERN.texture : (hasPigmentation ? GENERIC_STEP_BY_CONCERN.pigmentation : 'Hydrating Serum'));

    return {
        morning: ['Cleanser', morningTreatment, 'Moisturizer', 'SPF'],
        night: ['Cleanser', nightTreatment, 'Moisturizer'],
    };
};

const enforceRoutineRules = (routine, fallbackRoutine) => {
    const trimStep = (step) => step.trim();

    const normalizeSteps = (steps, fallbackSteps) => {
        const cleaned = dedupe((steps || []).map(trimStep).filter(Boolean));
        const bounded = cleaned.slice(0, 4);
        if (bounded.length < 3) {
            return fallbackSteps;
        }
        return bounded;
    };

    return {
        morning: normalizeSteps(routine.morning, fallbackRoutine.morning),
        night: normalizeSteps(routine.night, fallbackRoutine.night),
    };
};

const parseRoutineText = (content) => {
    const raw = content.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
    return JSON.parse(raw);
};

/**
 * Generate personalized AI routine.
 * Input: { skinType, concerns }
 * Returns { morning: [...], night: [...] }
 */
export const generateRoutine = async (skinData) => {
    const parsedSkinData = SkinDataSchema.parse(skinData);
    const fallbackRoutine = buildFallbackRoutine(parsedSkinData);

    if (!env.OPENAI_API_KEY) {
        logger.warn('OPENAI_API_KEY missing. Using fallback routine.');
        return fallbackRoutine;
    }

    try {
        const prompt = `You are a skincare expert. Generate a simple, beginner-friendly skincare routine.

Skin Type: ${parsedSkinData.skinType}
Concerns: ${parsedSkinData.concerns.join(', ') || 'None'}

Rules:
- Keep each routine 3 to 4 steps only
- Only return valid JSON, no markdown, no preamble
- Use realistic product types (not brand names)
- Keep output deterministic and conservative

Return ONLY this JSON format:
{
  "morning": ["Cleanser", "Niacinamide", "Moisturizer", "SPF"],
  "night": ["Cleanser", "Treatment", "Moisturizer"]
}`;

        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                top_p: 1,
                max_tokens: 500,
            },
            {
                headers: {
                    'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: OPENAI_API_TIMEOUT,
            }
        );

        const content = response.data?.choices?.[0]?.message?.content || '';
        const routine = parseRoutineText(content);
        const validatedRoutine = RoutineSchema.parse(routine);
        const enforcedRoutine = enforceRoutineRules(validatedRoutine, fallbackRoutine);

        logger.info('AI routine generated', {
            skinType: parsedSkinData.skinType,
            concernsCount: parsedSkinData.concerns.length,
        });

        return enforcedRoutine;
    } catch (error) {
        logger.error('OpenAI API error', {
            message: error.message,
            status: error.response?.status,
        });

        // Fallback routine if generation fails.
        logger.warn('Using fallback routine due to generation error');
        return fallbackRoutine;
    }
};

/**
 * Backward-compatible adapter used by existing controller code.
 */
export const generateAIRoutine = async (skinType, concerns = []) =>
    generateRoutine({ skinType, concerns });

export default { generateRoutine, generateAIRoutine };
