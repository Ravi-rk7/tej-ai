import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CONFIRMATION = 'I_ACKNOWLEDGE_STAGING_BUDGET_ONLY';
const PROVIDERS = new Set(['ailabtools', 'openai']);

const required = (name) => {
    const value = String(process.env[name] || '').trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
};

if (process.env.BUDGET_TEST_CONFIRM !== CONFIRMATION) {
    throw new Error(`BUDGET_TEST_CONFIRM must equal ${CONFIRMATION}`);
}
if (process.env.APP_ENV !== 'staging') {
    throw new Error('APP_ENV must be staging');
}

const stagingProjectRef = required('BUDGET_TEST_STAGING_PROJECT_REF').toLowerCase();
const productionProjectRef = required('BUDGET_TEST_PRODUCTION_PROJECT_REF').toLowerCase();
if (stagingProjectRef === productionProjectRef) {
    throw new Error('Staging and production project references must differ');
}

const supabaseUrl = new URL(required('SUPABASE_URL'));
if (
    supabaseUrl.protocol !== 'https:'
    || supabaseUrl.hostname !== `${stagingProjectRef}.supabase.co`
) {
    throw new Error('SUPABASE_URL must exactly match the confirmed staging project');
}
if (supabaseUrl.hostname === `${productionProjectRef}.supabase.co`) {
    throw new Error('Provider budget verification is forbidden in production');
}

const provider = String(process.env.BUDGET_TEST_PROVIDER || '').trim();
if (!PROVIDERS.has(provider)) {
    throw new Error('BUDGET_TEST_PROVIDER must be ailabtools or openai');
}

const concurrency = Number(process.env.BUDGET_TEST_CONCURRENCY || '8');
if (!Number.isInteger(concurrency) || concurrency < 2 || concurrency > 20) {
    throw new Error('BUDGET_TEST_CONCURRENCY must be between 2 and 20');
}

const database = createClient(supabaseUrl.origin, required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
});
const usageDate = new Date().toISOString().slice(0, 10);
const { data: beforeRows, error: beforeError } = await database.rpc(
    'get_provider_usage_summary',
    { p_usage_date: usageDate }
);
if (beforeError) throw new Error('Unable to read staging provider usage summary');
const currentUsed = Number(
    (beforeRows || []).find((row) => row.provider === provider)?.attempted || 0
);
if (!Number.isInteger(currentUsed) || currentUsed < 0 || currentUsed >= 99_999) {
    throw new Error('Staging provider usage summary is invalid');
}

// One slot above the current count proves concurrent reservations serialize.
// This creates exactly one identity-free synthetic reservation and no provider request.
const dailyLimit = currentUsed + 1;
const reservations = await Promise.all(Array.from({ length: concurrency }, async () => {
    const { data, error } = await database.rpc('reserve_provider_call_budget', {
        p_provider: provider,
        p_daily_limit: dailyLimit,
    });
    if (error) throw new Error('Concurrent staging budget reservation failed');
    const row = Array.isArray(data) ? data[0] : data;
    return {
        granted: row?.granted === true,
        reservationId: row?.reservation_id || null,
    };
}));

const granted = reservations.filter((reservation) => reservation.granted);
const denied = reservations.filter((reservation) => !reservation.granted);
if (granted.length !== 1 || denied.length !== concurrency - 1) {
    throw new Error('Atomic provider budget verification did not grant exactly one slot');
}

const { data: finalizedRows, error: finalizationError } = await database.rpc(
    'finalize_provider_call',
    {
        p_reservation_id: granted[0].reservationId,
        p_state: 'unknown',
        p_outcome: 'unknown',
        p_input_units: 0,
        p_output_units: 0,
        p_estimated_cost_micros: 0,
    }
);
const finalized = Array.isArray(finalizedRows) ? finalizedRows[0] : finalizedRows;
if (finalizationError || finalized?.finalized !== true) {
    throw new Error('Synthetic staging budget reservation could not be finalized');
}

process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    environment: 'staging',
    usageDate,
    provider,
    currentUsed,
    syntheticReservations: 1,
    concurrentRequests: concurrency,
    granted: granted.length,
    denied: denied.length,
    providerHttpCalls: 0,
})}\n`);
