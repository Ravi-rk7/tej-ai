import express from "express";
import { login, requestPasswordReset } from "../controllers/authController.js";
import {
  loginRateLimit,
  passwordResetRateLimit,
} from "../middleware/authRateLimitMiddleware.js";

const router = express.Router();

router.post("/auth/login", loginRateLimit, login);
router.post(
  "/auth/password-reset",
  passwordResetRateLimit,
  requestPasswordReset,
);

export default router;
