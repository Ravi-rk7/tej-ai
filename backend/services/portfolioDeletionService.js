import { z } from 'zod';
import { createDeletionRepository, createDeletionService, DeletionError } from './deletionService.js';
import { portfolioRepository } from './portfolioScanService.js';

const UUID = z.string().uuid();
const rejection = () => new DeletionError('ACCOUNT_REAUTHENTICATION_FAILED', 'Sign in with your provider again to confirm account deletion.', 403);

export const createPortfolioDeletionService = ({ rpc = portfolioRepository.rpc,
  deletionRepository = createDeletionRepository(), removeAuthUser, runtimeEnv } = {}) => {
  const reauthenticate = async ({ userId, authEvidence }) => {
    if (!UUID.safeParse(authEvidence?.challengeId).success || !UUID.safeParse(authEvidence?.sessionId).success) throw rejection();
    const timestamps = (Array.isArray(authEvidence.amr) ? authEvidence.amr : [])
      .filter(item => item.method === 'oauth' && Number.isInteger(item.timestamp) && item.timestamp > 0)
      .map(item => item.timestamp);
    if (!timestamps.length) throw rejection();
    const valid = await rpc('consume_portfolio_deletion_challenge', {
      p_user_id: userId, p_challenge_id: authEvidence.challengeId, p_session_id: authEvidence.sessionId,
      p_oauth_at: Math.max(...timestamps),
    });
    if (valid !== true) throw rejection();
    return { data: { user: { id: userId } }, error: null };
  };
  const service = createDeletionService({
    repository: deletionRepository, reauthenticate, ...(removeAuthUser ? { removeAuthUser } : {}), ...(runtimeEnv ? { runtimeEnv } : {}),
  });
  return { ...service, createChallenge: async ({ userId, sessionId }) => {
    if (!UUID.safeParse(sessionId).success) throw rejection();
    return rpc('create_portfolio_deletion_challenge', { p_user_id: userId, p_session_id: sessionId });
  } };
};
