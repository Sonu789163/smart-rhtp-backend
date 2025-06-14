"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_1 = require("../controllers/chatController");
const router = express_1.default.Router();
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
exports.default = router;
