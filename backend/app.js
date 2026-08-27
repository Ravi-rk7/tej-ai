import express from 'express';
import cors from 'cors';
import logger from './utils/logger.js';
import env from './config/env.js';
import { successResponse } from './utils/responseFormatter.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import scanRoutes from './routes/scan.js';
import resultRoutes from './routes/results.js';
import dashboardRoutes from './routes/dashboard.js';
import historyRoutes from './routes/history.js';
import paymentRoutes from './routes/payment.js';
import webhookRoutes from './routes/webhook.js';
import authRoutes from './routes/auth.js';

const app = express();
const allowedOrigins = new Set(
    env.FRONTEND_URL.split(',').map((origin) => origin.trim()).filter(Boolean)
);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }

        const error = new Error('Origin is not allowed');
        error.publicMessage = 'Origin is not allowed';
        error.publicCode = 'CORS_ORIGIN_DENIED';
        error.statusCode = 403;
        callback(error);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
};

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
    logger.http(`${req.method} ${req.path}`, { ip: req.ip });
    next();
});

app.use(cors(corsOptions));

// Dodo signs the exact request bytes. This route must run before the JSON
// parser so no middleware can reserialize the body before verification.
app.use('/api', webhookRoutes);

app.use(express.json({
    limit: '1mb',
}));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.get('/api/health', (req, res) => successResponse(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
}));

app.use('/api', scanRoutes);
app.use('/api', resultRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', historyRoutes);
app.use('/api', paymentRoutes);
app.use('/api', authRoutes);

app.use((req, res) => res.status(404).json({
    success: false,
    error: 'Not Found',
    code: 'NOT_FOUND',
}));

app.use(errorMiddleware);

export default app;
