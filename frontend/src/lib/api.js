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

    const headers = {
        "Content-Type": "application/json",
        ...(fetchOptions.headers || {}),
    };

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

export const scanSkin = async (imageUrl) =>
    request("/api/scan", {
        method: "POST",
        body: JSON.stringify({ imageUrl }),
    });

const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            const [, base64] = result.split(",");

            if (!base64) {
                reject(new Error("Failed to read image data"));
                return;
            }

            resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.readAsDataURL(file);
    });

/**
 * Convert a File object to raw base64, then call POST /api/scan.
 * Returns the full analysis payload from the server.
 */
export const scanSkinFile = async (file) => {
    const imageBase64 = await readFileAsBase64(file);

    return request("/api/scan", {
        method: "POST",
        body: JSON.stringify({
            imageBase64,
            mimeType: file.type || "image/jpeg",
        }),
    });
};

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

export const getHistory = async () =>
    request("/api/history", {
        method: "GET",
    });

export const createSubscription = async (plan) =>
    request("/api/create-subscription", {
        method: "POST",
        body: JSON.stringify({ plan }),
    });

export const isLimitError = (error) =>
    error?.status === 403 && /scan limit reached/i.test(String(error?.message || ""));
