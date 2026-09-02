import winston from 'winston';
import env from '../config/env.js';

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|email|image|buffer|body|payload|raw|url|user.?id|scan.?id|ip|address)/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_VALUE = /https?:\/\/\S+/i;
const BEARER_VALUE = /bearer\s+[a-z0-9._~+/=-]+/i;
const IP_VALUE = /(?:\b(?:\d{1,3}\.){3}\d{1,3}\b)|(?:\b[0-9a-f]{0,4}:[0-9a-f:]+\b)/i;

const sanitizeValue = (value, key = '') => {
    if (SENSITIVE_KEY.test(key) && key !== 'requestId') return '[redacted]';
    if (value instanceof Error) return { errorType: value.name || 'Error' };
    if (typeof value === 'string') {
        if (
            EMAIL_VALUE.test(value)
            || URL_VALUE.test(value)
            || BEARER_VALUE.test(value)
            || IP_VALUE.test(value)
        ) {
            return '[redacted]';
        }
        return value.slice(0, 256);
    }
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([nestedKey, nestedValue]) => [
                nestedKey,
                sanitizeValue(nestedValue, nestedKey),
            ])
        );
    }
    return value;
};

export const sanitizeLogMetadata = (metadata = {}) => sanitizeValue(metadata);

const sanitizeFormat = winston.format((info) => {
    for (const [key, value] of Object.entries(info)) {
        if (!['level', 'message', 'timestamp'].includes(key)) {
            info[key] = sanitizeValue(value, key);
        }
    }
    info.message = sanitizeValue(String(info.message || ''));
    return info;
});

const format = winston.format.combine(
    winston.format.timestamp(),
    sanitizeFormat(),
    winston.format.json()
);

const transports = [new winston.transports.Console()];

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    levels,
    format,
    transports,
    silent: env.APP_ENV === 'test',
});

export default logger;
