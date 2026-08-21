import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createRoutineGenerator,
    OPENAI_API_URL,
    OPENAI_ROUTINE_MODEL,
} from '../services/aiRoutineService.js';

const quietLogger = {
    info() {},
    warn() {},
    error() {},
};

const input = {
    skinType: 'Combination',
    concerns: [{ key: 'acne', severity: 'mild' }],
};

const fallbackInput = {
    skinType: 'Sensitive',
    concerns: [{ key: 'sensitivity', severity: 'severe' }],
};

const assertSafety = (routine, severe = false) => {
    assert.equal(routine.schemaVersion, 1);
    assert.equal(routine.morning.length >= 3, true);
    assert.equal(routine.night.length >= 3, true);
    assert.equal(routine.morning.at(-1).name, 'Broad-spectrum SPF 30+');
    assert.match(routine.safety.patchTest, /patch-test/i);
    assert.match(routine.safety.spf, /SPF 30\+/i);
    assert.match(routine.safety.cautions, /pregnant|breastfeeding|medication/i);
    assert.match(routine.safety.disclaimer, /not a medical diagnosis/i);
    assert.equal(Boolean(routine.safety.dermatologist), severe);
};

test('uses a deterministic safe fallback when OpenAI is unavailable', async () => {
    const generate = createRoutineGenerator({ runtimeEnv: {}, routineLogger: quietLogger });
    const first = await generate(fallbackInput);
    const second = await generate(fallbackInput);

    assert.deepEqual(first, second);
    assert.equal(first.source, 'fallback');
    assertSafety(first, true);
    assert.equal(first.night.some((step) => /acid|active/i.test(step.name)), false);
});

test('accepts only the strict enum routine and sends sanitized derived fields', async () => {
    let request;
    const httpClient = {
        async post(url, body, config) {
            request = { url, body, config };
            return {
                data: {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                morning: ['gentle_cleanser', 'hydrating_serum', 'barrier_moisturizer', 'spf_30_plus'],
                                night: ['gentle_cleanser', 'salicylic_acid', 'barrier_moisturizer'],
                            }),
                        },
                    }],
                },
            };
        },
    };
    const generate = createRoutineGenerator({
        httpClient,
        runtimeEnv: { OPENAI_API_KEY: 'test-key' },
        routineLogger: quietLogger,
    });

    const routine = await generate(input);

    assert.equal(routine.source, 'openai');
    assertSafety(routine);
    assert.equal(request.url, OPENAI_API_URL);
    assert.equal(request.body.model, OPENAI_ROUTINE_MODEL);
    assert.equal(request.body.response_format.type, 'json_schema');
    assert.equal(request.body.store, false);
    assert.equal(request.config.timeout, 15_000);
    const serialized = JSON.stringify(request.body);
    assert.match(serialized, /Combination/);
    assert.match(serialized, /acne/);
    assert.doesNotMatch(serialized, /image|base64|user-id|email|provider_id|raw_api/i);
});

test('uses the same fallback for malformed, unsafe, or refused model output', async () => {
    const responses = [
        { data: { choices: [{ message: { content: '{bad json' } }] } },
        { data: { choices: [{ message: { content: JSON.stringify({ morning: ['gentle_cleanser', 'salicylic_acid', 'spf_30_plus'], night: ['gentle_cleanser', 'niacinamide', 'barrier_moisturizer'] }) } }] } },
        { data: { choices: [{ message: { refusal: 'unsafe' } }] } },
    ];
    let index = 0;
    const httpClient = { async post() { return responses[index++]; } };
    const generate = createRoutineGenerator({
        httpClient,
        runtimeEnv: { OPENAI_API_KEY: 'test-key' },
        routineLogger: quietLogger,
    });

    const outputs = await Promise.all([
        generate(input),
        generate(input),
        generate(input),
    ]);

    assert.equal(outputs.every((routine) => routine.source === 'fallback'), true);
    assert.deepEqual(outputs[0], outputs[1]);
    assert.deepEqual(outputs[1], outputs[2]);
});

test('normalizes legacy string concerns for the compatibility adapter', async () => {
    const generate = createRoutineGenerator({ runtimeEnv: {}, routineLogger: quietLogger });
    const routine = await generate({ skinType: 'Dry', concerns: ['Pigmentation'] });
    assert.equal(routine.source, 'fallback');
    assert.equal(routine.night.some((step) => step.name === 'Niacinamide serum'), true);
});
