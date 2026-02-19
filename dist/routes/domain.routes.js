"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const domainController_1 = require("../controllers/domainController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Get domain configuration (All authenticated users can read)
router.get("/config", auth_1.authMiddleware, domainController_1.domainController.getConfig);
// Update domain configuration (Admin only)
router.put("/config", auth_1.authMiddleware, domainController_1.domainController.updateConfig);
exports.default = router;
