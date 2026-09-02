import * as Sentry from '@sentry/node';
import env from '../config/env.js';

const SAFE_TAGS = new Set([
    'environment',
    'release',
    'errorCode',
    'route',
    'requestId',
    'method',
    'provider',
    'outcome',
]);
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanTag = (value) => String(value || '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ':id')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
    .replace(/https?:\/\/\S+/gi, '[redacted]')
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, '[redacted]')
    .slice(0, 160);

const cleanFilename = (value) => {
    const normalized = String(value || '').split('?')[0].replace(/\\/g, '/');
    return cleanTag(normalized.split('/').filter(Boolean).at(-1) || 'unknown');
};

const sanitizeStacktrace = (stacktrace) => {
    if (!stacktrace?.frames) return stacktrace;
    return {
        ...stacktrace,
        frames: stacktrace.frames.map((frame) => ({
            function: cleanTag(frame.function || 'anonymous'),
            filename: cleanFilename(frame.filename),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
        })),
    };
};

export const sanitizeObservabilityEvent = (event = {}) => {
    delete event.user;
    delete event.request;
    delete event.breadcrumbs;
    delete event.extra;
    delete event.contexts;
    delete event.transaction;
    delete event.message;

    event.tags = Object.fromEntries(
        Object.entries(event.tags || {})
            .filter(([key]) => SAFE_TAGS.has(key))
            .map(([key, value]) => [
                key,
                key === 'requestId' && REQUEST_ID.test(String(value))
                    ? String(value)
                    : cleanTag(value),
            ])
    );

    if (event.exception?.values) {
        event.exception.values = event.exception.values.map((exception) => ({
            type: cleanTag(exception.type || 'Error'),
            value: 'Operational error',
            mechanism: exception.mechanism
                ? { type: cleanTag(exception.mechanism.type || 'generic'), handled: true }
                : undefined,
            stacktrace: sanitizeStacktrace(exception.stacktrace),
        }));
    }

    return event;
};

let initialized = false;

export const initObservability = ({ runtimeEnv = env } = {}) => {
    if (initialized) return true;
    if (!runtimeEnv.SENTRY_DSN) return false;

    Sentry.init({
        dsn: runtimeEnv.SENTRY_DSN,
        enabled: ['staging', 'production'].includes(runtimeEnv.APP_ENV),
        environment: runtimeEnv.APP_ENV,
        release: runtimeEnv.RELEASE_SHA || undefined,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        defaultIntegrations: false,
        beforeSend: sanitizeObservabilityEvent,
    });
    initialized = true;
    return true;
};

export const captureOperationalError = (error, tags = {}) => {
    if (!initialized) return null;
    return Sentry.captureException(error instanceof Error ? error : new Error('Operational error'), {
        tags: Object.fromEntries(
            Object.entries(tags).filter(([key]) => SAFE_TAGS.has(key))
        ),
    });
};

export const flushObservability = (timeoutMs = 2000) =>
    initialized ? Sentry.flush(timeoutMs) : Promise.resolve(true);

export default {
    initObservability,
    captureOperationalError,
    flushObservability,
    sanitizeObservabilityEvent,
};
