import express from "express";
import { chatController } from "../controllers/chatController";

const router = express.Router();

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

export default router;
