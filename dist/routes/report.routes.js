"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const reportController_1 = require("../controllers/reportController");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const rateLimitByUser_1 = require("../middleware/rateLimitByUser");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Apply domain middleware to all routes
router.use(domainAuth_1.domainAuthMiddleware);
// Get all reports for the user
router.get("/", reportController_1.reportController.getAll);
// Get single report
router.get("/:id", reportController_1.reportController.getById);
// Create new report (rate limited)
router.post("/create-report", (0, rateLimitByUser_1.rateLimitByUser)("report:create", 20, 24 * 60 * 60 * 1000), reportController_1.reportController.create);
// Update report
router.put("/:id", reportController_1.reportController.update);
// Delete report
router.delete("/:id", reportController_1.reportController.delete);
// Download DOCX for a report
router.get("/:id/download-docx", reportController_1.reportController.downloadDocx);
// Download PDF generated from HTML content for a report
router.get("/:id/download-html-pdf", reportController_1.reportController.downloadPdfFromHtml);
// POST /report-status/update (for n8n to notify status)
router.post("/report-status/update", reportController_1.reportController.reportStatusUpdate);
exports.default = router;
