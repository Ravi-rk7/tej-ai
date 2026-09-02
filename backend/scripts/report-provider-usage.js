import 'dotenv/config';
import env from '../config/env.js';
import {
    cleanupProviderUsage,
    getProviderUsageSummary,
} from '../services/providerBudgetService.js';
import {
    buildProviderUsageReport,
    formatProviderUsageAlert,
} from '../services/providerUsageReportService.js';

const usageDate = process.env.PROVIDER_USAGE_DATE
    || new Date().toISOString().slice(0, 10);

const report = buildProviderUsageReport({
    usageDate,
    summaries: await getProviderUsageSummary(usageDate),
    limits: {
        ailabtools: env.AILAB_DAILY_CALL_LIMIT,
        openai: env.OPENAI_DAILY_CALL_LIMIT,
    },
});

// The JSON output contains aggregate counts only and is safe for CI logs.
process.stdout.write(`${JSON.stringify(report)}\n`);

const webhookUrl = String(process.env.OPS_ALERT_WEBHOOK_URL || '').trim();
const requireDelivery = String(process.env.COST_ALERTS_REQUIRE_DELIVERY || 'false') === 'true';

if (!webhookUrl) {
    if (requireDelivery) throw new Error('OPS_ALERT_WEBHOOK_URL is required');
    process.stdout.write('Provider usage alert delivery is not configured.\n');
} else {
    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== 'https:') throw new Error('OPS_ALERT_WEBHOOK_URL must use HTTPS');

    const response = await fetch(parsed, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: formatProviderUsageAlert(report) }),
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Alert delivery failed with status ${response.status}`);
    process.stdout.write('Provider usage alert delivered.\n');
}

const retentionCutoff = new Date();
retentionCutoff.setUTCHours(0, 0, 0, 0);
retentionCutoff.setUTCDate(
    retentionCutoff.getUTCDate() - env.PROVIDER_USAGE_RETENTION_DAYS
);
const deleted = await cleanupProviderUsage(retentionCutoff.toISOString().slice(0, 10));
process.stdout.write(`${JSON.stringify({ providerUsageRowsDeleted: deleted })}\n`);
