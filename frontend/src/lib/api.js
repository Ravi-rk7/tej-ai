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
export const scanSkinFile = async (file) => {
    const form = new FormData();
    form.append("image", file, "scan.jpg");

    return request("/api/scan", {
        method: "POST",
        body: form,
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

export const loginWithPassword = async ({ email, password }) => {
    const data = await request("/api/auth/login", {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({ email, password }),
    });

    const { error } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
    });

    if (error) {
        throw new ApiError("We could not start your session. Please try again.", 401);
    }

    return data.user;
};

export const requestPasswordReset = async (email) => request(
    "/api/auth/password-reset",
    {
        method: "POST",
        authenticated: false,
        body: JSON.stringify({ email }),
    }
);

export const getHistory = async ({ limit = 12, cursor, signal } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request(`/api/history?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal,
    });
};

export const createCheckoutSession = async (plan, { idempotencyKey, signal } = {}) =>
    request("/api/billing/checkout", {
        method: "POST",
        headers: {
            "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ plan }),
        signal,
    });

export const getSubscription = async ({ signal } = {}) =>
    request("/api/billing/subscription", {
        method: "GET",
        cache: "no-store",
        signal,
    });

export const createCustomerPortalSession = async ({ signal } = {}) =>
    request("/api/billing/portal", {
        method: "POST",
        signal,
    });

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

export const deleteAccount = ({ confirmation, currentPassword, signal } = {}) =>
    request("/api/account", {
        method: "DELETE",
        body: JSON.stringify({
            confirmation,
            currentPassword,
        }),
        signal,
    });

export const isLimitError = (error) =>
    error?.status === 403 && error?.body?.code === "SCAN_LIMIT_REACHED";
