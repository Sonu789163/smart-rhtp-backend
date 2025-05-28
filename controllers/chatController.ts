import { Request, Response } from "express";
import { Chat } from "../models/Chat";

export const chatController = {
  async getByDocumentId(req: Request, res: Response) {
    try {
      const chats = await Chat.find({ documentId: req.params.documentId }).sort(
        { updatedAt: -1 }
      );
      res.json(chats);
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const chat = new Chat({
        ...req.body,
        messages: Array.isArray(req.body.messages)
          ? req.body.messages
          : [req.body.messages],
      });
      await chat.save();
      res.status(201).json(chat);
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(500).json({ error: "Failed to create chat" });
    }
  },

  async addMessage(req: Request, res: Response) {
    try {
      const chat = await Chat.findOne({ id: req.params.chatId });
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      const message = {
        ...req.body,
        timestamp: new Date(req.body.timestamp || Date.now()),
      };

      chat.messages.push(message);
      chat.updatedAt = new Date();
      await chat.save();
      res.json(chat);
    } catch (error) {
      console.error("Error adding message:", error);
      res.status(500).json({ error: "Failed to add message" });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const chat = await Chat.findOneAndUpdate(
        { id: req.params.id },
        {
          ...req.body,
          messages: Array.isArray(req.body.messages)
            ? req.body.messages
            : req.body.messages,
          updatedAt: new Date(),
        },
        { new: true }
      );
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      res.json(chat);
    } catch (error) {
      console.error("Error updating chat:", error);
      res.status(500).json({ error: "Failed to update chat" });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const chat = await Chat.findOneAndDelete({ id: req.params.id });
      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
      res.json({ message: "Chat deleted successfully" });
    } catch (error) {
      console.error("Error deleting chat:", error);
      res.status(500).json({ error: "Failed to delete chat" });
    }
  },
};
