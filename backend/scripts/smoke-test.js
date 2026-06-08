/**
 * TejAi backend smoke test
 * Run with: node scripts/smoke-test.js
 * Requires a running backend and a valid .env.
 */

import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const BASE = `http://localhost:${process.env.PORT || 4000}`;

async function run() {
    console.log('TejAi Backend Smoke Test\n');

    try {
        const res = await fetch(`${BASE}/api/health`);
        const data = await res.json();
        console.log('GET /api/health ->', data);
    } catch (error) {
        console.error('GET /api/health failed:', error.message);
        console.error('Is the backend running? Run: npm start in /backend');
        process.exit(1);
    }

    try {
        const res = await fetch(`${BASE}/api/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: 'fake', mimeType: 'image/jpeg' }),
        });
        if (res.status === 401) {
            console.log('POST /api/scan (no auth) -> 401 Unauthorized (correct)');
        } else {
            console.warn(`POST /api/scan (no auth) -> ${res.status} (expected 401)`);
        }
    } catch (error) {
        console.error('POST /api/scan failed:', error.message);
    }

    try {
        const res = await fetch(`${BASE}/api/history`);
        if (res.status === 401) {
            console.log('GET /api/history (no auth) -> 401 Unauthorized (correct)');
        } else {
            console.warn(`GET /api/history (no auth) -> ${res.status} (expected 401)`);
        }
    } catch (error) {
        console.error('GET /api/history failed:', error.message);
    }

    try {
        const res = await fetch(`${BASE}/api/create-subscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: 'starter' }),
        });
        if (res.status === 401) {
            console.log('POST /api/create-subscription (no auth) -> 401 (correct)');
        } else {
            console.warn(`POST /api/create-subscription (no auth) -> ${res.status} (expected 401)`);
        }
    } catch (error) {
        console.error('POST /api/create-subscription failed:', error.message);
    }

    console.log('\nSmoke test complete. Fill in backend/.env and re-run after adding credentials.');
}

run();
