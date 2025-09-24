"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const documentController_1 = require("../controllers/documentController");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const linkAccess_1 = require("../middleware/linkAccess");
const permissions_1 = require("../middleware/permissions");
const multer_1 = __importDefault(require("multer"));
const r2_1 = require("../config/r2");
const rateLimitByWorkspace_1 = require("../middleware/rateLimitByWorkspace");
const multer_s3_1 = __importDefault(require("multer-s3"));
const router = express_1.default.Router();
// POST /upload-status/update (for n8n to notify upload status)
router.post("/upload-status/update", documentController_1.documentController.uploadStatusUpdate);
// Process link access FIRST so downstream middlewares can use it
router.use(linkAccess_1.linkAccess);
// Apply auth middleware to all routes (skipped when linkToken present)
router.use(auth_1.authMiddleware);
// Apply domain middleware to all routes (respects link access domain)
router.use(domainAuth_1.domainAuthMiddleware);
const upload = (0, multer_1.default)({
    storage: (0, multer_s3_1.default)({
        s3: r2_1.r2Client,
        bucket: r2_1.R2_BUCKET,
        contentType: multer_s3_1.default.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            // Use a unique key for each file, e.g., timestamp + original name
            const uniqueKey = `${Date.now()}-${file.originalname}`;
            cb(null, uniqueKey);
        },
        acl: "private", // or 'public-read' if you want public access
    }),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});
// Get all documents for current user (supports directoryId and includeDeleted)
router.get("/", documentController_1.documentController.getAll);
// Admin: Get all documents across all workspaces
router.get("/admin", documentController_1.documentController.getAllAdmin);
// Check if document exists by namespace
router.get("/check-existing", documentController_1.documentController.checkExistingByNamespace);
// Get single document
router.get("/:id", (0, permissions_1.requireDocumentPermission)("id", "viewer"), documentController_1.documentController.getById);
// Create document
router.post("/", permissions_1.requireCreateInDirectory, documentController_1.documentController.create);
// Upload PDF document
router.post("/upload", (0, rateLimitByWorkspace_1.rateLimitByWorkspace)("document:upload", 100, 24 * 60 * 60 * 1000), upload.single("file"), 
// @ts-ignore
function (err, req, res, next) {
    if (err && err.code === "LIMIT_FILE_SIZE") {
        return res
            .status(413)
            .json({ error: "File too large. Maximum size is 25MB." });
    }
    next(err);
}, documentController_1.documentController.uploadDocument);
// Upload RHP document
router.post("/upload-rhp", (0, rateLimitByWorkspace_1.rateLimitByWorkspace)("document:upload", 100, 24 * 60 * 60 * 1000), upload.single("file"), // @ts-ignore
documentController_1.documentController.uploadRhp);
// Download/view PDF document
router.get("/download/:id", documentController_1.documentController.downloadDocument);
// Update document
router.put("/:id", (0, permissions_1.requireDocumentPermission)("id", "editor"), documentController_1.documentController.update);
// Delete document
router.delete("/:id", (0, permissions_1.requireDocumentPermission)("id", "editor"), documentController_1.documentController.delete);
// Restore route removed (trash disabled for now)
exports.default = router;
