import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  routineMutationLimiter,
  routinePreferenceLimiter,
  routineReadLimiter,
} from "../middleware/routineRateLimitMiddleware.js";
import { createRoutineHandlers } from "../controllers/routineController.js";

const router = express.Router();
const handlers = createRoutineHandlers();
router.get(
  "/routine/summary",
  authMiddleware,
  routineReadLimiter,
  handlers.summary,
);
router.put(
  "/routine/preferences",
  authMiddleware,
  routinePreferenceLimiter,
  handlers.preferences,
);
router.put(
  "/routine/check-ins/today/:period",
  authMiddleware,
  routineMutationLimiter,
  handlers.complete,
);
router.delete(
  "/routine/check-ins/today/:period",
  authMiddleware,
  routineMutationLimiter,
  handlers.undo,
);
export default router;
