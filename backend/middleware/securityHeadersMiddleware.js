import helmet from 'helmet';
import env from '../config/env.js';

const isPublicEnvironment = ['staging', 'production'].includes(env.APP_ENV);

export const securityHeadersMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: isPublicEnvironment ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isPublicEnvironment
        ? {
            maxAge: env.APP_ENV === 'production' ? 31_536_000 : 300,
            includeSubDomains: false,
            preload: false,
        }
        : false,
    referrerPolicy: { policy: 'no-referrer' },
});

export const apiSecurityPolicyMiddleware = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
};

export default securityHeadersMiddleware;
