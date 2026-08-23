const INTERNAL_ORIGIN = "https://tejai.invalid";
const MAX_NEXT_LENGTH = 2048;

const decodeForValidation = (value) => {
    let decoded = value;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        } catch {
            return null;
        }
    }
    return decoded;
};

export const getSafeInternalPath = (value, fallback = "/dashboard") => {
    if (typeof value !== "string" || !value || value.length > MAX_NEXT_LENGTH) return fallback;
    const decoded = decodeForValidation(value);
    if (
        !decoded
        || !decoded.startsWith("/")
        || decoded.startsWith("//")
        || decoded.includes("\\")
        || /[\u0000-\u001f\u007f]/.test(decoded)
    ) {
        return fallback;
    }

    try {
        const parsed = new URL(value, INTERNAL_ORIGIN);
        if (parsed.origin !== INTERNAL_ORIGIN) return fallback;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return fallback;
    }
};

export const getNextFromSearch = (searchParams, fallback = "/dashboard") => getSafeInternalPath(
    searchParams?.get?.("next"),
    fallback
);

export const buildAuthPath = (pathname, nextPath) => {
    const params = new URLSearchParams({ next: getSafeInternalPath(nextPath) });
    return `${pathname}?${params.toString()}`;
};

const authRedirect = { buildAuthPath, getNextFromSearch, getSafeInternalPath };

export default authRedirect;
