import express from 'express';
import cors from 'cors';
import env from './config/env.js';
import { successResponse } from './utils/responseFormatter.js';
import errorMiddleware from './middleware/errorMiddleware.js';
import scanRoutes from './routes/scan.js';
import resultRoutes from './routes/results.js';
import dashboardRoutes from './routes/dashboard.js';
import historyRoutes from './routes/history.js';
import privacyRoutes from './routes/privacy.js';
import routineRoutes from './routes/routine.js';
import progressRoutes from './routes/progress.js';
import requestContextMiddleware from './middleware/requestContextMiddleware.js';
import securityHeadersMiddleware, {
    apiSecurityPolicyMiddleware,
} from './middleware/securityHeadersMiddleware.js';
import requestShapeMiddleware from './middleware/requestShapeMiddleware.js';
import readiness from './controllers/readinessController.js';

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
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: [
        'X-Request-ID',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
    ],
    optionsSuccessStatus: 204,
    maxAge: 600,
};

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(requestContextMiddleware);
app.use(securityHeadersMiddleware);
app.use('/api', apiSecurityPolicyMiddleware);
app.use(['/api/routine', '/api/progress', '/api/account', '/api/history'], (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Pragma', 'no-cache');
    next();
});
app.use(cors(corsOptions));
app.use(requestShapeMiddleware);

// Commercial endpoints are retired. No payment code or webhook parser is mounted.
app.use(['/api/billing', '/api/payment', '/api/webhook', '/api/webhooks', '/api/create-subscription'], (_req, res) => res.status(410).json({
    success: false, code: 'BILLING_RETIRED', error: 'Billing is not available in this portfolio project.',
}));

app.use(express.json({
    limit: '1mb',
}));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.get('/api/health', (req, res) => successResponse(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    releaseSha: env.RELEASE_SHA || null,
}));
app.get('/api/ready', readiness);
app.get('/api/capabilities', (_req, res) => successResponse(res, {
    profile: 'portfolio', liveScanEnabled: env.LIVE_SCAN_ENABLED,
    provider: 'facepp', routineMode: 'rules', monthlyUserLimit: 3, dailyUserLimit: 1,
}));

app.use('/api', scanRoutes);
app.use('/api', resultRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', historyRoutes);
app.use('/api', privacyRoutes);
app.use('/api', routineRoutes);
app.use('/api', progressRoutes);
app.use('/api/auth', (_req, res) => res.status(410).json({
    success: false, code: 'AUTH_FLOW_RETIRED', error: 'Use Google or GitHub sign-in through Supabase.',
}));

app.use((req, res) => res.status(404).json({
    success: false,
    error: 'Not Found',
    code: 'NOT_FOUND',
}));

app.use(errorMiddleware);

export default app;
