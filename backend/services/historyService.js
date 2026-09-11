import { z } from 'zod';

const CursorSchema = z.object({
    createdAt: z.string().datetime({ offset: true }),
    scanId: z.string().uuid(),
}).strict();

const LimitSchema = z.coerce.number().int().min(1).max(25).default(12);

export const encodeHistoryCursor = ({ createdAt, scanId }) => Buffer
    .from(JSON.stringify({ createdAt, scanId }))
    .toString('base64url');

export const decodeHistoryCursor = (cursor) => {
    if (!cursor) return null;
    try {
        const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
        return CursorSchema.parse(JSON.parse(decoded));
    } catch {
        const error = new Error('Invalid history cursor');
        error.publicMessage = 'Invalid history cursor';
        error.publicCode = 'HISTORY_CURSOR_INVALID';
        error.statusCode = 400;
        throw error;
    }
};

export const parseHistoryQuery = (query = {}) => {
    const parsedLimit = LimitSchema.safeParse(query.limit ?? 12);
    if (!parsedLimit.success) {
        const error = new Error('Invalid history limit');
        error.publicMessage = 'History limit must be between 1 and 25';
        error.publicCode = 'HISTORY_LIMIT_INVALID';
        error.statusCode = 400;
        throw error;
    }
    return {
        limit: parsedLimit.data,
        cursor: decodeHistoryCursor(query.cursor),
    };
};
