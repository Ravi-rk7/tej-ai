import env from '../config/env.js';
import { checkReadiness } from '../services/readinessService.js';

export const createReadinessHandler = ({
    loadReadiness = checkReadiness,
    now = () => new Date(),
    releaseSha = env.RELEASE_SHA,
} = {}) => async (_req, res) => {
    let readiness;
    try {
        readiness = await loadReadiness();
    } catch {
        readiness = {
            ready: false,
            checks: { database: 'unavailable', rateLimitStore: 'unavailable' },
        };
    }

    return res.status(readiness.ready ? 200 : 503).json({
        success: readiness.ready,
        data: {
            status: readiness.ready ? 'ready' : 'unavailable',
            checks: readiness.checks,
            releaseSha: releaseSha || null,
            timestamp: now().toISOString(),
        },
    });
};

export const readiness = createReadinessHandler();

export default readiness;
