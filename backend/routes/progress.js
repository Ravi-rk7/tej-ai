import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { routineReadLimiter } from "../middleware/routineRateLimitMiddleware.js";
import { createProgressHandler } from "../controllers/progressController.js";
const router = express.Router();
router.get(
  "/progress/scans",
  authMiddleware,
  routineReadLimiter,
  createProgressHandler(),
);
export default router;
