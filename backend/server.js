import 'dotenv/config';
import app from './app.js';
import env, { validateEnvironment } from './config/env.js';
import logger from './utils/logger.js';
import {
    flushObservability,
    initObservability,
} from './services/observabilityService.js';

let server;

const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);

    if (!server) {
        process.exit(0);
    }

    server.close(async () => {
        logger.info('Server closed');
        await flushObservability();
        process.exit(0);
    });
};

try {
    validateEnvironment();
    initObservability();

    server = app.listen(env.PORT, () => {
        logger.info('Server started', {
            environment: env.APP_ENV,
            port: env.PORT,
        });
    });

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
} catch (error) {
    logger.error('Server configuration is invalid', {
        code: error.code,
        missing: error.missing,
        errorType: error.name || 'Error',
    });
    process.exitCode = 1;
}

export default server;
