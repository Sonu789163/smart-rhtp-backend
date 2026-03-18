"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const healthController_1 = require("../controllers/healthController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Public health check
router.get("/basic", healthController_1.healthController.basicHealth);
// Admin health check
router.get("/admin/detailed", auth_1.authMiddleware, healthController_1.healthController.getSystemHealth);
exports.default = router;
