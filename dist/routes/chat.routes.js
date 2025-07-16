"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_1 = require("../controllers/chatController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Get all chats for the user
router.get("/", chatController_1.chatController.getAll);
// Get chat history for a document
router.get("/document/:documentId", chatController_1.chatController.getByDocumentId);
// Create new chat
router.post("/", chatController_1.chatController.create);
// Add message to chat
router.post("/:chatId/messages", chatController_1.chatController.addMessage);
// Update chat
router.put("/:id", chatController_1.chatController.update);
// Delete chat
router.delete("/:id", chatController_1.chatController.delete);
// POST /chat-status/update (for n8n to notify chat status)
router.post("/chat-status/update", chatController_1.chatController.chatStatusUpdate);
exports.default = router;
