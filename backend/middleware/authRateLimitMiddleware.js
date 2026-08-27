import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import { errorResponse } from "../utils/responseFormatter.js";
import { hashSecurityIdentifier } from "../utils/securityHash.js";

const limiterCache = new Map();

const getLimiter = ({ keyPrefix, limit, window }) => {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Upstash Redis credentials are not configured");
  }

  if (!limiterCache.has(keyPrefix)) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    limiterCache.set(
      keyPrefix,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, window),
        prefix: `tejai:${keyPrefix}`,
        analytics: false,
        timeout: 750,
      }),
    );
  }

  return limiterCache.get(keyPrefix);
};

const buildIdentifier = (req) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "missing-email";
  const ip = req.ip || req.socket?.remoteAddress || "unknown-ip";

  return hashSecurityIdentifier(`${ip}:${email}`);
};

const buildIpIdentifier = (req) => hashSecurityIdentifier(
  req.ip || req.socket?.remoteAddress || "unknown-ip",
);

export const createAuthRateLimitMiddleware =
  ({
    keyPrefix,
    limit,
    window,
    limiterFactory = getLimiter,
    identifierBuilder = buildIdentifier,
  }) =>
  async (req, res, next) => {
    try {
      const limiter = limiterFactory({ keyPrefix, limit, window });
      const { success, remaining, reset, reason } = await limiter.limit(
        identifierBuilder(req),
      );
      if (reason === "timeout") throw new Error("rate_limit_timeout");
      const resetAt = Number(reset) || Date.now();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((resetAt - Date.now()) / 1000),
      );

      res.set("X-RateLimit-Limit", String(limit));
      res.set("X-RateLimit-Remaining", String(Math.max(0, remaining ?? 0)));
      res.set("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

      if (!success) {
        res.set("Retry-After", String(retryAfterSeconds));
        return errorResponse(
          res,
          "Too many attempts. Please wait and try again.",
          429,
          "AUTH_RATE_LIMITED",
        );
      }

      return next();
    } catch (error) {
      logger.error("Authentication rate limit unavailable", {
        requestId: req.requestId,
        keyPrefix,
        errorType: error?.name || "Error",
      });

      return errorResponse(
        res,
        "Authentication is temporarily unavailable. Please try again shortly.",
        503,
        "AUTH_RATE_LIMIT_UNAVAILABLE",
      );
    }
  };

export const loginRateLimit = createAuthRateLimitMiddleware({
  keyPrefix: "auth-login",
  limit: 5,
  window: "15 m",
});

export const loginIpRateLimit = createAuthRateLimitMiddleware({
  keyPrefix: "auth-login-ip",
  limit: 20,
  window: "15 m",
  identifierBuilder: buildIpIdentifier,
});

export const passwordResetRateLimit = createAuthRateLimitMiddleware({
  keyPrefix: "auth-password-reset",
  limit: 3,
  window: "1 h",
});

export const passwordResetIpRateLimit = createAuthRateLimitMiddleware({
  keyPrefix: "auth-password-reset-ip",
  limit: 10,
  window: "1 h",
  identifierBuilder: buildIpIdentifier,
});
