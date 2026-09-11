import { APP_ENVIRONMENTS, getFrontendOrigins } from './env.js';

export const FACEPP_ENDPOINT = 'https://api-us.faceplusplus.com/facepp/v1/skinanalyze';
export const PORTFOLIO_REQUIRED_ENV = Object.freeze([
  'APP_ENV', 'API_BASE_URL', 'FRONTEND_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
]);

export const validatePortfolioEnvironment = ({ source = process.env } = {}) => {
  const missing = PORTFOLIO_REQUIRED_ENV.filter(key => !String(source[key] || '').trim());
  if (missing.length) throw Object.assign(new Error('Missing portfolio configuration'), { code: 'ENV_VALIDATION_ERROR', missing });
  if (!APP_ENVIRONMENTS.includes(source.APP_ENV)) throw new Error('Invalid APP_ENV');
  const publicHttps = ['production', 'staging'].includes(source.APP_ENV);
  for (const key of ['API_BASE_URL', 'FRONTEND_URL', 'SUPABASE_URL', 'UPSTASH_REDIS_REST_URL']) {
    const origins = getFrontendOrigins(source[key], { publicHttps });
    if (key !== 'FRONTEND_URL' && origins.length !== 1) throw new Error(`${key} requires one origin`);
  }
  for (const key of ['LIVE_SCAN_ENABLED', 'PRIVACY_CONSENT_ENFORCEMENT']) {
    if (source[key] !== undefined && !['true', 'false'].includes(source[key])) throw new Error(`${key} must be true or false`);
  }
  if (source.PRIVACY_CONSENT_ENFORCEMENT === 'false') throw new Error('Face-scan consent must remain enabled');
  if (publicHttps) {
    for (const key of ['SECURITY_HMAC_SECRET', 'DELETION_AUDIT_HMAC_SECRET']) {
      if (String(source[key] || '').length < 32) throw new Error(`${key} must contain at least 32 characters`);
    }
    if (source.SECURITY_HMAC_SECRET === source.DELETION_AUDIT_HMAC_SECRET) throw new Error('Audit and security secrets must differ');
  }
  if (source.SKIN_ANALYSIS_PROVIDER && source.SKIN_ANALYSIS_PROVIDER !== 'facepp') throw new Error('Only Face++ is enabled in the portfolio runtime');
  if (source.ROUTINE_MODE && source.ROUTINE_MODE !== 'rules') throw new Error('The portfolio routine mode is rules');
  if (source.LIVE_SCAN_ENABLED === 'true') {
    for (const key of ['FACEPP_API_KEY', 'FACEPP_API_SECRET']) if (!String(source[key] || '').trim()) throw new Error(`${key} is required for live scanning`);
    if (source.PRIVACY_NOTICE_VERSION && source.PRIVACY_NOTICE_VERSION !== 'facepp-portfolio-2026-09') throw new Error('Update consent to the Face++ portfolio notice before enabling scans');
  }
  if (source.FACEPP_API_URL && source.FACEPP_API_URL !== FACEPP_ENDPOINT) throw new Error('Use the verified US Face++ endpoint');
  for (const [key, fallback, max] of [['FACEPP_WINDOW_CALL_LIMIT', 80, 80], ['FACEPP_DAILY_CALL_LIMIT', 5, 5], ['READINESS_TIMEOUT_MS', 1000, 5000], ['READINESS_CACHE_MS', 30000, 60000]]) {
    const number = Number(source[key] ?? fallback);
    if (!Number.isInteger(number) || number < 0 || number > max) throw new Error(`${key} is outside the allowed range`);
  }
  if (source.RELEASE_SHA && !/^[a-f0-9]{7,40}$/i.test(source.RELEASE_SHA)) throw new Error('Invalid RELEASE_SHA');
  if (source.PRIVACY_NOTICE_VERSION && !/^[a-z0-9][a-z0-9._-]{2,99}$/i.test(source.PRIVACY_NOTICE_VERSION)) throw new Error('Invalid privacy notice version');
  return true;
};
