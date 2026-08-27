import { createClient } from '@supabase/supabase-js';
import env from '../config/env.js';

export const FACE_SCAN_PURPOSE = 'face_scan_analysis';

export class PrivacyError extends Error {
    constructor(publicCode, publicMessage, statusCode = 503) {
        super(publicMessage);
        this.name = 'PrivacyError';
        this.publicCode = publicCode;
        this.publicMessage = publicMessage;
        this.statusCode = statusCode;
    }
}

const privacyUnavailable = () => new PrivacyError(
    'PRIVACY_STATUS_UNAVAILABLE',
    'Privacy preferences are temporarily unavailable',
    503
);

export const createPrivacyRepository = ({ databaseClient } = {}) => {
    let client = databaseClient;

    const getDatabase = () => {
        if (client) return client;
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw privacyUnavailable();
        }
        client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        return client;
    };

    const getLatest = async (userId) => {
        try {
            const { data, error } = await getDatabase()
                .from('privacy_consent_events')
                .select('action, notice_version, adult_confirmed, created_at')
                .eq('user_id', userId)
                .eq('purpose', FACE_SCAN_PURPOSE)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch {
            throw privacyUnavailable();
        }
    };

    const append = async ({ userId, action, noticeVersion, adultConfirmed }) => {
        try {
            const { data, error } = await getDatabase()
                .from('privacy_consent_events')
                .insert({
                    user_id: userId,
                    purpose: FACE_SCAN_PURPOSE,
                    action,
                    notice_version: noticeVersion,
                    adult_confirmed: adultConfirmed,
                })
                .select('action, notice_version, adult_confirmed, created_at')
                .single();
            if (error || !data) throw error || new Error('Consent event missing');
            return data;
        } catch {
            throw privacyUnavailable();
        }
    };

    return Object.freeze({ append, getLatest });
};

const serializeStatus = ({ latest, noticeVersion }) => {
    const granted = Boolean(
        latest
        && latest.action === 'granted'
        && latest.notice_version === noticeVersion
        && latest.adult_confirmed === true
    );
    return {
        schemaVersion: 1,
        noticeVersion,
        required: !granted,
        granted,
        grantedAt: granted ? latest.created_at : null,
    };
};

export const createPrivacyService = ({
    repository = createPrivacyRepository(),
    runtimeEnv = env,
} = {}) => {
    const noticeVersion = String(runtimeEnv.PRIVACY_NOTICE_VERSION || '').trim();

    const getStatus = async (userId) => serializeStatus({
        latest: await repository.getLatest(userId),
        noticeVersion,
    });

    const grant = async (userId) => {
        const current = await getStatus(userId);
        if (current.granted) return current;
        const latest = await repository.append({
            userId,
            action: 'granted',
            noticeVersion,
            adultConfirmed: true,
        });
        return serializeStatus({ latest, noticeVersion });
    };

    const withdraw = async (userId) => {
        const current = await getStatus(userId);
        if (!current.granted) return current;
        const latest = await repository.append({
            userId,
            action: 'withdrawn',
            noticeVersion,
            adultConfirmed: false,
        });
        return serializeStatus({ latest, noticeVersion });
    };

    const requireCurrentConsent = async (userId) => {
        if (!runtimeEnv.PRIVACY_CONSENT_ENFORCEMENT) return null;
        const status = await getStatus(userId);
        if (!status.granted) {
            throw new PrivacyError(
                'FACE_SCAN_CONSENT_REQUIRED',
                'Face-scan consent is required before uploading a photo',
                403
            );
        }
        return status;
    };

    return Object.freeze({ getStatus, grant, requireCurrentConsent, withdraw });
};

const defaultPrivacyService = createPrivacyService();

export const getPrivacyStatus = (userId) => defaultPrivacyService.getStatus(userId);
export const grantFaceScanConsent = (userId) => defaultPrivacyService.grant(userId);
export const withdrawFaceScanConsent = (userId) => defaultPrivacyService.withdraw(userId);
export const requireFaceScanConsent = (userId) => defaultPrivacyService.requireCurrentConsent(userId);

export default {
    FACE_SCAN_PURPOSE,
    PrivacyError,
    createPrivacyRepository,
    createPrivacyService,
    getPrivacyStatus,
    grantFaceScanConsent,
    requireFaceScanConsent,
    withdrawFaceScanConsent,
};
