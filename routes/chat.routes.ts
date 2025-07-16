import express from "express";
import { chatController } from "../controllers/chatController";
import { authMiddleware } from "../middleware/auth";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all chats for the user
router.get("/", chatController.getAll);

// Get chat history for a document
router.get("/document/:documentId", chatController.getByDocumentId);

// Create new chat
router.post("/", chatController.create);

// Add message to chat
router.post("/:chatId/messages", chatController.addMessage);

// Update chat
router.put("/:id", chatController.update);

// Delete chat
router.delete("/:id", chatController.delete);

// POST /chat-status/update (for n8n to notify chat status)
router.post("/chat-status/update", chatController.chatStatusUpdate);

export default router;
