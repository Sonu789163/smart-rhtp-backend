"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const reportController_1 = require("../controllers/reportController");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const rateLimitByWorkspace_1 = require("../middleware/rateLimitByWorkspace");
const permissions_1 = require("../middleware/permissions");
const linkAccess_1 = require("../middleware/linkAccess");
const router = express_1.default.Router();
// Allow link access for related reports
router.use(linkAccess_1.linkAccess);
// Apply auth (skipped if linkToken provided)
router.use(auth_1.authMiddleware);
// Apply domain (respects link domain)
router.use(domainAuth_1.domainAuthMiddleware);
// Get all reports for the user
router.get("/", reportController_1.reportController.getAll);
// Get single report
router.get("/:id", (0, permissions_1.requireReportPermission)("id", "viewer"), reportController_1.reportController.getById);
// Create new report (rate limited)
router.post("/create-report", (0, rateLimitByWorkspace_1.rateLimitByWorkspace)("report:create", 100, 24 * 60 * 60 * 1000), 
// Need at least editor on DRHP to create a report
(0, permissions_1.requireBodyDocumentPermission)("drhpId", "editor"), reportController_1.reportController.create);
// Update report
router.put("/:id", (0, permissions_1.requireReportPermission)("id", "editor"), reportController_1.reportController.update);
// Delete report
router.delete("/:id", (0, permissions_1.requireReportPermission)("id", "owner"), reportController_1.reportController.delete);
// Download DOCX for a report
router.get("/:id/download-docx", reportController_1.reportController.downloadDocx);
// Download PDF generated from HTML content for a report
router.get("/:id/download-html-pdf", reportController_1.reportController.downloadPdfFromHtml);
// POST /report-status/update (for n8n to notify status)
router.post("/report-status/update", reportController_1.reportController.reportStatusUpdate);
exports.default = router;
