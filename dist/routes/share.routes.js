"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const shareController_1 = require("../controllers/shareController");
const router = express_1.default.Router();
router.use(auth_1.authMiddleware);
router.use(domainAuth_1.domainAuthMiddleware);
router.get("/", shareController_1.shareController.list);
router.post("/", shareController_1.shareController.create);
router.delete("/:id", shareController_1.shareController.revoke);
router.post("/link", shareController_1.shareController.linkCreateOrRotate);
router.get("/link/:token", shareController_1.shareController.linkResolve);
exports.default = router;
