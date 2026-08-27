import { z } from 'zod';

export const PLAN_LIMITS = Object.freeze({
    free: 1,
    starter: 15,
    growth: 30,
    pro: 50,
});

const PlanSchema = z.enum(['free', 'starter', 'growth', 'pro']);

export const normalizePlan = (plan) => {
    const parsed = PlanSchema.safeParse(String(plan || '').toLowerCase());
    return parsed.success ? parsed.data : 'free';
};

export const monthWindow = (now = new Date()) => {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return {
        start: monthStart.toISOString(),
        resetAt: nextMonth.toISOString(),
    };
};

export const resolveEntitlement = (subscription) => {
    const plan = normalizePlan(subscription?.plan);
    const status = typeof subscription?.status === 'string' && subscription.status.trim()
        ? subscription.status.trim().toLowerCase()
        : 'active';
    const recognized = plan !== 'free' || String(subscription?.plan || '').toLowerCase() === 'free';
    const hasPeriodValue = subscription?.current_period_end !== null
        && subscription?.current_period_end !== undefined
        && String(subscription.current_period_end).trim() !== '';
    const periodEnd = Date.parse(subscription?.current_period_end || '');
    // Older rows may not have a period end. Keep those active rows readable;
    // the Day 9 quota RPC remains the authoritative server-side entitlement.
    const hasFuturePeriod = !hasPeriodValue
        || (Number.isFinite(periodEnd) && periodEnd > Date.now());
    const entitled = plan === 'free'
        ? recognized && status === 'active'
        : recognized && status === 'active' && hasFuturePeriod;
    const resolvedPlan = entitled ? plan : 'free';
    return {
        plan: resolvedPlan,
        status,
        limit: PLAN_LIMITS[resolvedPlan],
    };
};

export const buildUsage = ({ used = 0, entitlement, resetAt }) => {
    const safeUsed = Number.isInteger(used) && used >= 0 ? used : 0;
    const limit = entitlement.limit;
    return {
        used: safeUsed,
        limit,
        remaining: Math.max(0, limit - safeUsed),
        resetAt,
    };
};

export default { PLAN_LIMITS, buildUsage, monthWindow, normalizePlan, resolveEntitlement };
