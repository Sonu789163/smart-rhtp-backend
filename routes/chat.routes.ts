import express from "express";
import { chatController } from "../controllers/chatController";
import { authMiddleware, authorize } from "../middleware/auth";
import { rateLimitByUser } from "../middleware/rateLimitByUser";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all chats for the user
router.get("/", chatController.getAll);

// Admin: Get all chats
router.get("/admin", authorize(["admin"]), chatController.getAllAdmin);

// Admin: Chat stats and monitoring
router.get("/admin/stats", authorize(["admin"]), chatController.getStats);

// Get chat history for a document
router.get("/document/:documentId", chatController.getByDocumentId);

// Create new chat (rate limited)
router.post(
  "/",
  rateLimitByUser("chat:create", 200, 24 * 60 * 60 * 1000),
  chatController.create
);

// Add message to chat
router.post("/:chatId/messages", chatController.addMessage);

// Update chat
router.put("/:id", chatController.update);

// Delete chat (user can delete own chat)
router.delete("/:id", chatController.delete);

// Admin: delete any chat by id (bypass ownership)
router.delete(
  "/admin/:id",
  authorize(["admin"]),
  chatController.deleteAnyAdmin
);

// POST /chat-status/update (for n8n to notify chat status)
router.post("/chat-status/update", chatController.chatStatusUpdate);

export default router;
