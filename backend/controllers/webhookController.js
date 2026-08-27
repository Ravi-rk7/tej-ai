import logger from '../utils/logger.js';
import { errorResponse, successResponse } from '../utils/responseFormatter.js';
import { WebhookError, processDodoWebhook } from '../services/webhookService.js';

export const createDodoWebhookHandler = ({ processWebhook = processDodoWebhook, webhookLogger = logger } = {}) => async (req, res) => {
    try {
        await processWebhook(req.body, {
            'webhook-id': req.headers['webhook-id'],
            'webhook-signature': req.headers['webhook-signature'],
            'webhook-timestamp': req.headers['webhook-timestamp'],
        });
        return successResponse(res, { received: true });
    } catch (error) {
        if (error instanceof WebhookError) {
            const log = error.statusCode >= 500 ? webhookLogger.error : webhookLogger.warn;
            log.call(webhookLogger, 'Dodo webhook request rejected', {
                code: error.publicCode,
                statusCode: error.statusCode,
                retry: error.retry === true,
            });
            return errorResponse(res, error.publicMessage, error.statusCode, error.publicCode);
        }

        webhookLogger.error('Dodo webhook handler failed', {
            code: 'WEBHOOK_STORAGE_UNAVAILABLE',
        });
        return errorResponse(res, 'Webhook processing is temporarily unavailable', 503, 'WEBHOOK_STORAGE_UNAVAILABLE');
    }
};

export const handleDodoWebhook = createDodoWebhookHandler();

export default { createDodoWebhookHandler, handleDodoWebhook };
