import { Request, Response } from "express";
import { Chat } from "../models/Chat";
import { Document } from "../models/Document";
import { io } from "../index";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

export const chatController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const query: any = {
        domain: req.userDomain, // Filter by user's domain
        workspaceId: currentWorkspace, // Filter by user's workspace
      };

      // Admins can see all chats in their domain, regular users see only their own
      if (req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        } else {
          return res.status(400).json({ error: "No user identifier found" });
        }
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
      const query: any = {
        documentId: req.params.documentId,
        domain: req.userDomain, // Filter by user's domain
      };

      // Admins can see all chats in their domain, regular users see only their own
      if (req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        } else {
          return res.status(400).json({ error: "No user identifier found" });
        }
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

      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      // Check if the document exists by id and belongs to user's domain and workspace
      const document = await Document.findOne({
        id: chatData.documentId,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      });
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Add domain and workspace to chat data
      chatData.domain = req.userDomain;
      chatData.workspaceId = currentWorkspace;

      if (user.microsoftId) {
        chatData.microsoftId = user.microsoftId;
      } else if (user._id) {
        chatData.userId = user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
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
      const query: any = {
        id: req.params.chatId,
        domain: req.userDomain, // Ensure user can only access chats from their domain
      };

      // Admins can access all chats in their domain, regular users see only their own
      if (req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        } else {
          return res.status(400).json({ error: "No user identifier found" });
        }
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
      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only update chats from their domain
      };

      // Admins can update all chats in their domain, regular users see only their own
      if (req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        } else {
          return res.status(400).json({ error: "No user identifier found" });
        }
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
      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only delete chats from their domain
      };

      // Admins can delete all chats in their domain, regular users see only their own
      if (req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        } else {
          return res.status(400).json({ error: "No user identifier found" });
        }
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

  async chatStatusUpdate(req: Request, res: Response) {
    try {
      const { jobId, status, error } = req.body;
      if (!jobId || !status) {
        return res.status(400).json({ message: "Missing jobId or status" });
      }
      // Only emit on failure
      if (status.trim().toLowerCase() === "failed") {
        io.emit("chat_status", { jobId, status, error });
      }
      res.status(200).json({
        message: "Chat status update processed",
        jobId,
        status,
        error,
      });
    } catch (err) {
      res.status(500).json({
        message: "Failed to process chat status update",
        error: err instanceof Error ? err.message : err,
      });
    }
  },

  // Admin: Get all chats (no user filtering)
  async getAllAdmin(req: Request, res: Response) {
    try {
      const chats = await Chat.find({}).sort({ updatedAt: -1 });
      res.json(chats);
    } catch (error) {
      console.error("Error fetching all chats:", error);
      res.status(500).json({ error: "Failed to fetch chats" });
    }
  },

  // Admin: Get chat statistics
  async getStats(req: Request, res: Response) {
    try {
      const totalChats = await Chat.countDocuments({});
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const chatsToday = await Chat.countDocuments({
        createdAt: { $gte: today },
      });

      const thisWeek = new Date();
      thisWeek.setDate(thisWeek.getDate() - 7);
      const chatsThisWeek = await Chat.countDocuments({
        createdAt: { $gte: thisWeek },
      });

      const thisMonth = new Date();
      thisMonth.setMonth(thisMonth.getMonth() - 1);
      const chatsThisMonth = await Chat.countDocuments({
        createdAt: { $gte: thisMonth },
      });

      // Get top documents by chat count
      const topDocuments = await Chat.aggregate([
        {
          $group: {
            _id: "$documentId",
            chatCount: { $sum: 1 },
          },
        },
        {
          $sort: { chatCount: -1 },
        },
        {
          $limit: 10,
        },
      ]);

      res.json({
        totalChats,
        chatsToday,
        chatsThisWeek,
        chatsThisMonth,
        topDocuments,
      });
    } catch (error) {
      console.error("Error fetching chat stats:", error);
      res.status(500).json({ error: "Failed to fetch chat statistics" });
    }
  },

  // Admin: Delete any chat by id (bypass ownership)
  async deleteAnyAdmin(req: Request, res: Response) {
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
