import express from "express";
import { summaryController } from "../controllers/summaryController";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get summaries for a document
router.get("/document/:documentId", summaryController.getByDocumentId);

// Create new summary
router.post("/", summaryController.create);

// Update summary
router.put("/:id", summaryController.update);

// Delete summary
router.delete("/:id", summaryController.delete);

export default router;
