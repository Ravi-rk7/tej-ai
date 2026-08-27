import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
    '../db/migrations/202608280002_day_10_privacy_deletion.sql',
    import.meta.url
);
const schemaUrl = new URL('../db/schema.sql', import.meta.url);

const requiredFragments = [
    'CREATE TABLE IF NOT EXISTS public.privacy_consent_events',
    'CREATE TABLE IF NOT EXISTS public.privacy_deletion_audits',
    'CREATE TABLE IF NOT EXISTS public.deleted_billing_subjects',
    'CREATE OR REPLACE FUNCTION public.delete_user_scan_with_audit',
    'CREATE OR REPLACE FUNCTION public.claim_account_deletion',
    'CREATE OR REPLACE FUNCTION public.prepare_account_billing_deletion',
    'CREATE OR REPLACE FUNCTION public.record_deleted_dodo_subscription_event',
    'ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY',
    'REVOKE ALL ON TABLE public.privacy_consent_events FROM PUBLIC, anon, authenticated',
    'TO service_role',
];

test('Day 10 migration defines private append-only consent and pseudonymous deletion state', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    for (const fragment of requiredFragments) {
        assert.match(sql, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }

    assert.match(sql, /user_id UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    assert.match(sql, /subject_hash TEXT NOT NULL/);
    assert.match(sql, /subscription_hash TEXT PRIMARY KEY/);
    assert.doesNotMatch(sql, /privacy_deletion_audits[\s\S]{0,800}\bemail\b/i);
    assert.doesNotMatch(sql, /privacy_deletion_audits[\s\S]{0,800}\bpassword\b/i);
    assert.doesNotMatch(sql, /privacy_deletion_audits[\s\S]{0,800}\bimage_(?:url|bytes)\b/i);
});

test('canonical schema contains the exact Day 10 migration and no patch artifacts', async () => {
    const [migration, schema] = await Promise.all([
        readFile(migrationUrl, 'utf8'),
        readFile(schemaUrl, 'utf8'),
    ]);

    assert.ok(schema.includes(migration.trim()));
    assert.doesNotMatch(schema, /^\+/m);
});
