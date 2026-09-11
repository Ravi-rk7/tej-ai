import { successResponse, errorResponse } from "../utils/responseFormatter.js";
import {
  createProgressService,
  PROGRESS_RANGES,
} from "../services/progressService.js";

export const createProgressHandler =
  ({ service = createProgressService({ portfolio: true }) } = {}) =>
  async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Pragma", "no-cache");
    if (!req.user?.id) return errorResponse(res, "Unauthorized", 401);
    const range = req.query?.range === undefined ? "90d" : req.query.range;
    if (
      typeof range !== "string" ||
      !Object.hasOwn(PROGRESS_RANGES, range) ||
      Object.keys(req.query || {}).some((key) => key !== "range")
    ) {
      return errorResponse(
        res,
        "Choose 30d, 90d, or 1y.",
        400,
        "PROGRESS_RANGE_INVALID",
      );
    }
    try {
      return successResponse(res, await service.summary(req.user.id, range));
    } catch {
      return errorResponse(
        res,
        "Scan progress is temporarily unavailable.",
        503,
        "PROGRESS_UNAVAILABLE",
      );
    }
  };
