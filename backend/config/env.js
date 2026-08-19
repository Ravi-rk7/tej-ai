import dotenv from 'dotenv';

dotenv.config();

export const DEFAULT_AILAB_API_URL =
    'https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro';

export const REQUIRED_RUNTIME_ENV = Object.freeze([
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

    const frontendUrl = source.FRONTEND_URL || 'http://localhost:3000';
    assertValidUrl('FRONTEND_URL', frontendUrl);

    if (source.NODE_ENV === 'production') {
        const parsedFrontendUrl = new URL(frontendUrl);
        if (
            parsedFrontendUrl.protocol !== 'https:'
            || ['localhost', '127.0.0.1', '::1'].includes(parsedFrontendUrl.hostname)
        ) {
            throw new Error('FRONTEND_URL must be a public HTTPS URL in production');
        }

        const dodoBaseUrl = source.DODO_API_BASE_URL || 'https://test.dodopayments.com';
        assertValidUrl('DODO_API_BASE_URL', dodoBaseUrl, ['https:']);
        if (new URL(dodoBaseUrl).hostname.startsWith('test.')) {
            throw new Error('DODO_API_BASE_URL must use live mode in production');
        }

        if (new URL(ailabApiUrl).hostname !== 'www.ailabapi.com') {
            throw new Error('AILAB_API_URL must use the official provider host in production');
        }
    }

    return true;
};

const env = Object.freeze({
    NODE_ENV: readEnv('NODE_ENV', 'development'),
    PORT: parsePort(readEnv('PORT', '3001')),
    API_BASE_URL: readEnv('API_BASE_URL', 'http://localhost:3001'),
    FRONTEND_URL: readEnv('FRONTEND_URL', 'http://localhost:3000'),

    SUPABASE_URL: readEnv('SUPABASE_URL'),
    SUPABASE_ANON_KEY: readEnv('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: readEnv('SUPABASE_SERVICE_ROLE_KEY'),

    AILAB_API_KEY: readEnv('AILABTOOLS_API_KEY'),
    AILAB_API_URL: readEnv(
        'AILAB_API_URL',
        DEFAULT_AILAB_API_URL
    ),

    OPENAI_API_KEY: readEnv('OPENAI_API_KEY'),

    UPSTASH_REDIS_REST_URL: readEnv('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: readEnv('UPSTASH_REDIS_REST_TOKEN'),

    DODO_API_KEY: readEnv('DODO_API_KEY'),
    DODO_WEBHOOK_SECRET: readEnv('DODO_WEBHOOK_SECRET'),
    DODO_PRODUCT_ID_STARTER: readEnv('DODO_PRODUCT_ID_STARTER'),
    DODO_PRODUCT_ID_GROWTH: readEnv('DODO_PRODUCT_ID_GROWTH'),
    DODO_PRODUCT_ID_PRO: readEnv('DODO_PRODUCT_ID_PRO'),
    DODO_API_BASE_URL: readEnv('DODO_API_BASE_URL', 'https://test.dodopayments.com'),

    LOG_LEVEL: readEnv('LOG_LEVEL', 'info'),
});

export default env;
