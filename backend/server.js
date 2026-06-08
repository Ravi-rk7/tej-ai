import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import logger from './utils/logger.js';
import env from './config/env.js';
import { successResponse } from './utils/responseFormatter.js';
import errorMiddleware from './middleware/errorMiddleware.js';

// Import routes
import scanRoutes from './routes/scan.js';
import historyRoutes from './routes/history.js';
import paymentRoutes from './routes/payment.js';

const app = express();

// ─────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────

// Request logging
app.use((req, res, next) => {
    logger.http(`${req.method} ${req.path}`, { ip: req.ip });
    next();
});

// CORS
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsers
app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// ─────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
    return successResponse(res, { status: 'healthy', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', scanRoutes);
app.use('/api', historyRoutes);
app.use('/api', paymentRoutes);

// ─────────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        error: 'Not Found',
    });
});

// Global error handler (must be last)
app.use(errorMiddleware);

// ─────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────

const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Server running on port ${env.PORT}`);
    logger.info(`📡 Frontend URL: ${env.FRONTEND_URL}`);
    logger.info(`🔐 Environment: ${env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully...');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

export default app;
