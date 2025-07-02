"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const documentController_1 = require("../controllers/documentController");
const auth_1 = require("../middleware/auth");
const multer_1 = __importDefault(require("multer"));
const gridfs_1 = require("../config/gridfs");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
const upload = (0, multer_1.default)({
    storage: gridfs_1.storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});
// Get all documents for current user
router.get("/", documentController_1.documentController.getAll);
// Get single document
router.get("/:id", documentController_1.documentController.getById);
// Create document
router.post("/", documentController_1.documentController.create);
// Upload PDF document
router.post("/upload", upload.single("file"), 
// @ts-ignore
function (err, req, res, next) {
    if (err && err.code === "LIMIT_FILE_SIZE") {
        return res
            .status(413)
            .json({ error: "File too large. Maximum size is 25MB." });
    }
    next(err);
}, documentController_1.documentController.uploadDocument);
// Download/view PDF document
router.get("/download/:id", documentController_1.documentController.downloadDocument);
// Update document
router.put("/:id", documentController_1.documentController.update);
// Delete document
router.delete("/:id", documentController_1.documentController.delete);
exports.default = router;
