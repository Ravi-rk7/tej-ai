import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SummarySchema = z.object({
    provider: z.enum(['ailabtools', 'openai']),
    attempted: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    inputUnits: z.number().int().nonnegative(),
    outputUnits: z.number().int().nonnegative(),
    estimatedCostMicros: z.number().int().nonnegative(),
});

const percentage = (used, limit) => limit > 0
    ? Math.min(100, Math.round((used / limit) * 100))
    : 0;

export const buildProviderUsageReport = ({ usageDate, summaries, limits }) => {
    if (!ISO_DATE.test(String(usageDate || ''))) throw new Error('usageDate must be YYYY-MM-DD');

    const byProvider = new Map(
        z.array(SummarySchema).parse(summaries).map((summary) => [summary.provider, summary])
    );

    const providers = ['ailabtools', 'openai'].map((provider) => {
        const summary = byProvider.get(provider) || {
            provider,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            pending: 0,
            inputUnits: 0,
            outputUnits: 0,
            estimatedCostMicros: 0,
        };
        const limit = Number(limits?.[provider]);
        if (!Number.isInteger(limit) || limit <= 0) {
            throw new Error(`Missing positive ${provider} daily limit`);
        }
        const usedPercent = percentage(summary.attempted, limit);
        return {
            ...summary,
            limit,
            remaining: Math.max(0, limit - summary.attempted),
            usedPercent,
            alertLevel: usedPercent >= 100
                ? 'critical'
                : usedPercent >= 80
                    ? 'warning'
                    : usedPercent >= 50 ? 'notice' : 'normal',
        };
    });

    return {
        schemaVersion: 1,
        usageDate,
        providers,
        alertRequired: providers.some(({ usedPercent }) => usedPercent >= 50),
    };
};

export const formatProviderUsageAlert = (report) => [
    `TejAi provider usage for ${report.usageDate} UTC`,
    ...report.providers.map((provider) => (
        `${provider.provider}: ${provider.attempted}/${provider.limit} attempts `
        + `(${provider.usedPercent}%), ${provider.succeeded} succeeded, `
        + `${provider.failed} failed, ${provider.pending} pending`
    )),
].join('\n');

export default { buildProviderUsageReport, formatProviderUsageAlert };
