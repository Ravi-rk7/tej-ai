import crypto from 'node:crypto';
import env from '../config/env.js';

export const hashSecurityIdentifier = (value, runtimeEnv = env) => {
    const input = String(value || 'unknown');
    if (runtimeEnv.SECURITY_HMAC_SECRET) {
        return crypto
            .createHmac('sha256', runtimeEnv.SECURITY_HMAC_SECRET)
            .update(input, 'utf8')
            .digest('hex');
    }

    // Development and unit tests may run without provisioned secrets. Public
    // environments fail startup unless the HMAC secret is present.
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
};

export default hashSecurityIdentifier;
