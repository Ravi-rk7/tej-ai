export const normalizePrivacyStatus = (data) => {
    if (!data || typeof data !== "object") return null;
    if (typeof data.noticeVersion !== "string" || !data.noticeVersion.trim()) return null;
    if (typeof data.required !== "boolean" || typeof data.granted !== "boolean") return null;
    if (data.required === data.granted) return null;
    return {
        schemaVersion: data.schemaVersion === 1 ? 1 : 1,
        noticeVersion: data.noticeVersion.trim(),
        required: data.required,
        granted: data.granted,
        grantedAt: typeof data.grantedAt === "string" ? data.grantedAt : null,
    };
};

export const isConsentError = (error) => (
    error?.status === 403 && error?.body?.code === "FACE_SCAN_CONSENT_REQUIRED"
);

const privacyData = { isConsentError, normalizePrivacyStatus };

export default privacyData;
