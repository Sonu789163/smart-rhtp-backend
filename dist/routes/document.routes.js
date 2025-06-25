"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const documentController_1 = require("../controllers/documentController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Get all documents for current user
router.get("/", documentController_1.documentController.getAll);
// Get single document
router.get("/:id", documentController_1.documentController.getById);
// Create document
router.post("/", documentController_1.documentController.create);
// Update document
router.put("/:id", documentController_1.documentController.update);
// Delete document
router.delete("/:id", documentController_1.documentController.delete);
exports.default = router;
