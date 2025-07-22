"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const summaryController_1 = require("../controllers/summaryController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Get all summaries for the user
router.get("/", summaryController_1.summaryController.getAll);
// Get summaries for a document
router.get("/document/:documentId", summaryController_1.summaryController.getByDocumentId);
// Create new summary
router.post("/create", summaryController_1.summaryController.create);
// Update summary
router.put("/:id", summaryController_1.summaryController.update);
// Delete summary
router.delete("/:id", summaryController_1.summaryController.delete);
// Download PDF for a summary
router.get("/:id/download-pdf", summaryController_1.summaryController.downloadPdf);
// Download DOCX for a summary
router.get("/:id/download-docx", summaryController_1.summaryController.downloadDocx);
// POST /summary-status/update (for n8n to notify status)
router.post("/summary-status/update", summaryController_1.summaryController.summaryStatusUpdate);
exports.default = router;
