import { buildUsage, monthWindow, resolveEntitlement } from './entitlementService.js';

const TREND_DIRECTION = Object.freeze({
    higher: 'improving',
    lower: 'declining',
    equal: 'stable',
});

const cleanConcerns = (concerns) => (Array.isArray(concerns)
    ? concerns.map((concern) => {
        if (typeof concern === 'string') return concern;
        return typeof concern?.label === 'string' ? concern.label : null;
    }).filter(Boolean)
    : []);

const sortLatestFirst = (scans) => [...(Array.isArray(scans) ? scans : [])].sort((left, right) => {
    const timeDelta = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
    return String(right.id || '').localeCompare(String(left.id || ''));
});

export const buildTrend = (scans = []) => {
    const points = sortLatestFirst(scans)
        .filter((scan) => Number.isInteger(scan.glow_score) && scan.glow_score >= 0 && scan.glow_score <= 100)
        .map((scan) => ({
            scanId: scan.id,
            createdAt: scan.created_at,
            glowScore: scan.glow_score,
        }))
        .reverse();
    const latest = points.at(-1);
    const previous = points.at(-2);

    if (!latest || !previous) {
        return { direction: 'insufficient_data', delta: null, points };
    }

    const delta = latest.glowScore - previous.glowScore;
    const direction = delta > 0
        ? TREND_DIRECTION.higher
        : delta < 0
            ? TREND_DIRECTION.lower
            : TREND_DIRECTION.equal;
    return { direction, delta, points };
};

export const buildDashboardSummary = ({ subscription, scanCount, scans, quotaStatus, now = new Date() }) => {
    const entitlement = quotaStatus
        ? { plan: quotaStatus.effectivePlan, status: quotaStatus.status, limit: quotaStatus.limit }
        : resolveEntitlement(subscription);
    const { resetAt } = monthWindow(now);
    const orderedScans = sortLatestFirst(scans);
    const trend = buildTrend(orderedScans);
    const latest = orderedScans.find((scan) => Number.isInteger(scan.glow_score) && scan.glow_score >= 0 && scan.glow_score <= 100) || null;

    return {
        schemaVersion: 1,
        generatedAt: now.toISOString(),
        latestScan: latest ? {
            scanId: latest.id,
            createdAt: latest.created_at,
            glowScore: latest.glow_score,
            skinType: latest.skin_type || null,
            concerns: cleanConcerns(latest.concerns),
        } : null,
        trend,
        usage: buildUsage({ used: quotaStatus?.used ?? scanCount, entitlement, resetAt }),
        subscription: {
            plan: entitlement.plan,
            status: quotaStatus?.status || entitlement.status,
        },
    };
};

export default { buildDashboardSummary, buildTrend };
