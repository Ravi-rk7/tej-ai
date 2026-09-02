import dotenv from 'dotenv';

dotenv.config();

export const DEFAULT_AILAB_API_URL =
    'https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro';

export const APP_ENVIRONMENTS = Object.freeze([
    'development',
    'test',
    'staging',
    'production',
]);

export const DODO_ENVIRONMENTS = Object.freeze(['test_mode', 'live_mode']);

export const DODO_API_BASE_URLS = Object.freeze({
    test_mode: 'https://test.dodopayments.com',
    live_mode: 'https://live.dodopayments.com',
});

export const REQUIRED_RUNTIME_ENV = Object.freeze([
    'APP_ENV',
    'DODO_ENVIRONMENT',
    'API_BASE_URL',
    'FRONTEND_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'AILABTOOLS_API_KEY',
    'OPENAI_API_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'DODO_API_KEY',
    'DODO_WEBHOOK_SECRET',
    'DODO_PRODUCT_ID_STARTER',
    'DODO_PRODUCT_ID_GROWTH',
    'DODO_PRODUCT_ID_PRO',
]);

const readEnv = (key, defaultValue = '') => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim() ? value.trim() : defaultValue;
};

const parsePort = (value) => {
    const port = Number.parseInt(value, 10);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3001;
};

const parseBoolean = (value, defaultValue = false) => {
    if (typeof value !== 'string' || !value.trim()) return defaultValue;
    if (value.trim().toLowerCase() === 'true') return true;
    if (value.trim().toLowerCase() === 'false') return false;
    return defaultValue;
};

const parseInteger = (value, defaultValue) => {
    const parsed = Number(String(value || ''));
    return Number.isInteger(parsed) ? parsed : defaultValue;
};

const assertIntegerInRange = (name, value, minimum, maximum, { required = false } = {}) => {
    if (value === undefined || String(value).trim() === '') {
        if (required) throw new Error(`${name} is required`);
        return;
    }

    const parsed = Number(String(value));
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
};

const assertValidUrl = (name, value, protocols = ['http:', 'https:']) => {
    try {
        const parsed = new URL(value);
        if (!protocols.includes(parsed.protocol)) {
            throw new Error(`unsupported protocol ${parsed.protocol}`);
        }
    } catch {
        throw new Error(`${name} must be a valid ${protocols.join(' or ')} URL`);
    }
};

const isLocalHostname = (hostname) =>
    ['localhost', '127.0.0.1', '::1'].includes(hostname);

const normalizeOrigin = (name, value, { publicHttps = false } = {}) => {
    assertValidUrl(name, value);
    const parsed = new URL(value);
    const comparable = value.endsWith('/') ? value.slice(0, -1) : value;

    if (
        parsed.username
        || parsed.password
        || parsed.search
        || parsed.hash
        || parsed.pathname !== '/'
        || comparable !== parsed.origin
    ) {
        throw new Error(`${name} must be a canonical origin without a path, query, hash, or credentials`);
    }

    if (
        publicHttps
        && (parsed.protocol !== 'https:' || isLocalHostname(parsed.hostname))
    ) {
        throw new Error(`${name} must be a public HTTPS origin`);
    }

    return parsed.origin;
};

export const getFrontendOrigins = (value, options = {}) => {
    const origins = String(value || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin, index) => normalizeOrigin(
            `FRONTEND_URL${index ? `[${index}]` : ''}`,
            origin,
            options
        ));

    if (origins.length === 0) {
        throw new Error('FRONTEND_URL must contain at least one canonical origin');
    }

    if (new Set(origins).size !== origins.length) {
        throw new Error('FRONTEND_URL must not contain duplicate origins');
    }

    return origins;
};

export const buildBillingUrls = ({ apiOrigin, frontendOrigin }) => ({
    checkoutReturnUrl: `${apiOrigin}/api/billing/return`,
    checkoutCancelUrl: `${apiOrigin}/api/billing/cancel`,
    returnRedirectUrl: `${frontendOrigin}/settings?checkout=returned`,
    cancelRedirectUrl: `${frontendOrigin}/settings?checkout=cancelled`,
});

const assertExactUrl = (name, value, expected) => {
    assertValidUrl(name, value);
    if (new URL(value).toString() !== new URL(expected).toString()) {
        throw new Error(`${name} must equal ${expected}`);
    }
};

/**
 * Validate runtime configuration without terminating the process during imports.
 * Keeping validation explicit makes the app testable while production still fails
 * closed before the HTTP listener starts.
 */
export const validateEnvironment = ({
    source = process.env,
    required = REQUIRED_RUNTIME_ENV,
} = {}) => {
    const missing = required.filter((key) => {
        const value = source[key];
        return typeof value !== 'string' || !value.trim();
    });

    if (missing.length > 0) {
        const error = new Error(
            `Missing required environment variables: ${missing.join(', ')}`
        );
        error.code = 'ENV_VALIDATION_ERROR';
        error.missing = missing;
        throw error;
    }

    assertValidUrl('SUPABASE_URL', source.SUPABASE_URL);
    assertValidUrl('UPSTASH_REDIS_REST_URL', source.UPSTASH_REDIS_REST_URL);
    const ailabApiUrl = source.AILAB_API_URL || DEFAULT_AILAB_API_URL;
    assertValidUrl('AILAB_API_URL', ailabApiUrl, ['https:']);

    const appEnvironment = String(source.APP_ENV || '').trim().toLowerCase();
    if (!APP_ENVIRONMENTS.includes(appEnvironment)) {
        throw new Error(`APP_ENV must be one of: ${APP_ENVIRONMENTS.join(', ')}`);
    }

    const releaseSha = String(source.RELEASE_SHA || '').trim();
    if (releaseSha && !/^[a-f0-9]{7,40}$/i.test(releaseSha)) {
        throw new Error('RELEASE_SHA must be a 7 to 40 character Git commit SHA');
    }

    const dodoEnvironment = String(source.DODO_ENVIRONMENT || '').trim().toLowerCase();
    if (!DODO_ENVIRONMENTS.includes(dodoEnvironment)) {
        throw new Error(`DODO_ENVIRONMENT must be one of: ${DODO_ENVIRONMENTS.join(', ')}`);
    }

    const expectedDodoEnvironment = appEnvironment === 'production'
        ? 'live_mode'
        : 'test_mode';
    if (dodoEnvironment !== expectedDodoEnvironment) {
        throw new Error(
            `DODO_ENVIRONMENT must be ${expectedDodoEnvironment} when APP_ENV is ${appEnvironment}`
        );
    }

    const requirePublicHttps = appEnvironment === 'staging' || appEnvironment === 'production';
    const apiOrigin = normalizeOrigin('API_BASE_URL', source.API_BASE_URL, {
        publicHttps: requirePublicHttps,
    });
    const frontendOrigins = getFrontendOrigins(source.FRONTEND_URL, {
        publicHttps: requirePublicHttps,
    });

    const expectedDodoBaseUrl = DODO_API_BASE_URLS[dodoEnvironment];
    const configuredDodoBaseUrl = source.DODO_API_BASE_URL || expectedDodoBaseUrl;
    assertExactUrl('DODO_API_BASE_URL', configuredDodoBaseUrl, expectedDodoBaseUrl);

    const productIds = [
        source.DODO_PRODUCT_ID_STARTER,
        source.DODO_PRODUCT_ID_GROWTH,
        source.DODO_PRODUCT_ID_PRO,
    ].map((value) => value.trim());
    if (new Set(productIds).size !== productIds.length) {
        throw new Error('Dodo product IDs must be distinct for Starter, Growth, and Pro');
    }

    const checkoutEnabled = source.BILLING_CHECKOUT_ENABLED;
    if (
        checkoutEnabled !== undefined
        && !['true', 'false'].includes(String(checkoutEnabled).trim().toLowerCase())
    ) {
        throw new Error('BILLING_CHECKOUT_ENABLED must be true or false');
    }

    for (const flag of ['BILLING_WEBHOOK_ENABLED', 'BILLING_PORTAL_ENABLED']) {
        const value = source[flag];
        if (
            value !== undefined
            && !['true', 'false'].includes(String(value).trim().toLowerCase())
        ) {
            throw new Error(`${flag} must be true or false`);
        }
    }

    const consentEnforcement = source.PRIVACY_CONSENT_ENFORCEMENT;
    if (
        consentEnforcement !== undefined
        && !['true', 'false'].includes(String(consentEnforcement).trim().toLowerCase())
    ) {
        throw new Error('PRIVACY_CONSENT_ENFORCEMENT must be true or false');
    }

    if (
        appEnvironment === 'production'
        && String(consentEnforcement || 'true').trim().toLowerCase() !== 'true'
    ) {
        throw new Error('PRIVACY_CONSENT_ENFORCEMENT must be true in production');
    }

    const noticeVersion = String(source.PRIVACY_NOTICE_VERSION || 'face-scan-2026-01').trim();
    if (!/^[a-z0-9][a-z0-9._-]{2,99}$/i.test(noticeVersion)) {
        throw new Error('PRIVACY_NOTICE_VERSION must be a stable version identifier');
    }

    const auditRetentionDays = Number(
        String(source.PRIVACY_AUDIT_RETENTION_DAYS || '365')
    );
    if (!Number.isInteger(auditRetentionDays) || auditRetentionDays < 30 || auditRetentionDays > 3650) {
        throw new Error('PRIVACY_AUDIT_RETENTION_DAYS must be between 30 and 3650');
    }

    const deletionSecret = String(source.DELETION_AUDIT_HMAC_SECRET || '');
    if (
        (appEnvironment === 'staging' || appEnvironment === 'production')
        && deletionSecret.length < 32
    ) {
        throw new Error('DELETION_AUDIT_HMAC_SECRET must contain at least 32 characters outside development');
    }

    const securitySecret = String(source.SECURITY_HMAC_SECRET || '');
    if (
        (appEnvironment === 'staging' || appEnvironment === 'production')
        && securitySecret.length < 32
    ) {
        throw new Error('SECURITY_HMAC_SECRET must contain at least 32 characters outside development');
    }
    if (
        (appEnvironment === 'staging' || appEnvironment === 'production')
        && securitySecret === deletionSecret
    ) {
        throw new Error('SECURITY_HMAC_SECRET must be independent from DELETION_AUDIT_HMAC_SECRET');
    }

    if (String(source.BILLING_WEBHOOK_ENABLED || '').trim().toLowerCase() === 'true'
        && (!source.DODO_BUSINESS_ID || !String(source.DODO_BUSINESS_ID).trim())) {
        throw new Error('DODO_BUSINESS_ID is required when BILLING_WEBHOOK_ENABLED is true');
    }

    const billingUrls = buildBillingUrls({
        apiOrigin,
        frontendOrigin: frontendOrigins[0],
    });
    assertExactUrl(
        'DODO_CHECKOUT_RETURN_URL',
        source.DODO_CHECKOUT_RETURN_URL || billingUrls.checkoutReturnUrl,
        billingUrls.checkoutReturnUrl
    );
    assertExactUrl(
        'DODO_CHECKOUT_CANCEL_URL',
        source.DODO_CHECKOUT_CANCEL_URL || billingUrls.checkoutCancelUrl,
        billingUrls.checkoutCancelUrl
    );

    if (
        (appEnvironment === 'staging' || appEnvironment === 'production')
        && new URL(ailabApiUrl).hostname !== 'www.ailabapi.com'
    ) {
        throw new Error('AILAB_API_URL must use the official provider host outside local development');
    }

    assertIntegerInRange(
        'AILAB_DAILY_CALL_LIMIT',
        source.AILAB_DAILY_CALL_LIMIT,
        requirePublicHttps ? 1 : 0,
        100_000,
        { required: requirePublicHttps }
    );
    assertIntegerInRange(
        'OPENAI_DAILY_CALL_LIMIT',
        source.OPENAI_DAILY_CALL_LIMIT,
        requirePublicHttps ? 1 : 0,
        100_000,
        { required: requirePublicHttps }
    );
    assertIntegerInRange(
        'PROVIDER_USAGE_RETENTION_DAYS',
        source.PROVIDER_USAGE_RETENTION_DAYS || '90',
        30,
        365
    );
    assertIntegerInRange(
        'READINESS_TIMEOUT_MS',
        source.READINESS_TIMEOUT_MS || '1000',
        100,
        5000
    );
    assertIntegerInRange(
        'READINESS_CACHE_MS',
        source.READINESS_CACHE_MS || '30000',
        0,
        60_000
    );

    if (source.SENTRY_DSN) {
        assertValidUrl('SENTRY_DSN', source.SENTRY_DSN, ['https:']);
    }

    return true;
};

const configuredAppEnvironment = readEnv(
    'APP_ENV',
    readEnv('NODE_ENV', 'development')
).toLowerCase();
const configuredDodoEnvironment = readEnv(
    'DODO_ENVIRONMENT',
    configuredAppEnvironment === 'production' ? 'live_mode' : 'test_mode'
).toLowerCase();
const configuredApiOrigin = readEnv('API_BASE_URL', 'http://localhost:3001').replace(/\/$/, '');
const configuredFrontendOrigins = readEnv('FRONTEND_URL', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
const configuredBillingUrls = buildBillingUrls({
    apiOrigin: configuredApiOrigin,
    frontendOrigin: configuredFrontendOrigins[0] || 'http://localhost:3000',
});

const env = Object.freeze({
    APP_ENV: configuredAppEnvironment,
    NODE_ENV: readEnv('NODE_ENV', 'development'),
    PORT: parsePort(readEnv('PORT', '3001')),
    API_BASE_URL: readEnv('API_BASE_URL', 'http://localhost:3001'),
    FRONTEND_URL: readEnv('FRONTEND_URL', 'http://localhost:3000'),
    RELEASE_SHA: readEnv('RELEASE_SHA'),

    SUPABASE_URL: readEnv('SUPABASE_URL'),
    SUPABASE_ANON_KEY: readEnv('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: readEnv('SUPABASE_SERVICE_ROLE_KEY'),

    AILAB_API_KEY: readEnv('AILABTOOLS_API_KEY'),
    AILAB_API_URL: readEnv(
        'AILAB_API_URL',
        DEFAULT_AILAB_API_URL
    ),

    OPENAI_API_KEY: readEnv('OPENAI_API_KEY'),
    AILAB_DAILY_CALL_LIMIT: parseInteger(readEnv('AILAB_DAILY_CALL_LIMIT', '0'), 0),
    OPENAI_DAILY_CALL_LIMIT: parseInteger(readEnv('OPENAI_DAILY_CALL_LIMIT', '0'), 0),
    PROVIDER_USAGE_RETENTION_DAYS: parseInteger(
        readEnv('PROVIDER_USAGE_RETENTION_DAYS', '90'),
        90
    ),

    UPSTASH_REDIS_REST_URL: readEnv('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: readEnv('UPSTASH_REDIS_REST_TOKEN'),

    DODO_API_KEY: readEnv('DODO_API_KEY'),
    DODO_WEBHOOK_SECRET: readEnv('DODO_WEBHOOK_SECRET'),
    DODO_BUSINESS_ID: readEnv('DODO_BUSINESS_ID'),
    DODO_PRODUCT_ID_STARTER: readEnv('DODO_PRODUCT_ID_STARTER'),
    DODO_PRODUCT_ID_GROWTH: readEnv('DODO_PRODUCT_ID_GROWTH'),
    DODO_PRODUCT_ID_PRO: readEnv('DODO_PRODUCT_ID_PRO'),
    DODO_ENVIRONMENT: configuredDodoEnvironment,
    DODO_API_BASE_URL: readEnv(
        'DODO_API_BASE_URL',
        DODO_API_BASE_URLS[configuredDodoEnvironment] || DODO_API_BASE_URLS.test_mode
    ).replace(/\/$/, ''),
    DODO_CHECKOUT_RETURN_URL: readEnv(
        'DODO_CHECKOUT_RETURN_URL',
        configuredBillingUrls.checkoutReturnUrl
    ),
    DODO_CHECKOUT_CANCEL_URL: readEnv(
        'DODO_CHECKOUT_CANCEL_URL',
        configuredBillingUrls.checkoutCancelUrl
    ),
    BILLING_RETURN_REDIRECT_URL: configuredBillingUrls.returnRedirectUrl,
    BILLING_CANCEL_REDIRECT_URL: configuredBillingUrls.cancelRedirectUrl,
    BILLING_CHECKOUT_ENABLED: parseBoolean(
        readEnv('BILLING_CHECKOUT_ENABLED', 'false')
    ),
    BILLING_WEBHOOK_ENABLED: parseBoolean(
        readEnv('BILLING_WEBHOOK_ENABLED', 'false')
    ),
    BILLING_PORTAL_ENABLED: parseBoolean(
        readEnv('BILLING_PORTAL_ENABLED', 'false')
    ),

    PRIVACY_NOTICE_VERSION: readEnv('PRIVACY_NOTICE_VERSION', 'face-scan-2026-01'),
    PRIVACY_CONSENT_ENFORCEMENT: parseBoolean(
        readEnv('PRIVACY_CONSENT_ENFORCEMENT', 'true'),
        true
    ),
    PRIVACY_AUDIT_RETENTION_DAYS: parseInteger(
        readEnv('PRIVACY_AUDIT_RETENTION_DAYS', '365'),
        365
    ),
    DELETION_AUDIT_HMAC_SECRET: readEnv('DELETION_AUDIT_HMAC_SECRET'),
    SECURITY_HMAC_SECRET: readEnv('SECURITY_HMAC_SECRET'),

    READINESS_TIMEOUT_MS: parseInteger(readEnv('READINESS_TIMEOUT_MS', '1000'), 1000),
    READINESS_CACHE_MS: parseInteger(readEnv('READINESS_CACHE_MS', '30000'), 30000),
    SENTRY_DSN: readEnv('SENTRY_DSN'),

    LOG_LEVEL: readEnv('LOG_LEVEL', 'info'),
});

export default env;
