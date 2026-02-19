import express from "express";
import { domainController } from "../controllers/domainController";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Get domain configuration (All authenticated users can read)
router.get("/config", authMiddleware, domainController.getConfig);

// Update domain configuration (Admin only)
router.put("/config", authMiddleware, domainController.updateConfig);

export default router;
