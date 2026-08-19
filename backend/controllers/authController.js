import { z } from "zod";
import env from "../config/env.js";
import logger from "../utils/logger.js";
import {
  sendPasswordResetEmail,
  signInWithPassword,
} from "../services/authService.js";
import { errorResponse, successResponse } from "../utils/responseFormatter.js";

const EmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(254, "Email address is too long")
  .transform((value) => value.toLowerCase());

const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1, "Password is required").max(128),
  })
  .strict();

const PasswordResetSchema = z
  .object({
    email: EmailSchema,
  })
  .strict();

const getFrontendUrl = () => env.FRONTEND_URL.split(",")[0].trim();

export const login = async (req, res, next) => {
  try {
    const credentials = LoginSchema.parse(req.body);
    const { data, error } = await signInWithPassword({
      ...credentials,
      clientIp: req.ip,
    });

    if (error || !data.session || !data.user) {
      return errorResponse(
        res,
        "Email or password is incorrect.",
        401,
        "AUTH_INVALID_CREDENTIALS",
      );
    }

    res.set("Cache-Control", "no-store");
    return successResponse(res, {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const requestPasswordReset = async (req, res, next) => {
  try {
    const { email } = PasswordResetSchema.parse(req.body);
    const redirectTo = new URL("/reset-password", getFrontendUrl()).toString();
    const { error } = await sendPasswordResetEmail({
      email,
      redirectTo,
      clientIp: req.ip,
    });

    if (error) {
      logger.warn("Password reset provider rejected a request", {
        status: error.status,
      });
    }

    res.set("Cache-Control", "no-store");
    return successResponse(res, {
      message:
        "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(error);
    }

    logger.error("Password reset request failed", { message: error.message });
    res.set("Cache-Control", "no-store");
    return successResponse(res, {
      message:
        "If an account exists for that email, a reset link has been sent.",
    });
  }
};
