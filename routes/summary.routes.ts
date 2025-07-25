import express from "express";
import { summaryController } from "../controllers/summaryController";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all summaries for the user
router.get("/", summaryController.getAll);

// Get summaries for a document
router.get("/document/:documentId", summaryController.getByDocumentId);

// Create new summary
router.post("/create", summaryController.create);

// Update summary
router.put("/:id", summaryController.update);

// Delete summary
router.delete("/:id", summaryController.delete);

// Download DOCX for a summary
router.get("/:id/download-docx", summaryController.downloadDocx);

// Download PDF generated from HTML content for a summary
router.get("/:id/download-html-pdf", summaryController.downloadHtmlPdf);

// POST /summary-status/update (for n8n to notify status)
router.post("/summary-status/update", summaryController.summaryStatusUpdate);

export default router;
