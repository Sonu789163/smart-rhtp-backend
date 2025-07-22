import express from "express";
import { reportController } from "../controllers/reportController";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all reports for the user
router.get("/", reportController.getAll);

// Get single report
router.get("/:id", reportController.getById);

// Create new report (webhook for n8n)
router.post("/create-report", reportController.create);

// Update report
router.put("/:id", reportController.update);

// Delete report
router.delete("/:id", reportController.delete);

// Download PDF for a report
router.get("/:id/download-pdf", reportController.downloadPdf);

// Download DOCX for a report
router.get("/:id/download-docx", reportController.downloadDocx);

// POST /report-status/update (for n8n to notify status)
router.post("/report-status/update", reportController.reportStatusUpdate);

export default router;
