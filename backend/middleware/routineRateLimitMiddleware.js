import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import env from "../config/env.js";
import { hashSecurityIdentifier } from "../utils/securityHash.js";
import { errorResponse } from "../utils/responseFormatter.js";

export const createRoutineRateLimiter = ({
  limiter,
  prefix = "mutation",
  limit = 30,
  window = "1 m",
  now = Date.now,
  runtimeEnv = env,
} = {}) => {
  let active = limiter;
  return async (req, res, next) => {
    if (!req.user?.id) return errorResponse(res, "Unauthorized", 401);
    try {
      if (!active) {
        if (
          !runtimeEnv.UPSTASH_REDIS_REST_URL ||
          !runtimeEnv.UPSTASH_REDIS_REST_TOKEN
        )
          throw new Error("unavailable");
        active = new Ratelimit({
          redis: new Redis({
            url: runtimeEnv.UPSTASH_REDIS_REST_URL,
            token: runtimeEnv.UPSTASH_REDIS_REST_TOKEN,
          }),
          limiter: Ratelimit.slidingWindow(limit, window),
          prefix: `tejai:routine:${prefix}`,
          analytics: false,
          timeout: 750,
        });
      }
      const result = await active.limit(
        hashSecurityIdentifier(`routine:${prefix}:${req.user.id}`),
      );
      if (result.reason === "timeout" || typeof result.success !== "boolean")
        throw new Error("unavailable");
      if (!result.success) {
        res.set(
          "Retry-After",
          String(
            Math.max(1, Math.ceil(((result.reset || now()) - now()) / 1000)),
          ),
        );
        return errorResponse(
          res,
          "Too many routine requests. Please try again later.",
          429,
          "ROUTINE_RATE_LIMITED",
        );
      }
      return next();
    } catch {
      return errorResponse(
        res,
        "Routine tracking is temporarily unavailable.",
        503,
        "ROUTINE_RATE_LIMIT_UNAVAILABLE",
      );
    }
  };
};

export const routineMutationLimiter = createRoutineRateLimiter();
export const routinePreferenceLimiter = createRoutineRateLimiter({
  prefix: "preferences",
  limit: 5,
  window: "1 h",
});
export const routineReadLimiter = createRoutineRateLimiter({
  prefix: "read",
  limit: 120,
});
