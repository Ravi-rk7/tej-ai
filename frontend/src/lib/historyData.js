export const normalizeHistoryPage = (data) => {
    if (!data || typeof data !== "object" || !Array.isArray(data.items)) return null;
    const items = data.items
        .filter((item) => item && typeof item.scanId === "string")
        .map((item) => ({
            scanId: item.scanId,
            createdAt: item.createdAt || null,
            glowScore: Number.isInteger(item.glowScore) ? item.glowScore : null,
            skinType: typeof item.skinType === "string" ? item.skinType : null,
            concerns: Array.isArray(item.concerns) ? item.concerns.filter((concern) => typeof concern === "string") : [],
        }));
    const pageInfo = data.pageInfo && typeof data.pageInfo === "object" ? data.pageInfo : {};
    return {
        items,
        pageInfo: {
            hasMore: pageInfo.hasMore === true,
            nextCursor: typeof pageInfo.nextCursor === "string" ? pageInfo.nextCursor : null,
        },
    };
};

export const appendHistoryItems = (currentItems, nextItems) => {
    const seen = new Set(currentItems.map((item) => item.scanId));
    return [...currentItems, ...nextItems.filter((item) => !seen.has(item.scanId))];
};

const historyData = { appendHistoryItems, normalizeHistoryPage };

export default historyData;
