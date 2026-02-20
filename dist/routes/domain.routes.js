"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const domainController_1 = require("../controllers/domainController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Multer config for SOP file uploads (memory storage for proxy forwarding)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (_req, file, cb) => {
        const allowedTypes = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error("Only PDF, DOCX, and TXT files are allowed"));
        }
    },
});
// ── Domain Configuration ──
// Get domain configuration (All authenticated users can read)
router.get("/config", auth_1.authMiddleware, domainController_1.domainController.getConfig);
// Update domain configuration (Admin only)
router.put("/config", auth_1.authMiddleware, domainController_1.domainController.updateConfig);
// ── Onboarding ──
// Get onboarding status
router.get("/onboarding/status", auth_1.authMiddleware, domainController_1.domainController.getOnboardingStatus);
// Initial onboarding setup (Admin only, proxies to Python AI Platform)
router.post("/onboarding/setup", auth_1.authMiddleware, upload.single("file"), domainController_1.domainController.setupOnboarding);
// Re-onboarding with updated SOP (Admin only, proxies to Python AI Platform)
router.post("/onboarding/re-onboard", auth_1.authMiddleware, upload.single("file"), domainController_1.domainController.reOnboard);
exports.default = router;
