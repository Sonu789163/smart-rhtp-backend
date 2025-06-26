import { Request, Response } from "express";
import { Chat } from "../models/Chat";
import { Document } from "../models/Document";

interface AuthRequest extends Request {
  user?: any;
}

export const chatController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const query: any = {};
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const chats = await Chat.find(query).sort({ updatedAt: -1 });
      res.json(chats);
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    }
  },

  async getByDocumentId(req: AuthRequest, res: Response) {
    try {
      const query: any = { documentId: req.params.documentId };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const chats = await Chat.find(query).sort({ updatedAt: -1 });
      res.json(chats);
    } catch (error) {
      console.error("Error fetching chats:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const chatData = { ...req.body };

      // Validate that the document belongs to the user
      const documentQuery: any = { id: chatData.documentId };
      if (user.microsoftId) {
        documentQuery.microsoftId = user.microsoftId;
        chatData.microsoftId = user.microsoftId;
      } else if (user._id) {
        documentQuery.userId = user._id.toString();
        chatData.userId = user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }

      // Check if document exists and belongs to user
      const document = await Document.findOne(documentQuery);
      if (!document) {
        return res
          .status(404)
          .json({ error: "Document not found or access denied" });
      }

      chatData.messages = Array.isArray(req.body.messages)
        ? req.body.messages
        : [req.body.messages];
      const chat = new Chat(chatData);
      await chat.save();
      res.status(201).json(chat);
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(500).json({ error: "Failed to create chat" });
    }
  },

  async addMessage(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.chatId };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const chat = await Chat.findOne(query);
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

  async update(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const chat = await Chat.findOneAndUpdate(
        query,
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

  async delete(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const chat = await Chat.findOneAndDelete(query);
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
