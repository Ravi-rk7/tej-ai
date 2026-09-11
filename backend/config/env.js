import dotenv from 'dotenv';
dotenv.config();

export const APP_ENVIRONMENTS = Object.freeze([
    'development',
    'test',
    'staging',
    'production',
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

const configuredAppEnvironment = readEnv(
    'APP_ENV',
    readEnv('NODE_ENV', 'development')
).toLowerCase();

const env = Object.freeze({
    LIVE_SCAN_ENABLED: parseBoolean(readEnv('LIVE_SCAN_ENABLED', 'false')),
    SKIN_ANALYSIS_PROVIDER: 'facepp',
    ROUTINE_MODE: 'rules',
    FACEPP_API_KEY: readEnv('FACEPP_API_KEY'),
    FACEPP_API_SECRET: readEnv('FACEPP_API_SECRET'),
    FACEPP_WINDOW_CALL_LIMIT: parseInteger(readEnv('FACEPP_WINDOW_CALL_LIMIT', '80'), 80),
    FACEPP_DAILY_CALL_LIMIT: parseInteger(readEnv('FACEPP_DAILY_CALL_LIMIT', '5'), 5),
    APP_ENV: configuredAppEnvironment,
    NODE_ENV: readEnv('NODE_ENV', 'development'),
    PORT: parsePort(readEnv('PORT', '3001')),
    API_BASE_URL: readEnv('API_BASE_URL', 'http://localhost:3001'),
    FRONTEND_URL: readEnv('FRONTEND_URL', 'http://localhost:3000'),
    RELEASE_SHA: readEnv('RELEASE_SHA'),

    SUPABASE_URL: readEnv('SUPABASE_URL'),
    SUPABASE_ANON_KEY: readEnv('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: readEnv('SUPABASE_SERVICE_ROLE_KEY'),

    UPSTASH_REDIS_REST_URL: readEnv('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: readEnv('UPSTASH_REDIS_REST_TOKEN'),

    PRIVACY_NOTICE_VERSION: readEnv('PRIVACY_NOTICE_VERSION', 'facepp-portfolio-2026-09'),
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
