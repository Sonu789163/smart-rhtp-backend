import express from "express";
import { summaryController } from "../controllers/summaryController";
import { authMiddleware } from "../middleware/auth";
import { domainAuthMiddleware } from "../middleware/domainAuth";
import { rateLimitByUser } from "../middleware/rateLimitByUser";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);
// Apply domain middleware to all routes
router.use(domainAuthMiddleware);

// Get all summaries for the user
router.get("/", summaryController.getAll);

// Admin metrics: total summaries count
router.get("/admin/metrics/count", async (req, res) => {
  try {
    const { Summary } = await import("../models/Summary");
    const total = await Summary.countDocuments({
      domain: (req as any).user?.domain,
    });
    res.json({ total });
  } catch (e) {
    res.status(500).json({ message: "Failed to load summary count" });
  }
});

// Get summaries for a document
router.get("/document/:documentId", summaryController.getByDocumentId);

// Create new summary (rate limited)
router.post(
  "/create",
  rateLimitByUser("summary:create", 40, 24 * 60 * 60 * 1000),
  summaryController.create
);

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
