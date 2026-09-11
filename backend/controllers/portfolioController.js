import { z } from 'zod';
import env from '../config/env.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { analyzeFacepp, PortfolioScanError } from '../services/faceppSkinAnalysisService.js';
import { portfolioRepository } from '../services/portfolioScanService.js';
import { getDashboardScans, getUserScanById, getUserHistoryPage } from '../services/supabaseService.js';
import { serializeScanResult } from '../services/scanResultService.js';
import { parseHistoryQuery, encodeHistoryCursor } from '../services/historyService.js';
import { releaseScanImage } from '../middleware/imageUploadMiddleware.js';
import { toPortfolioView, normalizePortfolioResult } from '../../shared/portfolio.js';

export const portfolioFailure = (res, error) => {
  if (['USER_DAILY_LIMIT', 'USER_MONTHLY_LIMIT'].includes(error.publicCode)) {
    const now = new Date();
    const reset = error.publicCode === 'USER_DAILY_LIMIT'
      ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      : Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    res.set('Retry-After', String(Math.max(1, Math.ceil((reset - now.getTime()) / 1000))));
  }
  return errorResponse(res, error.publicMessage || 'The live service is temporarily unavailable.', error.statusCode || 503,
    error.publicCode || 'PORTFOLIO_UNAVAILABLE');
};

export const liveScanEnabled = (req, res, next) => env.LIVE_SCAN_ENABLED
  ? next() : errorResponse(res, 'Live analysis is disabled. Routine tracking and the sample demo remain available.', 503, 'LIVE_SCAN_DISABLED');

export const createPortfolioScanHandler = ({ repository = portfolioRepository, analyze = analyzeFacepp,
  loadResult = getUserScanById, releaseImage = releaseScanImage } = {}) => async (req, res) => {
  let reservation;
  try {
    const key = z.string().uuid().safeParse(req.headers['idempotency-key']);
    if (!key.success) throw new PortfolioScanError('SCAN_REQUEST_INVALID', 'A valid Idempotency-Key UUID is required.', 400);
    if (!Buffer.isBuffer(req.scanImage?.buffer) || req.scanImage.buffer.length > 2 * 1024 * 1024 || !req.scanImage.buffer.length) {
      throw new PortfolioScanError('IMAGE_INVALID', 'The normalized JPEG must be between 1 byte and 2 MB.', 400);
    }
    reservation = await repository.reserve(req.user.id, key.data);
    if (reservation.replayed) {
      if (reservation.state !== 'completed') throw new PortfolioScanError('SCAN_IN_PROGRESS', 'This request is pending or was already attempted. It will not run again.', 409);
      const row = reservation.scanId && await loadResult(req.user.id, reservation.scanId);
      if (!row) throw new PortfolioScanError('SCAN_RESULT_REMOVED', 'The saved result was deleted.', 410);
      return successResponse(res, serializeScanResult(row));
    }
    if (!await repository.start(req.user.id, reservation.reservationId)) throw new PortfolioScanError('SCAN_RESERVATION_INVALID', 'The request expired before processing.', 409);
    const raw = await analyze(req.scanImage.buffer);
    const result = normalizePortfolioResult({ ...raw, scanId: 'pending', createdAt: new Date().toISOString() }, { source: 'live' });
    if (!result || result.provider.name !== 'facepp') throw new PortfolioScanError('SCAN_RESULT_INVALID', 'The provider result could not be validated.', 502);
    const row = await repository.persist(req.user.id, reservation.reservationId, result);
    return successResponse(res, serializeScanResult(row));
  } catch (error) {
    if (reservation && !reservation.replayed) {
      try { await repository.fail(req.user.id, reservation.reservationId); } catch { /* Bounded expiry releases the user slot; provider count stays intact. */ }
    }
    return portfolioFailure(res, error);
  } finally { releaseImage(req); }
};

export const createPortfolioDashboardHandler = ({ loadScans = getDashboardScans, repository = portfolioRepository } = {}) => async (req, res) => {
  try {
    const [rows, usage] = await Promise.all([loadScans(req.user.id, 12), repository.status(req.user.id)]);
    return successResponse(res, { schemaVersion: 2, latestScan: rows[0] ? toPortfolioView(serializeScanResult(rows[0])) : null,
      results: rows.map(row => toPortfolioView(serializeScanResult(row))), usage, liveScanEnabled: env.LIVE_SCAN_ENABLED });
  } catch (error) { return portfolioFailure(res, error); }
};

export const createPortfolioHistoryHandler = ({ loadHistory = getUserHistoryPage } = {}) => async (req, res) => {
  try {
    const query = parseHistoryQuery(req.query);
    const rows = await loadHistory(req.user.id, query);
    const items = rows.slice(0, query.limit).map(row => toPortfolioView(serializeScanResult(row)));
    const last = items.at(-1);
    return successResponse(res, { schemaVersion: 2, items, pageInfo: { hasMore: rows.length > query.limit,
      nextCursor: rows.length > query.limit && last ? encodeHistoryCursor(last) : null } });
  } catch (error) { return portfolioFailure(res, error); }
};

export const portfolioScan = createPortfolioScanHandler();
export const portfolioDashboard = createPortfolioDashboardHandler();
export const portfolioHistory = createPortfolioHistoryHandler();
