/* eslint-disable no-console -- CLI diagnostics contain only check names and status. */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Read-only checks: never uploads a portrait, creates a user, or changes data.
const local = dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true }).parsed || {};
const frontend = dotenv.config({ path: fileURLToPath(new URL('../../frontend/.env.local', import.meta.url)), quiet: true }).parsed || {};
const env = { ...local, ...process.env };
let failures = 0;
const report = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures++; };
const read = async (url, headers) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  return { ok: response.ok, body: await response.json() };
};
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'FACEPP_API_KEY', 'FACEPP_API_SECRET']) report(`${name} configured`, Boolean(env[name]));
for (const name of ['SECURITY_HMAC_SECRET', 'DELETION_AUDIT_HMAC_SECRET']) report(`${name} at least 32 characters`, (env[name] || '').length >= 32);
report('Independent security and audit secrets', Boolean(env.SECURITY_HMAC_SECRET) && env.SECURITY_HMAC_SECRET !== env.DELETION_AUDIT_HMAC_SECRET);
try {
  const { ok, body } = await read(`${env.SUPABASE_URL}/auth/v1/settings`, { apikey: frontend.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY });
  report('Google OAuth enabled', ok && body.external?.google === true);
  report('GitHub OAuth enabled', ok && body.external?.github === true);
} catch { report('Supabase auth reachable', false); }
for (const table of ['skin_analysis', 'routine_checkins', 'user_progress_preferences', 'privacy_consent_events', 'privacy_deletion_audits', 'portfolio_scan_requests', 'portfolio_deletion_challenges']) {
  try {
    const { ok } = await read(`${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` });
    report(`Database table ${table}`, ok);
  } catch { report(`Database table ${table}`, false); }
}
try {
  const { ok, body } = await read(`${env.UPSTASH_REDIS_REST_URL}/ping`, { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` });
  report('Upstash reachable', ok && body.result === 'PONG');
} catch { report('Upstash reachable', false); }
report('Live scan flag enabled', env.LIVE_SCAN_ENABLED === 'true');
console.log('These checks do not verify OAuth redirects, database functions, or a real provider request.');
process.exitCode = failures ? 1 : 0;
