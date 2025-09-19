"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
router.use(auth_1.authMiddleware);
router.use(domainAuth_1.domainAuthMiddleware);
router.get("/", notificationController_1.notificationController.list);
router.post("/:id/read", notificationController_1.notificationController.markRead);
router.post("/read-all", notificationController_1.notificationController.markAllRead);
router.delete("/:id", notificationController_1.notificationController.delete);
exports.default = router;
