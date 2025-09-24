"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const summaryController_1 = require("../controllers/summaryController");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const rateLimitByWorkspace_1 = require("../middleware/rateLimitByWorkspace");
const permissions_1 = require("../middleware/permissions");
const router = express_1.default.Router();
// Enable link access to summaries of shared documents
const linkAccess_1 = require("../middleware/linkAccess");
router.use(linkAccess_1.linkAccess);
// Apply auth (skipped if linkToken provided)
router.use(auth_1.authMiddleware);
// Apply domain (respects link domain)
router.use(domainAuth_1.domainAuthMiddleware);
// Get all summaries for the user
router.get("/", summaryController_1.summaryController.getAll);
// Admin: Get all summaries across all workspaces
router.get("/admin", summaryController_1.summaryController.getAllAdmin);
// Admin metrics: total summaries count
router.get("/admin/metrics/count", async (req, res) => {
    var _a;
    try {
        const { Summary } = await Promise.resolve().then(() => __importStar(require("../models/Summary")));
        const total = await Summary.countDocuments({
            domain: (_a = req.user) === null || _a === void 0 ? void 0 : _a.domain,
        });
        res.json({ total });
    }
    catch (e) {
        res.status(500).json({ message: "Failed to load summary count" });
    }
});
// Get summaries for a document
router.get("/document/:documentId", summaryController_1.summaryController.getByDocumentId);
// Create new summary (rate limited)
router.post("/create", (0, rateLimitByWorkspace_1.rateLimitByWorkspace)("summary:create", 300, 24 * 60 * 60 * 1000), (0, permissions_1.requireBodyDocumentPermission)("documentId", "editor"), summaryController_1.summaryController.create);
// Update summary
router.put("/:id", (0, permissions_1.requireSummaryPermission)("id", "editor"), summaryController_1.summaryController.update);
// Delete summary
router.delete("/:id", (0, permissions_1.requireSummaryPermission)("id", "owner"), summaryController_1.summaryController.delete);
// Download DOCX for a summary
router.get("/:id/download-docx", summaryController_1.summaryController.downloadDocx);
// Download PDF generated from HTML content for a summary
router.get("/:id/download-html-pdf", summaryController_1.summaryController.downloadHtmlPdf);
// POST /summary-status/update (for n8n to notify status)
router.post("/summary-status/update", summaryController_1.summaryController.summaryStatusUpdate);
exports.default = router;
