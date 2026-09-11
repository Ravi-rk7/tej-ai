import { z } from 'zod';

const ScoreSchema = z.number().int().min(0).max(100);

export const CONCERN_DEFINITIONS = Object.freeze([
    { key: 'dark_circles', label: 'Dark circles', scoreField: 'darkCircleScore' },
    { key: 'wrinkles', label: 'Wrinkles', scoreField: 'wrinkleScore' },
    { key: 'oiliness', label: 'Oiliness', scoreField: 'oilyIntensityScore' },
    { key: 'pores', label: 'Pores', scoreField: 'poresScore' },
    { key: 'blackheads', label: 'Blackheads', scoreField: 'blackheadScore' },
    { key: 'acne', label: 'Acne', scoreField: 'acneScore' },
    { key: 'sensitivity', label: 'Sensitivity', scoreField: 'sensitivityScore' },
    { key: 'pigmentation', label: 'Pigmentation', scoreField: 'melaninScore' },
    { key: 'dehydration', label: 'Dryness / dehydration', scoreField: 'waterScore' },
    { key: 'texture', label: 'Texture', scoreField: 'roughScore' },
]);

export const severityForScore = (score) => {
    const validatedScore = ScoreSchema.parse(score);
    if (validatedScore >= 90) return 'none';
    if (validatedScore >= 70) return 'mild';
    if (validatedScore >= 50) return 'moderate';
    return 'severe';
};
