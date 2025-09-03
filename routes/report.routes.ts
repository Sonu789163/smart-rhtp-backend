import express from "express";
import { reportController } from "../controllers/reportController";
import { authMiddleware } from "../middleware/auth";
import { rateLimitByUser } from "../middleware/rateLimitByUser";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all reports for the user
router.get("/", reportController.getAll);

// Get single report
router.get("/:id", reportController.getById);

// Create new report (rate limited)
router.post(
  "/create-report",
  rateLimitByUser("report:create", 20, 24 * 60 * 60 * 1000),
  reportController.create
);

// Update report
router.put("/:id", reportController.update);

// Delete report
router.delete("/:id", reportController.delete);

// Download DOCX for a report
router.get("/:id/download-docx", reportController.downloadDocx);

// Download PDF generated from HTML content for a report
router.get("/:id/download-html-pdf", reportController.downloadPdfFromHtml);

// POST /report-status/update (for n8n to notify status)
router.post("/report-status/update", reportController.reportStatusUpdate);

export default router;
