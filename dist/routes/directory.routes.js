"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const directoryController_1 = require("../controllers/directoryController");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const linkAccess_1 = require("../middleware/linkAccess");
const permissions_1 = require("../middleware/permissions");
const router = express_1.default.Router();
router.use(auth_1.authMiddleware);
router.use(domainAuth_1.domainAuthMiddleware);
router.use(linkAccess_1.linkAccess);
router.post("/", permissions_1.requireCreateInDirectory, directoryController_1.directoryController.create);
router.get("/:id", (0, permissions_1.requireDirectoryPermission)("id", "viewer"), directoryController_1.directoryController.getById);
router.get("/:id/children", (0, permissions_1.requireDirectoryPermission)("id", "viewer"), directoryController_1.directoryController.listChildren);
router.patch("/:id", (0, permissions_1.requireDirectoryPermission)("id", "editor"), directoryController_1.directoryController.update);
router.post("/:id/move", (0, permissions_1.requireDirectoryPermission)("id", "editor"), directoryController_1.directoryController.move);
router.delete("/:id", (0, permissions_1.requireDirectoryPermission)("id", "editor"), directoryController_1.directoryController.delete);
// Restore route removed (trash disabled)
// Future: move subtree endpoint could be added here
exports.default = router;
