import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  content: { type: String, required: true },
  isUser: { type: Boolean, required: true },
  timestamp: { type: Date, required: true },
});

const chatSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  messages: [messageSchema],
  updatedAt: { type: Date, default: Date.now },
  documentId: { type: String, required: true },
});

export const Chat = mongoose.model("Chat", chatSchema);
