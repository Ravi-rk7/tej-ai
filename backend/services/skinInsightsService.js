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

const domainScoreInfo = z.object({
    totalScore: ScoreSchema,
    skinTypeScore: ScoreSchema,
    darkCircleScore: ScoreSchema,
    wrinkleScore: ScoreSchema,
    oilyIntensityScore: ScoreSchema,
    poresScore: ScoreSchema,
    blackheadScore: ScoreSchema,
    acneScore: ScoreSchema,
    sensitivityScore: ScoreSchema,
    melaninScore: ScoreSchema,
    waterScore: ScoreSchema,
    roughScore: ScoreSchema,
});

const severityRank = Object.freeze({ severe: 0, moderate: 1, mild: 2 });

/**
 * Convert provider health scores into the single canonical Day 5 insight shape.
 * Provider scores are health scores: higher values are healthier.
 */
export const deriveSkinInsights = (scoreInfo) => {
    const parsed = domainScoreInfo.parse(scoreInfo);
    const healthScores = Object.fromEntries(
        CONCERN_DEFINITIONS.map(({ key, scoreField }) => [key, parsed[scoreField]])
    );

    const concernDetails = CONCERN_DEFINITIONS
        .map(({ key, label, scoreField }, definitionIndex) => {
            const score = parsed[scoreField];
            const severity = severityForScore(score);
            return { key, label, score, severity, definitionIndex };
        })
        .filter((concern) => concern.severity !== 'none')
        .sort((left, right) => (
            severityRank[left.severity] - severityRank[right.severity]
            || left.score - right.score
            || left.definitionIndex - right.definitionIndex
        ))
        .map(({ key, label, score, severity }) => ({ key, label, score, severity }));

    return {
        glowScore: parsed.totalScore,
        concernDetails,
        concerns: concernDetails.map((concern) => concern.label),
        metrics: {
            schemaVersion: 1,
            totalScore: parsed.totalScore,
            healthScores,
            concernDetails,
        },
    };
};

export default { deriveSkinInsights, severityForScore, CONCERN_DEFINITIONS };
