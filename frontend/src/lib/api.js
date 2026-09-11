import { supabase } from "@/lib/supabaseClient";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

export const isUnauthorizedError = (error) => error?.status === 401;

export const getJwtToken = async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
        return null;
    }

    const expiresAtMs = (data.session.expires_at || 0) * 1000;
    if (expiresAtMs > Date.now() + 60_000) {
        return data.session.access_token;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
        await supabase.auth.signOut({ scope: "local" });
        return null;
    }

    return refreshed.session.access_token;
};

const request = async (path, options = {}) => {
    const { authenticated = true, ...fetchOptions } = options;
    const token = authenticated ? await getJwtToken() : null;
    if (authenticated && !token) {
        throw new ApiError('Sign in to use the live application.', 401, { success: false, code: 'AUTH_REQUIRED' });
    }

    const isMultipart = typeof FormData !== "undefined"
        && fetchOptions.body instanceof FormData;
    const headers = { ...(fetchOptions.headers || {}) };

    if (!isMultipart && fetchOptions.body !== undefined && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...fetchOptions,
        signal: AbortSignal.any([fetchOptions.signal || new AbortController().signal, AbortSignal.timeout(path === '/api/scan' ? 30000 : 15000)]),
        headers,
    });

    const body = await response
        .json()
        .catch(() => ({ success: false, error: "Invalid server response" }));

    if (response.status === 401 && authenticated) {
        await supabase.auth.signOut({ scope: "local" });
        throw new ApiError(
            "Your session expired. Please sign in again.",
            401,
            body
        );
    }

    if (!response.ok || body?.success === false) {
        throw new ApiError(
            body?.error || `Request failed with status ${response.status}`,
            response.status,
            body
        );
    }

    return body?.data;
};

/**
 * Send one JPG as multipart data. The browser supplies the multipart boundary;
 * setting Content-Type manually would make the request invalid.
 */
export const scanSkinFile = async (file, { idempotencyKey = crypto.randomUUID(), signal } = {}) => {
    const form = new FormData();
    form.append("image", file, "scan.jpg");

    return request("/api/scan", {
        method: "POST",
        body: form,
        headers: { 'Idempotency-Key': idempotencyKey },
        signal,
    });
};

export const getScanResult = async (scanId, options = {}) =>
    request(`/api/results/${encodeURIComponent(scanId)}`, {
        ...options,
        method: "GET",
        cache: "no-store",
    });

export const getDashboard = async (options = {}) =>
    request("/api/dashboard", {
        ...options,
        method: "GET",
        cache: "no-store",
    });

export const getRoutineSummary = ({ weeks = 53, signal } = {}) =>
    request(`/api/routine/summary?weeks=${encodeURIComponent(weeks)}`, { method: 'GET', cache: 'no-store', signal });
export const saveRoutineTimezone = (timezone, { signal } = {}) =>
    request('/api/routine/preferences', { method: 'PUT', body: JSON.stringify({ timezone }), cache: 'no-store', signal });
export const completeRoutinePeriod = (period, { signal } = {}) =>
    request(`/api/routine/check-ins/today/${encodeURIComponent(period)}`, { method: 'PUT', cache: 'no-store', signal });
export const undoRoutinePeriod = (period, { signal } = {}) =>
    request(`/api/routine/check-ins/today/${encodeURIComponent(period)}`, { method: 'DELETE', cache: 'no-store', signal });
export const getScanProgress = ({ range = '90d', signal } = {}) =>
    request(`/api/progress/scans?range=${encodeURIComponent(range)}`, { method: 'GET', cache: 'no-store', signal });

export const getHistory = async ({ limit = 12, cursor, signal } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request(`/api/history?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal,
    });
};

export const getPrivacyStatus = ({ signal } = {}) =>
    request("/api/privacy/status", {
        method: "GET",
        cache: "no-store",
        signal,
    });

export const grantPrivacyConsent = ({ noticeVersion, signal } = {}) =>
    request("/api/privacy/consent", {
        method: "POST",
        body: JSON.stringify({
            noticeVersion,
            faceScanProcessing: true,
            adultConfirmation: true,
        }),
        signal,
    });

export const withdrawPrivacyConsent = ({ signal } = {}) =>
    request("/api/privacy/consent/withdraw", {
        method: "POST",
        body: JSON.stringify({}),
        signal,
    });

export const deleteScan = (scanId, { signal } = {}) =>
    request(`/api/scans/${encodeURIComponent(scanId)}`, {
        method: "DELETE",
        signal,
    });

export const deleteAccount = ({ confirmation, challengeId, signal } = {}) =>
    request("/api/account", {
        method: "DELETE",
        body: JSON.stringify({
            confirmation,
            challengeId,
        }),
        signal,
    });

export const getCapabilities = ({ signal } = {}) => request('/api/capabilities', { authenticated: false, cache: 'no-store', signal });
export const createDeletionChallenge = () => request('/api/account/deletion-challenge', { method: 'POST', body: '{}' });
