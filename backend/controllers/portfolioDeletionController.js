import { z } from 'zod';
import { createPortfolioDeletionService } from '../services/portfolioDeletionService.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { portfolioFailure } from './portfolioController.js';

const Body = z.object({ confirmation: z.literal('DELETE MY ACCOUNT'), challengeId: z.string().uuid() }).strict();
export const createPortfolioDeletionHandlers = ({ service = createPortfolioDeletionService() } = {}) => ({
  challenge: async (req, res) => {
    try { return successResponse(res, await service.createChallenge({ userId: req.user.id, sessionId: req.verifiedAuth?.sessionId })); }
    catch (error) { return portfolioFailure(res, error); }
  },
  deleteAccount: async (req, res) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return errorResponse(res, 'Type DELETE MY ACCOUNT and complete identity confirmation.', 400, 'ACCOUNT_DELETION_CONFIRMATION_INVALID');
    try {
      return successResponse(res, await service.deleteAccount({ userId: req.user.id,
        authEvidence: { ...req.verifiedAuth, challengeId: parsed.data.challengeId } }));
    } catch (error) { return portfolioFailure(res, error); }
  },
});
export const portfolioDeletionHandlers = createPortfolioDeletionHandlers();
