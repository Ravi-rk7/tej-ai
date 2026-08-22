import { CONCERN_DEFINITIONS, severityForScore } from './skinInsightsService.js';

const SEVERITY_RANK = Object.freeze({ severe: 0, moderate: 1, mild: 2, none: 3 });

export const RESULT_SAFETY = Object.freeze({
    patchTest: 'Patch-test every new product before using it on your full face.',
    spf: 'Use broad-spectrum SPF 30+ every morning, even on cloudy days.',
    cautions: 'If pregnant, breastfeeding, managing allergies or sensitive skin, or taking medication, check with a qualified clinician before starting new actives.',
    disclaimer: 'This is cosmetic wellness guidance, not a medical diagnosis or treatment plan.',
    dermatologist: null,
});

const QUALITY_WARNING_MESSAGES = Object.freeze({
    FACE_SIZE_BELOW_RECOMMENDATION: 'A closer, front-facing photo may improve scan accuracy.',
    FACE_YAW_ABOVE_RECOMMENDATION: 'A more front-facing photo may improve scan accuracy.',
    FACE_PITCH_ABOVE_RECOMMENDATION: 'Keep your face level with the camera for more consistent results.',
    HAIR_OCCLUSION_ABOVE_RECOMMENDATION: 'Keep hair away from the face for more consistent results.',
    GLASSES_DETECTED: 'Removing glasses may improve the visibility of facial skin areas.',
});

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isScore = (value) => Number.isInteger(value) && value >= 0 && value <= 100;
const cleanText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

const normalizeStep = (step) => {
    if (typeof step === 'string') {
        const name = cleanText(step);
        return name ? { name, instructions: '' } : null;
    }

    if (!isRecord(step)) return null;
    const name = cleanText(step.name || step.title);
    if (!name) return null;
    return {
        name,
        instructions: cleanText(step.instructions || step.description) || '',
    };
};

const normalizeSteps = (steps) => (Array.isArray(steps)
    ? steps.map(normalizeStep).filter(Boolean).slice(0, 4)
    : []);

const normalizeSafety = (safety) => ({
    ...RESULT_SAFETY,
    ...(isRecord(safety)
        ? Object.fromEntries(Object.keys(RESULT_SAFETY)
            .filter((key) => typeof safety[key] === 'string' || safety[key] === null)
            .map((key) => [key, safety[key]]))
        : {}),
});

export const normalizeStoredRoutine = (routine) => {
    if (Array.isArray(routine)) {
        const morning = normalizeSteps(routine);
        return morning.length ? {
            schemaVersion: 1,
            source: 'legacy',
            morning,
            night: [],
            safety: normalizeSafety(),
        } : null;
    }

    if (!isRecord(routine)) return null;
    const morning = normalizeSteps(routine.morning);
    const night = normalizeSteps(routine.night);
    if (!morning.length && !night.length) return null;

    const source = ['openai', 'fallback', 'legacy'].includes(routine.source)
        ? routine.source
        : 'legacy';
    return {
        schemaVersion: 1,
        source,
        morning,
        night,
        safety: normalizeSafety(routine.safety),
    };
};

const normalizeConcern = (concern) => {
    if (typeof concern === 'string') {
        const label = cleanText(concern);
        return label ? {
            key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
            label,
            score: null,
            severity: null,
        } : null;
    }

    if (!isRecord(concern)) return null;
    const label = cleanText(concern.label || concern.name);
    if (!label) return null;
    return {
        key: cleanText(concern.key) || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        label,
        score: isScore(concern.score) ? concern.score : null,
        severity: ['mild', 'moderate', 'severe'].includes(concern.severity)
            ? concern.severity
            : null,
    };
};

const orderConcerns = (concerns) => concerns
    .map((concern, index) => ({ ...concern, index }))
    .sort((left, right) => (
        (SEVERITY_RANK[left.severity || 'none'] - SEVERITY_RANK[right.severity || 'none'])
        || ((left.score ?? 101) - (right.score ?? 101))
        || (left.index - right.index)
    ))
    .map(({ index: _index, ...concern }) => concern);

const detailsFromHealthScores = (healthScores) => {
    if (!isRecord(healthScores)) return [];
    return orderConcerns(CONCERN_DEFINITIONS
        .map(({ key, label }) => {
            const score = healthScores[key];
            if (!isScore(score)) return null;
            const severity = severityForScore(score);
            return severity === 'none' ? null : { key, label, score, severity };
        })
        .filter(Boolean));
};

const normalizeWarnings = (warnings) => (Array.isArray(warnings)
    ? warnings.map((warning) => {
        if (typeof warning === 'string') {
            const code = warning.trim();
            return code && QUALITY_WARNING_MESSAGES[code]
                ? { code, message: QUALITY_WARNING_MESSAGES[code] }
                : null;
        }
        if (!isRecord(warning)) return null;
        const code = cleanText(warning.code);
        if (!code || !QUALITY_WARNING_MESSAGES[code]) return null;
        return { code, message: QUALITY_WARNING_MESSAGES[code] };
    }).filter(Boolean)
    : []);

export const buildQualityWarnings = ({ scanImage, imageQuality } = {}) => {
    const codes = new Set();
    const add = (code) => codes.add(code);

    if (scanImage?.meetsRecommendedFaceCanvas === false || imageQuality?.faceRatio < 0.5) {
        add('FACE_SIZE_BELOW_RECOMMENDATION');
    }
    if (Number.isFinite(imageQuality?.yaw) && Math.abs(imageQuality.yaw) > 30) {
        add('FACE_YAW_ABOVE_RECOMMENDATION');
    }
    if (Number.isFinite(imageQuality?.pitch) && Math.abs(imageQuality.pitch) > 40) {
        add('FACE_PITCH_ABOVE_RECOMMENDATION');
    }
    if (Number.isFinite(imageQuality?.hairOcclusion) && imageQuality.hairOcclusion > 0.4) {
        add('HAIR_OCCLUSION_ABOVE_RECOMMENDATION');
    }
    if (imageQuality?.glasses === true) add('GLASSES_DETECTED');

    return [...codes].map((code) => ({ code, message: QUALITY_WARNING_MESSAGES[code] }));
};

const safeMetrics = (metrics, fallbackScore, concernDetails, warnings) => {
    const value = isRecord(metrics) ? metrics : {};
    const healthScores = isRecord(value.healthScores)
        ? Object.fromEntries(Object.entries(value.healthScores).filter(([, score]) => isScore(score)))
        : {};
    return {
        schemaVersion: Number.isInteger(value.schemaVersion) ? value.schemaVersion : 1,
        totalScore: isScore(value.totalScore) ? value.totalScore : fallbackScore,
        healthScores,
        concernDetails,
        ...(warnings.length ? { qualityWarnings: warnings } : {}),
    };
};

export const serializeScanResult = (row) => {
    if (!isRecord(row)) throw new Error('Invalid persisted scan row');

    const metricsValue = isRecord(row.metrics) ? row.metrics : {};
    const glowScore = isScore(row.glow_score) ? row.glow_score : null;
    const storedDetails = Array.isArray(metricsValue.concernDetails)
        ? metricsValue.concernDetails.map(normalizeConcern).filter(Boolean)
        : [];
    const concernDetails = orderConcerns(storedDetails.length
        ? storedDetails
        : detailsFromHealthScores(metricsValue.healthScores));
    const labels = Array.isArray(row.concerns)
        ? row.concerns.map(normalizeConcern).filter(Boolean)
        : [];
    const concerns = concernDetails.length
        ? concernDetails.map(({ label }) => label)
        : labels.map(({ label }) => label);
    const warnings = normalizeWarnings(metricsValue.qualityWarnings || metricsValue.warnings);
    const imageGuidance = warnings.find(({ code }) => code === 'FACE_SIZE_BELOW_RECOMMENDATION')?.message;

    return {
        schemaVersion: 1,
        scanId: cleanText(row.id),
        createdAt: cleanText(row.created_at),
        glowScore,
        skinType: cleanText(row.skin_type),
        concerns,
        concernDetails,
        metrics: safeMetrics(metricsValue, glowScore, concernDetails, warnings),
        routine: normalizeStoredRoutine(row.routine),
        warnings,
        ...(imageGuidance ? { imageGuidance } : {}),
    };
};

export { QUALITY_WARNING_MESSAGES };

export default { buildQualityWarnings, normalizeStoredRoutine, serializeScanResult };
