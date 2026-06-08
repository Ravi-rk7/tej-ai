import { getLatestScan } from './supabaseService.js';

const clampScore = (value) => Math.max(0, Math.min(100, value));

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * score = 100 - (acne * 20) - (pigmentation * 15) - (texture * 10)
 * Clamp result to [0, 100]
 * Trend compares score against previous scan when user id is available.
 */
export const calculateGlowScore = async (metrics = {}, userId) => {
    const acne = toNumber(metrics.acne);
    const pigmentation = toNumber(metrics.pigmentation);
    const texture = toNumber(metrics.texture);

    const rawScore = 100 - (acne * 20) - (pigmentation * 15) - (texture * 10);
    const score = Math.round(clampScore(rawScore));

    const resolvedUserId = userId || metrics.userId || metrics.user_id;
    if (!resolvedUserId) {
        return { score, trend: 'stable' };
    }

    try {
        const previousScan = await getLatestScan(resolvedUserId);
        if (!previousScan || typeof previousScan.glow_score !== 'number') {
            return { score, trend: 'stable' };
        }

        if (score > previousScan.glow_score) {
            return { score, trend: 'improving' };
        }

        if (score < previousScan.glow_score) {
            return { score, trend: 'declining' };
        }

        return { score, trend: 'stable' };
    } catch {
        return { score, trend: 'stable' };
    }
};

export const computeGlowScore = calculateGlowScore;

export default { calculateGlowScore, computeGlowScore };
