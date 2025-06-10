import express from "express";
import { summaryController } from "../controllers/summaryController";

const router = express.Router();

// Get summaries for a document
router.get("/document/:documentId", summaryController.getByDocumentId);

// Create new summary
router.post("/", summaryController.create);

// Update summary
router.put("/:id", summaryController.update);

// Delete summary
router.delete("/:id", summaryController.delete);

export default router;
