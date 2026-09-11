import axios from 'axios';
import FormData from 'form-data';
import env from '../config/env.js';
import { FACEPP_ENDPOINT } from '../config/portfolioConfig.js';
import { generateRulesRoutine } from '../../shared/portfolio.js';

const CATEGORIES = Object.freeze({
  eye_pouch: 'Under-eye puffiness', dark_circle: 'Dark circles', forehead_wrinkle: 'Forehead lines',
  crows_feet: 'Outer-eye lines', eye_finelines: 'Fine eye lines', glabella_wrinkle: 'Between-brow lines',
  nasolabial_fold: 'Nasolabial folds', pores_forehead: 'Visible forehead pores',
  pores_left_cheek: 'Visible left-cheek pores', pores_right_cheek: 'Visible right-cheek pores',
  pores_jaw: 'Visible jaw pores', blackhead: 'Blackheads', acne: 'Blemishes (provider category)',
});
const SKIN_TYPES = ['Oily', 'Dry', 'Normal', 'Combination'];
export class PortfolioScanError extends Error {
  constructor(code, message, statusCode = 503) {
    super(message); this.publicCode = code; this.publicMessage = message; this.statusCode = statusCode;
  }
}
const invalidResult = () => new PortfolioScanError('PROVIDER_RESULT_UNSUPPORTED', 'The provider did not return usable skin observations.', 502);

export const normalizeFaceppResponse = body => {
  if (!body || typeof body !== 'object' || body.error_message) throw invalidResult();
  // Documentation calls result an array but shows a single object in its example.
  // Accept exactly one result; never choose one person from a group photograph.
  const result = Array.isArray(body.result) ? (body.result.length === 1 ? body.result[0] : null) : body.result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw invalidResult();
  const rawType = typeof result.skin_type === 'object' ? result.skin_type?.skin_type : result.skin_type;
  const skinType = Number.isInteger(rawType) && rawType >= 0 && rawType <= 3 ? SKIN_TYPES[rawType] : null;
  const observations = Object.entries(CATEGORIES).flatMap(([key, label]) => {
    const item = result[key];
    if (!item || ![0, 1, '0', '1'].includes(item.value)
      || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) return [];
    return [{ key, label, kind: 'observation', value: Number(item.value) === 1 ? 'Reported present' : 'Not reported' }];
  });
  if (!skinType && !observations.length) throw invalidResult();
  return { schemaVersion: 2, source: 'live', provider: { name: 'facepp', version: '1.0', mappingVersion: 'categories-v1' },
    skinType, overallScore: null, observations, metrics: [], routine: generateRulesRoutine(),
    warnings: ['Provider observations are cosmetic categories, not diagnoses, severity scores or clinical measurements.'] };
};

export const createFaceppAnalyzer = ({ httpClient = axios, runtimeEnv = env } = {}) => async buffer => {
  if (!runtimeEnv.LIVE_SCAN_ENABLED || !runtimeEnv.FACEPP_API_KEY || !runtimeEnv.FACEPP_API_SECRET) {
    throw new PortfolioScanError('LIVE_SCAN_DISABLED', 'Live analysis is not enabled. You can still track your routine or explore the sample demo.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
    throw new PortfolioScanError('IMAGE_INVALID', 'Use a JPEG no larger than 2 MB.', 400);
  }
  const form = new FormData();
  form.append('api_key', runtimeEnv.FACEPP_API_KEY);
  form.append('api_secret', runtimeEnv.FACEPP_API_SECRET);
  form.append('image_file', buffer, { filename: 'scan.jpg', contentType: 'image/jpeg' });
  try {
    // One POST, no redirects or automatic retries. Quota is reserved by the caller.
    const response = await httpClient.post(FACEPP_ENDPOINT, form, {
      headers: { ...form.getHeaders(), Accept: 'application/json' },
      timeout: 12000, maxRedirects: 0, maxBodyLength: 2 * 1024 * 1024 + 8192,
      maxContentLength: 128 * 1024, validateStatus: () => true,
    });
    const providerCode = String(response.data?.error_message || '').split(':')[0];
    if (['NO_FACE_FOUND', 'INVALID_IMAGE_FACE', 'INVALID_IMAGE_SIZE', 'IMAGE_ERROR_UNSUPPORTED_FORMAT', 'IMAGE_FILE_TOO_LARGE'].includes(providerCode)) {
      throw new PortfolioScanError('IMAGE_FACE_INVALID', 'Use one clear, front-facing portrait within the image limits.', 422);
    }
    if (response.status !== 200 || providerCode) throw new PortfolioScanError('PROVIDER_UNAVAILABLE', 'Live analysis is temporarily unavailable. Your successful-scan allowance was not used.', 502);
    return normalizeFaceppResponse(response.data);
  } catch (error) {
    if (error instanceof PortfolioScanError) throw error;
    // Never log/return Axios errors: request config contains API secrets and image bytes.
    throw new PortfolioScanError('PROVIDER_UNAVAILABLE', 'Live analysis could not be confirmed. The request will not be retried automatically.', 502);
  }
};
export const analyzeFacepp = createFaceppAnalyzer();
