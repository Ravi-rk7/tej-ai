/**
 * TejAi backend smoke test
 * Local: npm run smoke
 * Staging: set SMOKE_BASE_URL and SMOKE_FRONTEND_URL before running.
 * Optional: set SMOKE_ACCESS_TOKEN to verify owner billing status and the
 * disabled checkout kill switch without making a provider request.
 */

import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const normalizeOrigin = (name, value) => {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid HTTP(S) origin`);
    }

    if (
        !['http:', 'https:'].includes(parsed.protocol)
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash
    ) {
        throw new Error(`${name} must be a canonical HTTP(S) origin`);
    }

    return parsed.origin;
};

const firstOrigin = (value) => String(value || '').split(',')[0].trim();
const BASE = normalizeOrigin(
    'SMOKE_BASE_URL',
    process.env.SMOKE_BASE_URL
        || process.env.API_BASE_URL
        || `http://localhost:${process.env.PORT || 3001}`
);
const FRONTEND = normalizeOrigin(
    'SMOKE_FRONTEND_URL',
    process.env.SMOKE_FRONTEND_URL
        || firstOrigin(process.env.FRONTEND_URL)
        || 'http://localhost:3000'
);
const ACCESS_TOKEN = String(process.env.SMOKE_ACCESS_TOKEN || '').trim();

const endpoint = (path) => new URL(path, `${BASE}/`).toString();

const readJson = async (response) => {
    try {
        return await response.json();
    } catch {
        throw new Error('response was not valid JSON');
    }
};

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const assertUnauthorized = (response, body) => {
    assert(response.status === 401, `received HTTP ${response.status}`);
    assert(body.success === false, 'error envelope success was not false');
    assert(
        body.code === 'UNAUTHORIZED' || body.error === 'Unauthorized',
        `received auth code ${body.code || 'missing'}`
    );
};

async function run() {
    console.log(`TejAi backend smoke test: ${BASE}\n`);
    const failures = [];

    const check = async (name, operation) => {
        try {
            await operation();
            console.log(`PASS ${name}`);
        } catch (error) {
            failures.push(name);
            console.error(`FAIL ${name}: ${error.message}`);
        }
    };

    await check('GET /api/health returns the healthy envelope', async () => {
        const response = await fetch(endpoint('/api/health'));
        const body = await readJson(response);
        assert(response.status === 200, `received HTTP ${response.status}`);
        assert(body.success === true, 'success was not true');
        assert(body.data?.status === 'healthy', 'health status was not healthy');
    });

    await check('GET /api/ready reports critical dependencies ready', async () => {
        const response = await fetch(endpoint('/api/ready'));
        const body = await readJson(response);
        assert(response.status === 200, `received HTTP ${response.status}`);
        assert(body.success === true, 'success was not true');
        assert(body.data?.status === 'ready', 'readiness status was not ready');
        assert(body.data?.checks?.database === 'ready', 'database was not ready');
        assert(body.data?.checks?.rateLimitStore === 'ready', 'rate-limit store was not ready');
    });

    await check('POST /api/scan authenticates before upload parsing', async () => {
        const form = new FormData();
        form.append(
            'image',
            new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
            'scan.jpg'
        );
        const response = await fetch(endpoint('/api/scan'), {
            method: 'POST',
            body: form,
        });
        const body = await readJson(response);
        assertUnauthorized(response, body);
    });

    await check('GET /api/history requires authentication', async () => {
        const response = await fetch(endpoint('/api/history'));
        const body = await readJson(response);
        assertUnauthorized(response, body);
    });

    await check('POST /api/billing/checkout requires authentication', async () => {
        const response = await fetch(endpoint('/api/billing/checkout'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
            },
            body: JSON.stringify({ plan: 'starter' }),
        });
        const body = await readJson(response);
        assertUnauthorized(response, body);
    });

    await check('GET /api/billing/subscription requires authentication', async () => {
        const response = await fetch(endpoint('/api/billing/subscription'));
        const body = await readJson(response);
        assertUnauthorized(response, body);
    });

    await check('legacy checkout remains quarantined', async () => {
        const response = await fetch(endpoint('/api/create-subscription'), {
            method: 'POST',
        });
        const body = await readJson(response);
        assert(response.status === 503, `received HTTP ${response.status}`);
        assert(
            body.code === 'BILLING_ENDPOINT_DISABLED',
            `received code ${body.code || 'missing'}`
        );
    });

    await check('pre-Day-9 webhook remains quarantined', async () => {
        const response = await fetch(endpoint('/api/webhook'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'subscription.active' }),
        });
        const body = await readJson(response);
        assert(response.status === 503, `received HTTP ${response.status}`);
        assert(body.code === 'WEBHOOK_NOT_READY', `received code ${body.code || 'missing'}`);
    });

    for (const relay of [
        ['return', 'returned'],
        ['cancel', 'cancelled'],
    ]) {
        const [route, marker] = relay;
        await check(`GET /api/billing/${route} is a fixed non-mutating relay`, async () => {
            const response = await fetch(
                endpoint(`/api/billing/${route}?plan=pro&status=paid&provider_id=discard-me`),
                { redirect: 'manual' }
            );
            assert(response.status === 303, `received HTTP ${response.status}`);
            assert(
                response.headers.get('location') === `${FRONTEND}/settings?checkout=${marker}`,
                'relay location was not the fixed Settings URL'
            );
            assert(
                response.headers.get('cache-control')?.includes('no-store'),
                'relay was cacheable'
            );
            assert(
                response.headers.get('referrer-policy') === 'no-referrer',
                'relay did not suppress the Referer header'
            );
        });
    }

    if (ACCESS_TOKEN) {
        const authorization = { Authorization: `Bearer ${ACCESS_TOKEN}` };

        await check('authenticated billing status is owner-scoped and safe', async () => {
            const response = await fetch(endpoint('/api/billing/subscription'), {
                headers: authorization,
            });
            const body = await readJson(response);
            assert(response.status === 200, `received HTTP ${response.status}`);
            assert(body.success === true, 'success was not true');
            assert(body.data?.schemaVersion === 1, 'schemaVersion was not 1');
            assert(
                ['free', 'starter', 'growth', 'pro'].includes(body.data?.plan),
                'plan was invalid'
            );
            for (const privateField of [
                'userId',
                'dodoCustomerId',
                'dodoSubscriptionId',
                'checkoutUrl',
            ]) {
                assert(!(privateField in body.data), `private field ${privateField} was returned`);
            }
        });

        await check('authenticated checkout kill switch is disabled', async () => {
            // The invalid free plan makes this probe non-provider-mutating even
            // if the kill switch was accidentally enabled.
            const response = await fetch(endpoint('/api/billing/checkout'), {
                method: 'POST',
                headers: {
                    ...authorization,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': '22222222-2222-4222-8222-222222222222',
                },
                body: JSON.stringify({ plan: 'free' }),
            });
            const body = await readJson(response);
            assert(response.status === 503, `received HTTP ${response.status}`);
            assert(
                body.code === 'BILLING_CHECKOUT_DISABLED',
                `received code ${body.code || 'missing'}`
            );
        });
    } else {
        console.log('SKIP authenticated billing status and kill-switch checks (no SMOKE_ACCESS_TOKEN)');
    }

    if (failures.length > 0) {
        console.error(`\nSmoke test failed: ${failures.length} required check(s) failed.`);
        process.exitCode = 1;
        return;
    }

    console.log('\nSmoke test passed.');
}

run().catch((error) => {
    console.error(`Smoke test could not run: ${error.message}`);
    process.exitCode = 1;
});
