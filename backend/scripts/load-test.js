import 'dotenv/config';

const ALLOWED_PATHS = new Set([
    '/api/health',
    '/api/ready',
    '/api/dashboard',
    '/api/history',
    '/api/billing/subscription',
    '/api/privacy/status',
]);

const confirmation = process.env.LOAD_TEST_CONFIRM;
if (confirmation !== 'I_ACKNOWLEDGE_STAGING_LOAD_ONLY') {
    throw new Error('LOAD_TEST_CONFIRM must acknowledge staging-only execution');
}
if (process.env.LOAD_TEST_ENVIRONMENT !== 'staging') {
    throw new Error('LOAD_TEST_ENVIRONMENT must be staging');
}

const baseUrl = new URL(process.env.LOAD_TEST_BASE_URL || '');
if (baseUrl.protocol !== 'https:' || baseUrl.pathname !== '/') {
    throw new Error('LOAD_TEST_BASE_URL must be a canonical HTTPS origin');
}
if (baseUrl.hostname !== process.env.LOAD_TEST_ALLOW_HOST) {
    throw new Error('LOAD_TEST_ALLOW_HOST must exactly match the staging hostname');
}
const productionHost = String(process.env.LOAD_TEST_PRODUCTION_HOST || '').toLowerCase();
if (!productionHost) {
    throw new Error('LOAD_TEST_PRODUCTION_HOST is required as a production deny guard');
}
if (baseUrl.hostname === productionHost) {
    throw new Error('Load testing production is forbidden');
}

const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY || '10');
const durationSeconds = Number(process.env.LOAD_TEST_DURATION_SECONDS || '60');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 25) {
    throw new Error('LOAD_TEST_CONCURRENCY must be between 1 and 25');
}
if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 300) {
    throw new Error('LOAD_TEST_DURATION_SECONDS must be between 10 and 300');
}

const paths = String(process.env.LOAD_TEST_PATHS || '/api/health,/api/ready')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
if (paths.length === 0 || paths.some((path) => !ALLOWED_PATHS.has(path))) {
    throw new Error('LOAD_TEST_PATHS contains a provider or mutation endpoint');
}

const authorization = String(process.env.LOAD_TEST_BEARER_TOKEN || '').trim();
const protectedPaths = paths.filter((path) => !['/api/health', '/api/ready'].includes(path));
if (protectedPaths.length > 0 && !authorization) {
    throw new Error('LOAD_TEST_BEARER_TOKEN is required for protected paths');
}

const deadline = Date.now() + durationSeconds * 1000;
const latencies = [];
let requests = 0;
let errors = 0;

const worker = async (workerIndex) => {
    let pathIndex = workerIndex % paths.length;
    while (Date.now() < deadline) {
        const path = paths[pathIndex % paths.length];
        pathIndex += 1;
        const startedAt = performance.now();
        try {
            const response = await fetch(new URL(path, baseUrl), {
                headers: authorization ? { Authorization: `Bearer ${authorization}` } : {},
                redirect: 'error',
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) errors += 1;
            await response.arrayBuffer();
        } catch {
            errors += 1;
        } finally {
            requests += 1;
            latencies.push(performance.now() - startedAt);
        }
    }
};

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
latencies.sort((left, right) => left - right);
const percentile = (value) => latencies[Math.min(
    latencies.length - 1,
    Math.max(0, Math.ceil((value / 100) * latencies.length) - 1)
)] || 0;
const errorRate = requests > 0 ? errors / requests : 1;
const result = {
    schemaVersion: 1,
    concurrency,
    durationSeconds,
    requests,
    errors,
    errorRate: Number(errorRate.toFixed(4)),
    p50Ms: Number(percentile(50).toFixed(2)),
    p95Ms: Number(percentile(95).toFixed(2)),
    p99Ms: Number(percentile(99).toFixed(2)),
};
process.stdout.write(`${JSON.stringify(result)}\n`);

if (result.p95Ms >= 1000 || errorRate >= 0.01) process.exitCode = 1;
