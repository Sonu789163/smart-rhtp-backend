import express from "express";
import { documentController } from "../controllers/documentController";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all documents for current user
router.get("/", documentController.getAll);

// Get single document
router.get("/:id", documentController.getById);

// Create document
router.post("/", documentController.create);

// Update document
router.put("/:id", documentController.update);

// Delete document
router.delete("/:id", documentController.delete);

export default router;
