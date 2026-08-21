import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    createCircuitBreaker,
    createSkinAnalysisService,
    normalizeProviderResponse,
} from '../services/skinAnalysisService.js';

const fixtureUrl = (name) => new URL(`./fixtures/ailabtools/${name}`, import.meta.url);
const readFixture = async (name) => JSON.parse(await readFile(fixtureUrl(name), 'utf8'));

const quietLogger = () => {
    const entries = [];
    return {
        entries,
        info(message, metadata) { entries.push({ level: 'info', message, metadata }); },
        warn(message, metadata) { entries.push({ level: 'warn', message, metadata }); },
        error(message, metadata) { entries.push({ level: 'error', message, metadata }); },
    };
};

const axiosError = ({ status, data, code }) => ({
    isAxiosError: true,
    code,
    response: status ? { status, data } : undefined,
});

const serviceFor = ({ responses, logger = quietLogger(), breaker, now } = {}) => {
    let calls = 0;
    const httpClient = {
        async post() {
            const response = responses[calls];
            calls += 1;
            if (response instanceof Error || response?.isAxiosError) throw response;
            return response;
        },
    };
    const service = createSkinAnalysisService({
        httpClient,
        apiUrl: 'https://provider.test/skin-analysis',
        apiKey: 'test-key-that-must-not-be-logged',
        serviceLogger: logger,
        circuitBreaker: breaker || createCircuitBreaker(),
        now,
    });
    return { service, logger, calls: () => calls };
};

test('normalizes the documented v1.7.1 success contract', async () => {
    const fixture = await readFixture('skin-analysis-success.json');
    const result = normalizeProviderResponse(fixture);

    assert.equal(result.skinType, 'Combination');
    assert.equal(result.concerns, undefined);
    assert.equal(result.metrics, undefined);
    assert.equal(result.scoreInfo.totalScore, 84);
    assert.equal(result.provider.name, 'ailabtools');
    assert.equal(result.provider.version, 'skin-analysis-pro-v1.7.1');
    assert.equal(result.scoreInfo.acneScore, 76);
    assert.equal(result.providerConcerns.acneCount, 5);
    assert.equal(result.providerConcerns.pigmentationArea, 0.22);
    assert.equal(result.providerConcerns.roughnessSeverity, 11);
    assert.equal(result.imageQuality.faceRatio, 0.63);
    assert.equal(result.imageQuality.glasses, false);
});

test('rejects a malformed success response without exposing schema details', () => {
    assert.throws(
        () => normalizeProviderResponse({
            request_id: 'request',
            log_id: 'log',
            error_detail: { code: '', code_message: '', message: '' },
            result: { skin_type: { skin_type: 2 } },
        }),
        (error) => error.statusCode === 502
            && error.publicCode === 'SKIN_PROVIDER_INVALID_RESPONSE'
            && !error.publicMessage.includes('score_info')
    );
});

test('maps image quality failures to useful guidance without retrying', async () => {
    const errorFixture = await readFixture('skin-analysis-quality-error.json');
    const clientError = axiosError({ status: 422, data: errorFixture });
    const { service, calls } = serviceFor({ responses: [clientError] });

    await assert.rejects(
        service.runSkinAnalysis(Buffer.from('jpeg')),
        (error) => error.statusCode === 422
            && error.publicCode === 'SCAN_IMAGE_QUALITY'
            && error.category === 'image_quality'
            && /blurry/i.test(error.publicMessage)
    );
    assert.equal(calls(), 1);
});

test('retries one transient provider failure and then succeeds', async () => {
    const successFixture = await readFixture('skin-analysis-success.json');
    const errorFixture = await readFixture('skin-analysis-service-error.json');
    const logger = quietLogger();
    const { service, calls } = serviceFor({
        responses: [
            axiosError({ status: 503, data: errorFixture }),
            { status: 200, data: successFixture },
        ],
        logger,
    });

    const result = await service.runSkinAnalysis(Buffer.from('jpeg'));

    assert.equal(result.scoreInfo.totalScore, 84);
    assert.equal(calls(), 2);
    assert.equal(logger.entries.filter((entry) => entry.metadata.outcome === 'retry').length, 1);
});

test('returns a retryable timeout after exactly one retry', async () => {
    const timeout = axiosError({ code: 'ECONNABORTED' });
    const { service, calls } = serviceFor({ responses: [timeout, timeout] });

    await assert.rejects(
        service.runSkinAnalysis(Buffer.from('jpeg')),
        (error) => error.statusCode === 504
            && error.publicCode === 'SKIN_PROVIDER_TIMEOUT'
            && error.retryable === true
    );
    assert.equal(calls(), 2);
});

test('opens the circuit after consecutive provider outages and probes after cooldown', async () => {
    let currentTime = 1_000;
    const breaker = createCircuitBreaker({
        failureThreshold: 2,
        cooldownMs: 500,
        now: () => currentTime,
    });
    const outage = axiosError({ status: 503, data: {} });
    const { service, calls } = serviceFor({
        responses: [outage, outage, outage, outage, outage],
        breaker,
        now: () => currentTime,
    });

    await assert.rejects(service.runSkinAnalysis(Buffer.from('one')));
    await assert.rejects(service.runSkinAnalysis(Buffer.from('two')));
    assert.equal(breaker.snapshot().state, 'OPEN');
    assert.equal(calls(), 4);

    await assert.rejects(
        service.runSkinAnalysis(Buffer.from('blocked')),
        (error) => error.category === 'circuit_open'
    );
    assert.equal(calls(), 4);

    currentTime += 501;
    await assert.rejects(service.runSkinAnalysis(Buffer.from('probe')));
    assert.equal(calls(), 5);
    assert.equal(breaker.snapshot().state, 'OPEN');
});

test('quality errors do not count toward the provider circuit breaker', async () => {
    const errorFixture = await readFixture('skin-analysis-quality-error.json');
    const qualityError = axiosError({ status: 422, data: errorFixture });
    const breaker = createCircuitBreaker({ failureThreshold: 1 });
    const { service } = serviceFor({ responses: [qualityError], breaker });

    await assert.rejects(service.runSkinAnalysis(Buffer.from('jpeg')));
    assert.equal(breaker.snapshot().state, 'CLOSED');
    assert.equal(breaker.snapshot().consecutiveFailures, 0);
});

test('provider telemetry contains latency and category but no image bytes or credentials', async () => {
    const timeout = axiosError({ code: 'ECONNABORTED' });
    const logger = quietLogger();
    let time = 10;
    const { service } = serviceFor({
        responses: [timeout, timeout],
        logger,
        now: () => {
            time += 7;
            return time;
        },
    });

    await assert.rejects(service.runSkinAnalysis(Buffer.from('private-image-content')));
    const serialized = JSON.stringify(logger.entries);

    assert.match(serialized, /"category":"timeout"/);
    assert.match(serialized, /"latencyMs":/);
    assert.doesNotMatch(serialized, /private-image-content/);
    assert.doesNotMatch(serialized, /test-key-that-must-not-be-logged/);
    assert.doesNotMatch(serialized, /request_id|log_id/);
});
