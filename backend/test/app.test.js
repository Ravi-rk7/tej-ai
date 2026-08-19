import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';

let server;
let baseUrl;

before(async () => {
    await new Promise((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', () => {
            const address = server.address();
            baseUrl = `http://127.0.0.1:${address.port}`;
            resolve();
        });
        server.on('error', reject);
    });
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

test('GET /api/health returns a healthy envelope', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'healthy');
    assert.ok(Date.parse(body.data.timestamp));
    assert.equal(response.headers.get('x-powered-by'), null);
});

test('CORS does not authorize an unconfigured origin', async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://attacker.example' },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(body.code, 'CORS_ORIGIN_DENIED');
});

test('CORS authorizes the configured frontend origin', async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'http://localhost:3000' },
    });

    assert.equal(response.status, 200);
    assert.equal(
        response.headers.get('access-control-allow-origin'),
        'http://localhost:3000'
    );
});

test('unknown routes return a stable 404 error code', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
        success: false,
        error: 'Not Found',
        code: 'NOT_FOUND',
    });
});

test('protected endpoints reject missing authorization before external calls', async () => {
    const response = await fetch(`${baseUrl}/api/history`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error, 'Unauthorized');
});
