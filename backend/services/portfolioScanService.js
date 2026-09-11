import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';
import { PortfolioScanError } from './faceppSkinAnalysisService.js';

export const SCAN_ERRORS = Object.freeze({
  SCAN_REQUEST_INVALID: [400, 'A valid scan request key is required.'],
  SCAN_IN_PROGRESS: [409, 'A scan is already processing. Please check history before starting another.'],
  USER_MONTHLY_LIMIT: [429, 'Your three successful scans for this UTC month have been used.'],
  USER_DAILY_LIMIT: [429, 'Your successful scan for today has been used. Try after midnight UTC.'],
  SCAN_CAPACITY_REACHED: [429, 'The shared live-analysis capacity has been reached. Routine tracking and the sample demo are still available.'],
  SCAN_RESERVATION_INVALID: [409, 'This scan request expired or was already settled. It will not be retried automatically.'],
  SCAN_RESULT_REMOVED: [410, 'This saved result was deleted.'],
  SCAN_RESULT_INVALID: [502, 'The analysis result could not be saved safely.'],
});
export const createPortfolioRepository = ({ databaseClient, runtimeEnv = env } = {}) => {
  let client = databaseClient;
  const rpc = async (name, args) => {
    try {
      client ||= createClient(runtimeEnv.SUPABASE_URL, runtimeEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.rpc(name, args);
      if (error) {
        const entry = Object.entries(SCAN_ERRORS).find(([code]) => String(error.message).includes(code));
        if (entry) throw new PortfolioScanError(entry[0], entry[1][1], entry[1][0]);
        throw error;
      }
      return data;
    } catch (error) {
      if (error instanceof PortfolioScanError) throw error;
      throw new PortfolioScanError('PORTFOLIO_DATABASE_UNAVAILABLE', 'The live database is temporarily unavailable. Please try again later.');
    }
  };
  return {
    rpc,
    status: userId => rpc('portfolio_scan_status', { p_user_id: userId }),
    reserve: (userId, key) => rpc('reserve_portfolio_scan', { p_user_id: userId, p_idempotency_key: key,
      p_window_limit: runtimeEnv.FACEPP_WINDOW_CALL_LIMIT, p_daily_limit: runtimeEnv.FACEPP_DAILY_CALL_LIMIT }),
    start: (userId, id) => rpc('start_portfolio_scan', { p_user_id: userId, p_reservation_id: id }),
    fail: (userId, id) => rpc('fail_portfolio_scan', { p_user_id: userId, p_reservation_id: id }),
    persist: (userId, id, result) => rpc('persist_portfolio_scan', { p_user_id: userId, p_reservation_id: id, p_result: result }),
  };
};
export const portfolioRepository = createPortfolioRepository();
