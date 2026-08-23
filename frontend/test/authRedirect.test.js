import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthPath, getNextFromSearch, getSafeInternalPath } from '../src/lib/authRedirect.js';

test('preserves an internal billing destination through authentication', () => {
    const next = '/settings?plan=growth';
    assert.equal(getSafeInternalPath(next), next);
    const loginPath = buildAuthPath('/login', next);
    assert.equal(getNextFromSearch(new URL(loginPath, 'https://tejai.example').searchParams), next);
});

test('rejects external, protocol-relative, backslash, encoded, and control-character redirects', () => {
    const attacks = [
        'https://evil.example',
        '//evil.example/path',
        '/\\evil.example/path',
        '/%5c%5cevil.example/path',
        '/%252f%252fevil.example/path',
        '/safe%0d%0aLocation:%20https://evil.example',
    ];
    for (const attack of attacks) {
        assert.equal(getSafeInternalPath(attack), '/dashboard');
    }
});

test('uses a caller-provided safe fallback for missing destinations', () => {
    assert.equal(getSafeInternalPath(null, '/scan'), '/scan');
    assert.equal(getNextFromSearch(new URLSearchParams(), '/history'), '/history');
});
