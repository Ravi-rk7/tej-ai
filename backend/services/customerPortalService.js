import axios from 'axios';
import { z } from 'zod';
import env from '../config/env.js';

const PORTAL_HOSTS = Object.freeze({
    test_mode: 'test.customer.dodopayments.com',
    live_mode: 'customer.dodopayments.com',
});

const PortalResponseSchema = z.object({
    link: z.string().trim().url().max(2048),
}).passthrough();

export class PortalError extends Error {
    constructor(publicCode, publicMessage, statusCode, { ambiguous = false } = {}) {
        super(publicMessage);
        this.name = 'PortalError';
        this.publicCode = publicCode;
        this.publicMessage = publicMessage;
        this.statusCode = statusCode;
        this.ambiguous = ambiguous;
    }
}

const getEnvironment = (runtimeEnv) => {
    const mode = runtimeEnv.DODO_ENVIRONMENT;
    const host = PORTAL_HOSTS[mode];
    const baseUrl = runtimeEnv.DODO_API_BASE_URL;
    if (!host || !baseUrl || !runtimeEnv.DODO_API_KEY) {
        throw new PortalError('BILLING_CONFIGURATION_ERROR', 'Billing is not configured', 503);
    }
    try {
        const parsed = new URL(baseUrl);
        if (parsed.origin !== `https://${mode === 'test_mode' ? 'test' : 'live'}.dodopayments.com`) {
            throw new Error('Invalid Dodo origin');
        }
    } catch {
        throw new PortalError('BILLING_CONFIGURATION_ERROR', 'Billing is not configured', 503);
    }
    return { host, baseUrl: baseUrl.replace(/\/$/, '') };
};

const validateCustomerId = (customerId) => {
    if (typeof customerId !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(customerId.trim())) {
        throw new PortalError('BILLING_PORTAL_NOT_AVAILABLE', 'Billing portal is not available', 409);
    }
    return customerId.trim();
};

const validatePortalLink = (link, expectedHost) => {
    try {
        const parsed = new URL(link);
        if (
            parsed.protocol !== 'https:'
            || parsed.hostname !== expectedHost
            || parsed.port
            || parsed.username
            || parsed.password
        ) throw new Error('Invalid portal host');
        return parsed.toString();
    } catch {
        throw new PortalError(
            'BILLING_INVALID_PROVIDER_RESPONSE',
            'Billing provider returned an invalid portal link',
            502,
            { ambiguous: true }
        );
    }
};

export const createCustomerPortalService = ({
    httpClient = axios,
    runtimeEnv = env,
} = {}) => {
    const createSession = async (customerId) => {
        const safeCustomerId = validateCustomerId(customerId);
        const { host, baseUrl } = getEnvironment(runtimeEnv);
        const frontendOrigin = String(runtimeEnv.FRONTEND_URL || '').split(',')[0].trim();
        let returnUrl;
        try {
            const parsed = new URL(frontendOrigin);
            if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
                throw new Error('Invalid frontend origin');
            }
            returnUrl = `${parsed.origin}/settings`;
        } catch {
            throw new PortalError('BILLING_CONFIGURATION_ERROR', 'Billing is not configured', 503);
        }

        try {
            const response = await httpClient.post(
                `${baseUrl}/customers/${encodeURIComponent(safeCustomerId)}/customer-portal/session`,
                null,
                {
                    headers: {
                        Authorization: `Bearer ${runtimeEnv.DODO_API_KEY}`,
                        Accept: 'application/json',
                    },
                    params: { send_email: false, return_url: returnUrl },
                    timeout: 10_000,
                    maxRedirects: 0,
                }
            );
            const parsed = PortalResponseSchema.safeParse(response?.data);
            if (!parsed.success) {
                throw new PortalError(
                    'BILLING_INVALID_PROVIDER_RESPONSE',
                    'Billing provider returned an invalid portal link',
                    502,
                    { ambiguous: true }
                );
            }
            return { portalUrl: validatePortalLink(parsed.data.link, host) };
        } catch (error) {
            if (error instanceof PortalError) throw error;
            if (axios.isAxiosError(error)) {
                if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) {
                    throw new PortalError('BILLING_PROVIDER_TIMEOUT', 'Billing provider timed out', 504, { ambiguous: true });
                }
                if (error.response?.status >= 500) {
                    throw new PortalError('BILLING_PROVIDER_UNAVAILABLE', 'Billing provider is unavailable', 503, { ambiguous: true });
                }
                throw new PortalError('BILLING_PROVIDER_REJECTED', 'Billing provider rejected the request', 502);
            }
            throw new PortalError('BILLING_PROVIDER_UNAVAILABLE', 'Billing provider is unavailable', 503, { ambiguous: true });
        }
    };

    return Object.freeze({ createSession });
};

const defaultPortalService = createCustomerPortalService();
export const createCustomerPortalSession = (customerId) => defaultPortalService.createSession(customerId);

export default { PortalError, createCustomerPortalService, createCustomerPortalSession };
