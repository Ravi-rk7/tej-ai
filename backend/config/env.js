import dotenv from 'dotenv';
dotenv.config();

const REQUIRED_ENV = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'AILABTOOLS_API_KEY',
    'OPENAI_API_KEY',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'DODO_API_KEY',
    'DODO_WEBHOOK_SECRET',
];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('   Copy backend/.env.example -> backend/.env and fill in values.');
    process.exit(1);
}

const getEnv = (key, defaultValue = null) => {
    const value = process.env[key];
    if (!value && !defaultValue) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value || defaultValue;
};

export default {
    // Node
    NODE_ENV: getEnv('NODE_ENV', 'development'),
    PORT: parseInt(getEnv('PORT', '3001'), 10),
    API_BASE_URL: getEnv('API_BASE_URL', 'http://localhost:3001'),
    FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3000'),

    // Supabase
    SUPABASE_URL: getEnv('SUPABASE_URL'),
    SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY', ''),
    SUPABASE_SERVICE_ROLE_KEY: getEnv('SUPABASE_SERVICE_ROLE_KEY'),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: getEnv('CLOUDINARY_CLOUD_NAME'),
    CLOUDINARY_API_KEY: getEnv('CLOUDINARY_API_KEY'),
    CLOUDINARY_API_SECRET: getEnv('CLOUDINARY_API_SECRET'),

    // AILab Tools
    AILAB_API_KEY: getEnv('AILABTOOLS_API_KEY'),
    AILAB_API_URL: getEnv('AILAB_API_URL', 'https://api.ailabtools.com/v1'),

    // OpenAI
    OPENAI_API_KEY: getEnv('OPENAI_API_KEY'),

    // Upstash Redis
    UPSTASH_REDIS_REST_URL: getEnv('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: getEnv('UPSTASH_REDIS_REST_TOKEN'),

    // Dodo Payments
    DODO_API_KEY: getEnv('DODO_API_KEY'),
    DODO_WEBHOOK_SECRET: getEnv('DODO_WEBHOOK_SECRET'),
    DODO_PRODUCT_ID_STARTER: getEnv('DODO_PRODUCT_ID_STARTER', ''),
    DODO_PRODUCT_ID_GROWTH: getEnv('DODO_PRODUCT_ID_GROWTH', ''),
    DODO_PRODUCT_ID_PRO: getEnv('DODO_PRODUCT_ID_PRO', ''),
    DODO_API_BASE_URL: getEnv('DODO_API_BASE_URL', 'https://api.dodopayments.com'),

    // Supabase Storage
    SUPABASE_STORAGE_BUCKET: getEnv('SUPABASE_STORAGE_BUCKET', 'scan-references'),

    // Logging
    LOG_LEVEL: getEnv('LOG_LEVEL', 'info'),
};
