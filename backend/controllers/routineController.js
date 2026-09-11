import { successResponse, errorResponse } from "../utils/responseFormatter.js";
import {
  createRoutineService,
  PERIODS,
  RoutineError,
  validateTimezone,
} from "../services/routineService.js";

export const createRoutineHandlers = ({
  service = createRoutineService(),
} = {}) => {
  const handle = (action) => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("Pragma", "no-cache");
    try {
      if (!req.user?.id) return errorResponse(res, "Unauthorized", 401);
      return successResponse(res, await action(req));
    } catch (error) {
      const safe = error instanceof RoutineError ? error : new RoutineError();
      return errorResponse(res, safe.message, safe.statusCode, safe.publicCode);
    }
  };
  const checkin = (action) =>
    handle((req) => {
      if (!PERIODS.includes(req.params.period))
        throw new RoutineError("ROUTINE_PERIOD_INVALID");
      if (
        req.body !== undefined ||
        Number(req.headers?.["content-length"] || 0) > 0 ||
        req.headers?.["transfer-encoding"] ||
        Object.keys(req.query || {}).length
      ) {
        throw new RoutineError("ROUTINE_REQUEST_INVALID");
      }
      return service[action](req.user.id, req.params.period);
    });
  return {
    summary: handle((req) => {
      const weeks = req.query?.weeks === undefined ? "53" : req.query.weeks;
      if (
        !["13", "26", "53"].includes(weeks) ||
        Object.keys(req.query || {}).some((key) => key !== "weeks")
      ) {
        throw new RoutineError("ROUTINE_RANGE_INVALID");
      }
      return service.summary(req.user.id, Number(weeks));
    }),
    preferences: handle((req) => {
      if (
        !req.body ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length !== 1 ||
        !validateTimezone(req.body.timezone) ||
        Object.keys(req.query || {}).length
      ) {
        throw new RoutineError("ROUTINE_PREFERENCES_INVALID");
      }
      return service.preferences(req.user.id, req.body.timezone);
    }),
    complete: checkin("complete"),
    undo: checkin("undo"),
  };
};
