"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const summaryController_1 = require("../controllers/summaryController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Get summaries for a document
router.get("/document/:documentId", summaryController_1.summaryController.getByDocumentId);
// Create new summary
router.post("/", summaryController_1.summaryController.create);
// Update summary
router.put("/:id", summaryController_1.summaryController.update);
// Delete summary
router.delete("/:id", summaryController_1.summaryController.delete);
exports.default = router;
