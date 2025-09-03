"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_1 = require("../controllers/chatController");
const auth_1 = require("../middleware/auth");
const rateLimitByUser_1 = require("../middleware/rateLimitByUser");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Get all chats for the user
router.get("/", chatController_1.chatController.getAll);
// Admin: Get all chats
router.get("/admin", (0, auth_1.authorize)(["admin"]), chatController_1.chatController.getAllAdmin);
// Admin: Chat stats and monitoring
router.get("/admin/stats", (0, auth_1.authorize)(["admin"]), chatController_1.chatController.getStats);
// Get chat history for a document
router.get("/document/:documentId", chatController_1.chatController.getByDocumentId);
// Create new chat (rate limited)
router.post("/", (0, rateLimitByUser_1.rateLimitByUser)("chat:create", 200, 24 * 60 * 60 * 1000), chatController_1.chatController.create);
// Add message to chat
router.post("/:chatId/messages", chatController_1.chatController.addMessage);
// Update chat
router.put("/:id", chatController_1.chatController.update);
// Delete chat (user can delete own chat)
router.delete("/:id", chatController_1.chatController.delete);
// Admin: delete any chat by id (bypass ownership)
router.delete("/admin/:id", (0, auth_1.authorize)(["admin"]), chatController_1.chatController.deleteAnyAdmin);
// POST /chat-status/update (for n8n to notify chat status)
router.post("/chat-status/update", chatController_1.chatController.chatStatusUpdate);
exports.default = router;
