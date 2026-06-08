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

const parseCookieValue = (cookieName) => {
    if (typeof document === "undefined") {
        return null;
    }

    const token = document.cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${cookieName}=`));

    if (!token) {
        return null;
    }

    return decodeURIComponent(token.split("=").slice(1).join("="));
};

const extractSupabaseAccessToken = (rawValue) => {
    if (!rawValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue);

        if (Array.isArray(parsed)) {
            return (
                parsed?.[0]?.access_token ||
                parsed?.[0]?.currentSession?.access_token ||
                null
            );
        }

        return (
            parsed?.access_token ||
            parsed?.currentSession?.access_token ||
            parsed?.session?.access_token ||
            null
        );
    } catch {
        return null;
    }
};

export const getJwtToken = () => {
    if (typeof window === "undefined") {
        return null;
    }

    const directToken =
        window.localStorage.getItem("tejai_jwt") ||
        window.localStorage.getItem("supabase_jwt") ||
        window.localStorage.getItem("access_token");

    if (directToken) {
        return directToken;
    }

    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key) {
            continue;
        }

        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
            const token = extractSupabaseAccessToken(window.localStorage.getItem(key));
            if (token) {
                return token;
            }
        }
    }

    return (
        parseCookieValue("access_token") ||
        parseCookieValue("sb-access-token") ||
        null
    );
};

const request = async (path, options = {}) => {
    const token = getJwtToken();

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
    });

    const body = await response
        .json()
        .catch(() => ({ success: false, error: "Invalid server response" }));

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
