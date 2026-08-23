const isScore = (value) => Number.isInteger(value) && value >= 0 && value <= 100;

export const normalizeDashboard = (data) => {
    if (!data || typeof data !== "object") return null;
    const latestScan = data.latestScan && typeof data.latestScan === "object"
        ? {
            scanId: typeof data.latestScan.scanId === "string" ? data.latestScan.scanId : null,
            createdAt: data.latestScan.createdAt || null,
            glowScore: isScore(data.latestScan.glowScore) ? data.latestScan.glowScore : null,
            skinType: typeof data.latestScan.skinType === "string" ? data.latestScan.skinType : null,
            concerns: Array.isArray(data.latestScan.concerns) ? data.latestScan.concerns.filter((item) => typeof item === "string") : [],
        }
        : null;
    const trend = data.trend && typeof data.trend === "object" ? data.trend : {};
    const usage = data.usage && typeof data.usage === "object" ? data.usage : {};
    const subscription = data.subscription && typeof data.subscription === "object" ? data.subscription : {};
    const points = Array.isArray(trend.points)
        ? trend.points.filter((point) => point && typeof point.scanId === "string" && isScore(point.glowScore))
        : [];
    return {
        valid: true,
        latestScan,
        trend: {
            direction: ['improving', 'declining', 'stable', 'insufficient_data'].includes(trend.direction)
                ? trend.direction
                : 'insufficient_data',
            delta: Number.isInteger(trend.delta) ? trend.delta : null,
            points,
        },
        usage: {
            used: Number.isInteger(usage.used) && usage.used >= 0 ? usage.used : 0,
            limit: Number.isInteger(usage.limit) && usage.limit > 0 ? usage.limit : 1,
            remaining: Number.isInteger(usage.remaining) && usage.remaining >= 0 ? usage.remaining : 0,
            resetAt: usage.resetAt || null,
        },
        subscription: {
            plan: ['free', 'starter', 'growth', 'pro'].includes(subscription.plan) ? subscription.plan : 'free',
            status: ['active', 'pending', 'past_due', 'on_hold', 'cancelled', 'expired', 'failed'].includes(subscription.status)
                ? subscription.status
                : 'unknown',
        },
    };
};

const dashboardData = { normalizeDashboard };

export default dashboardData;
