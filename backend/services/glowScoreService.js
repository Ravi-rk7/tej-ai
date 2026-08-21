import { getLatestScan } from './supabaseService.js';

const toScore = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        throw new TypeError('A validated provider totalScore is required');
    }
    return parsed;
};

/**
 * Glow Score is the provider's validated total_score. Provider health scores
 * already have the correct direction, so no local weighting or inversion is
 * applied.
 * Trend compares score against previous scan when user id is available.
 */
export const createGlowScoreCalculator = ({ latestScanLoader = getLatestScan } = {}) => async (scoreInfo = {}, userId) => {
    const score = toScore(scoreInfo.totalScore ?? scoreInfo.total_score);

    const resolvedUserId = userId;
    if (!resolvedUserId) {
        return { score, trend: 'stable' };
    }

    try {
        const previousScan = await latestScanLoader(resolvedUserId);
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

export const calculateGlowScore = createGlowScoreCalculator();

export const computeGlowScore = calculateGlowScore;

export default { calculateGlowScore, computeGlowScore, createGlowScoreCalculator };
