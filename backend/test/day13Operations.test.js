import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReadinessChecker } from '../services/readinessService.js';
import { createReadinessHandler } from '../controllers/readinessController.js';
import {
    ProviderBudgetError,
    createProviderBudgetRepository,
    createProviderBudgetService,
} from '../services/providerBudgetService.js';
import {
    buildProviderUsageReport,
    formatProviderUsageAlert,
} from '../services/providerUsageReportService.js';
import {
    captureOperationalError,
    flushObservability,
    initObservability,
    sanitizeObservabilityEvent,
} from '../services/observabilityService.js';
import { createRoutineGenerator } from '../services/aiRoutineService.js';
import { createScanHandler } from '../controllers/scanController.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const quietLogger = { info() {}, warn() {}, error() {} };

const responseRecorder = () => {
    const result = { statusCode: undefined, body: undefined, headers: {} };
    return {
        result,
        response: {
            status(statusCode) {
                result.statusCode = statusCode;
                return this;
            },
            set(name, value) {
                result.headers[name.toLowerCase()] = value;
                return this;
            },
            json(body) {
                result.body = body;
                return this;
            },
        },
    };
};

test('readiness checks dependencies concurrently, caches success, and hides failures', async () => {
    let databaseCalls = 0;
    let redisCalls = 0;
    let currentTime = 1000;
    const check = createReadinessChecker({
        probes: {
            database: async () => { databaseCalls += 1; },
            rateLimitStore: async () => { redisCalls += 1; },
        },
        timeoutMs: 50,
        cacheMs: 100,
        now: () => currentTime,
    });

    assert.deepEqual(await check(), {
        ready: true,
        checks: { database: 'ready', rateLimitStore: 'ready' },
    });
    await check();
    assert.equal(databaseCalls, 1);
    assert.equal(redisCalls, 1);

    currentTime = 1200;
    await check();
    assert.equal(databaseCalls, 2);

    const unavailable = createReadinessChecker({
        probes: {
            database: async () => { throw new Error('private database host'); },
            rateLimitStore: async () => new Promise(() => {}),
        },
        timeoutMs: 5,
        cacheMs: 0,
    });
    assert.deepEqual(await unavailable(), {
        ready: false,
        checks: { database: 'unavailable', rateLimitStore: 'unavailable' },
    });
});

test('readiness handler returns only safe 200 and 503 contracts', async () => {
    for (const [ready, expectedStatus] of [[true, 200], [false, 503]]) {
        const recorded = responseRecorder();
        await createReadinessHandler({
            loadReadiness: async () => ({
                ready,
                checks: {
                    database: ready ? 'ready' : 'unavailable',
                    rateLimitStore: ready ? 'ready' : 'unavailable',
                },
            }),
            releaseSha: 'abcdef123456',
            now: () => new Date('2026-08-31T00:00:00.000Z'),
        })({}, recorded.response);
        assert.equal(recorded.result.statusCode, expectedStatus);
        assert.equal(JSON.stringify(recorded.result.body).includes('private'), false);
        assert.equal(recorded.result.body.data.releaseSha, 'abcdef123456');
    }

    const failed = responseRecorder();
    await createReadinessHandler({
        loadReadiness: async () => { throw new Error('private'); },
        releaseSha: '',
    })({}, failed.response);
    assert.equal(failed.result.statusCode, 503);
    assert.equal(failed.result.body.data.releaseSha, null);
});

test('provider budget repository sends bounded RPC fields and normalizes summaries', async () => {
    const calls = [];
    const databaseClient = {
        async rpc(name, args) {
            calls.push({ name, args });
            if (name === 'reserve_provider_call_budget') {
                return { data: [{ granted: true, reservation_id: UUID, used: 2, remaining: 3, reset_at: '2026-09-01T00:00:00.000Z' }], error: null };
            }
            if (name === 'finalize_provider_call') {
                return { data: [{ finalized: true, state: 'succeeded' }], error: null };
            }
            if (name === 'cleanup_provider_call_reservations') {
                return { data: 7, error: null };
            }
            return {
                data: [{
                    provider: 'openai', attempted: 2, succeeded: 1, failed: 1,
                    pending: 0, input_units: 100, output_units: 50,
                    estimated_cost_micros: 0,
                }],
                error: null,
            };
        },
    };
    const repository = createProviderBudgetRepository({ databaseClient });
    const reservation = await repository.reserve('openai', 5);
    assert.equal(reservation.reservationId, UUID);
    await repository.finalize(UUID, {
        state: 'succeeded', outcome: 'success', inputUnits: 100, outputUnits: 50,
    });
    const summary = await repository.getSummary('2026-08-31');
    const deleted = await repository.cleanup('2026-06-02');
    assert.equal(summary[0].inputUnits, 100);
    assert.equal(deleted, 7);
    assert.deepEqual(calls[0].args, { p_provider: 'openai', p_daily_limit: 5 });
    assert.equal(Object.hasOwn(calls[1].args, 'p_user_id'), false);
    assert.deepEqual(calls[3], {
        name: 'cleanup_provider_call_reservations',
        args: { p_before: '2026-06-02' },
    });
});

test('provider budget service bypasses local zero, fails closed, and preserves reset', async () => {
    const bypass = createProviderBudgetService({
        repository: {},
        runtimeEnv: { AILAB_DAILY_CALL_LIMIT: 0, OPENAI_DAILY_CALL_LIMIT: 0 },
    });
    assert.equal((await bypass.reserve('ailabtools')).bypassed, true);
    assert.equal((await bypass.finalize(null, {})).bypassed, true);
    await assert.rejects(bypass.reserve('unsupported'), /Unsupported provider/);

    const denied = createProviderBudgetService({
        repository: {
            reserve: async () => ({
                granted: false,
                reservationId: null,
                used: 2,
                remaining: 0,
                resetAt: '2026-09-01T00:00:00.000Z',
            }),
        },
        runtimeEnv: { AILAB_DAILY_CALL_LIMIT: 2 },
    });
    await assert.rejects(
        denied.reserve('ailabtools'),
        (error) => error instanceof ProviderBudgetError
            && error.publicCode === 'SCAN_CAPACITY_REACHED'
            && Boolean(error.resetAt)
    );

    const calls = [];
    const allowed = createProviderBudgetService({
        repository: {
            reserve: async () => ({
                granted: true, reservationId: UUID, used: 1, remaining: 1,
                resetAt: '2026-09-01T00:00:00.000Z',
            }),
            finalize: async (...args) => { calls.push(args); return { finalized: true }; },
            getSummary: async () => [],
            cleanup: async () => 2,
        },
        runtimeEnv: { OPENAI_DAILY_CALL_LIMIT: 2 },
    });
    assert.equal((await allowed.reserve('openai')).reservationId, UUID);
    await allowed.finalize(UUID, { state: 'succeeded', outcome: 'success' });
    assert.equal(calls.length, 1);
    assert.deepEqual(await allowed.getSummary('2026-08-31'), []);
    assert.equal(await allowed.cleanup('2026-06-02'), 2);
});

test('provider budget repository fails closed on storage and schema errors', async () => {
    const unavailable = createProviderBudgetRepository({
        databaseClient: { rpc: async () => ({ data: null, error: { message: 'private host' } }) },
    });
    await assert.rejects(unavailable.reserve('openai', 1), ProviderBudgetError);

    const malformed = createProviderBudgetRepository({
        databaseClient: { rpc: async () => ({ data: [{ granted: 'yes' }], error: null }) },
    });
    await assert.rejects(malformed.reserve('openai', 1));
});

test('usage report is identity-free and raises deterministic thresholds', () => {
    const report = buildProviderUsageReport({
        usageDate: '2026-08-31',
        summaries: [{
            provider: 'ailabtools', attempted: 8, succeeded: 7, failed: 1,
            pending: 0, inputUnits: 0, outputUnits: 0, estimatedCostMicros: 0,
        }],
        limits: { ailabtools: 10, openai: 10 },
    });
    assert.equal(report.alertRequired, true);
    assert.equal(report.providers[0].alertLevel, 'warning');
    assert.equal(report.providers[1].attempted, 0);
    const alert = formatProviderUsageAlert(report);
    assert.match(alert, /8\/10 attempts/);
    assert.doesNotMatch(alert, /user|email|scan.?id/i);

    const critical = buildProviderUsageReport({
        usageDate: '2026-08-31',
        summaries: [{
            provider: 'openai', attempted: 10, succeeded: 10, failed: 0,
            pending: 0, inputUnits: 10, outputUnits: 10, estimatedCostMicros: 0,
        }],
        limits: { ailabtools: 10, openai: 10 },
    });
    assert.equal(critical.providers[1].alertLevel, 'critical');
    assert.equal(critical.providers[0].alertLevel, 'normal');
    assert.throws(() => buildProviderUsageReport({
        usageDate: 'bad-date', summaries: [], limits: {},
    }), /usageDate/);
    assert.throws(() => buildProviderUsageReport({
        usageDate: '2026-08-31', summaries: [], limits: { ailabtools: 0, openai: 1 },
    }), /positive ailabtools/);
});

test('observability sanitizer removes identity, request data, messages, and code context', () => {
    const event = sanitizeObservabilityEvent({
        message: 'owner@example.com failed at https://private.example',
        user: { email: 'owner@example.com' },
        request: { headers: { authorization: 'Bearer secret' } },
        breadcrumbs: [{ message: 'private' }],
        extra: { image: 'base64' },
        contexts: { runtime: { name: 'node' } },
        tags: {
            errorCode: 'SAFE_ERROR',
            email: 'owner@example.com',
            requestId: UUID,
            route: '/api/results/11111111-1111-4111-8111-111111111111',
        },
        exception: { values: [{
            type: 'Error',
            value: 'private failure',
            stacktrace: { frames: [{
                filename: 'C:\\Users\\owner@example.com\\private-build\\app.js?token=secret',
                context_line: 'const token = "secret";',
                lineno: 2,
            }] },
        }] },
    });
    const serialized = JSON.stringify(event);
    assert.equal(event.tags.errorCode, 'SAFE_ERROR');
    assert.equal(event.tags.requestId, UUID);
    assert.equal(Object.hasOwn(event.tags, 'email'), false);
    assert.equal(event.exception.values[0].stacktrace.frames[0].filename, 'app.js');
    assert.doesNotMatch(
        serialized,
        /owner@example|bearer secret|context_line|private failure|private-build/i
    );

    assert.equal(initObservability({ runtimeEnv: { SENTRY_DSN: '' } }), false);
    assert.equal(initObservability({
        runtimeEnv: {
            SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
            APP_ENV: 'development',
            RELEASE_SHA: '',
        },
    }), true);
    assert.equal(initObservability(), true);
    assert.ok(captureOperationalError(new Error('private'), {
        errorCode: 'SAFE_ERROR', ignored: 'owner@example.com',
    }));
    assert.ok(captureOperationalError('not-an-error', {}));
    return flushObservability(1);
});

test('OpenAI capacity denial and success both preserve fallback and token accounting rules', async () => {
    let httpCalls = 0;
    const denied = createRoutineGenerator({
        runtimeEnv: { OPENAI_API_KEY: 'test', OPENAI_DAILY_CALL_LIMIT: 1 },
        reserveBudget: async () => { throw new ProviderBudgetError(); },
        httpClient: { post: async () => { httpCalls += 1; } },
        routineLogger: quietLogger,
    });
    assert.equal((await denied({ skinType: 'Dry', concerns: [] })).source, 'fallback');
    assert.equal(httpCalls, 0);

    const finalized = [];
    const success = createRoutineGenerator({
        runtimeEnv: { OPENAI_API_KEY: 'test', OPENAI_DAILY_CALL_LIMIT: 1 },
        reserveBudget: async () => ({ reservationId: UUID }),
        finalizeBudget: async (...args) => finalized.push(args),
        httpClient: { post: async () => ({ data: {
            usage: { prompt_tokens: 120, completion_tokens: 40 },
            choices: [{ message: { content: JSON.stringify({
                morning: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer', 'spf_30_plus'],
                night: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer'],
            }) } }],
        } }) },
        routineLogger: quietLogger,
    });
    assert.equal((await success({ skinType: 'Dry', concerns: [] })).source, 'openai');
    assert.deepEqual(finalized[0], [UUID, {
        state: 'succeeded', outcome: 'success', inputUnits: 120,
        outputUnits: 40, estimatedCostMicros: 0,
    }]);

    const finalizationLogs = [];
    const finalizeFails = createRoutineGenerator({
        runtimeEnv: { OPENAI_API_KEY: 'test', OPENAI_DAILY_CALL_LIMIT: 1 },
        reserveBudget: async () => ({ reservationId: UUID }),
        finalizeBudget: async () => { throw new ProviderBudgetError(); },
        httpClient: { post: async () => ({ data: {
            choices: [{ message: { content: JSON.stringify({
                morning: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer', 'spf_30_plus'],
                night: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer'],
            }) } }],
        } }) },
        routineLogger: {
            info() {}, warn() {}, error: (...args) => finalizationLogs.push(args),
        },
    });
    assert.equal((await finalizeFails({ skinType: 'Dry', concerns: [] })).source, 'openai');
    assert.equal(finalizationLogs.length, 1);
});

test('scan capacity denial refunds user quota and releases the buffer', async () => {
    let analyzeCalls = 0;
    let releases = 0;
    const refunds = [];
    const handler = createScanHandler({
        analyzeSkin: async () => {
            analyzeCalls += 1;
            throw new ProviderBudgetError('capacity', {
                publicCode: 'SCAN_CAPACITY_REACHED',
                publicMessage: 'Daily scan capacity has been reached.',
                resetAt: '2026-09-01T00:00:00.000Z',
            });
        },
        refundQuota: async (...args) => refunds.push(args),
        releaseImage: () => { releases += 1; },
        scanLogger: quietLogger,
    });
    const recorded = responseRecorder();
    await handler({
        user: { id: 'user-id' },
        scanQuota: { reservationId: UUID },
        scanImage: { buffer: Buffer.from('image'), width: 600, height: 600 },
    }, recorded.response);
    assert.equal(recorded.result.statusCode, 503);
    assert.equal(recorded.result.body.code, 'SCAN_CAPACITY_REACHED');
    assert.equal(analyzeCalls, 1);
    assert.equal(releases, 1);
    assert.ok(Number(recorded.result.headers['retry-after']) >= 1);
    assert.deepEqual(refunds, [['user-id', UUID, 'processing_failed']]);
});

test('Day 13 migration keeps operational usage server-only and identity-free', async () => {
    const sql = await readFile(new URL(
        '../db/migrations/202608310001_day_13_operational_guards.sql',
        import.meta.url
    ), 'utf8');
    const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.provider_call_reservations/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/i);
    assert.match(sql, /REVOKE ALL ON TABLE public\.provider_call_reservations FROM PUBLIC, anon, authenticated/i);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reserve_provider_call_budget\(TEXT, INTEGER\) TO service_role/i);
    const tableDefinition = sql.match(
        /CREATE TABLE IF NOT EXISTS public\.provider_call_reservations \([\s\S]*?\n\);/i
    )[0];
    assert.doesNotMatch(tableDefinition, /user_id|scan_id|email|image|payload/i);
    assert.equal(schema.includes(sql.trim()), true);
});

test('operational automation stays disabled and load testing stays staging-only', async () => {
    const loadHarness = await readFile(new URL('../scripts/load-test.js', import.meta.url), 'utf8');
    const workflow = await readFile(new URL(
        '../../.github/workflows/daily-cost-alert.yml',
        import.meta.url
    ), 'utf8');

    assert.match(loadHarness, /LOAD_TEST_ENVIRONMENT[^\n]+staging/);
    assert.match(loadHarness, /LOAD_TEST_PRODUCTION_HOST/);
    assert.match(loadHarness, /redirect: 'error'/);
    assert.doesNotMatch(
        loadHarness,
        /['"]\/api\/(?:scan|billing\/checkout|billing\/portal|webhooks|privacy\/delete)/
    );
    assert.match(workflow, /if: \$\{\{ vars\.COST_ALERTS_ENABLED == 'true' \}\}/);
    assert.match(workflow, /PROVIDER_USAGE_RETENTION_DAYS/);
});
