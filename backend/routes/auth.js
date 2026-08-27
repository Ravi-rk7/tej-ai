import express from "express";
import { login, requestPasswordReset } from "../controllers/authController.js";
import {
  loginRateLimit,
  loginIpRateLimit,
  passwordResetRateLimit,
  passwordResetIpRateLimit,
} from "../middleware/authRateLimitMiddleware.js";

const router = express.Router();

router.post("/auth/login", loginIpRateLimit, loginRateLimit, login);
router.post(
  "/auth/password-reset",
  passwordResetIpRateLimit,
  passwordResetRateLimit,
  requestPasswordReset,
);

export default router;
