"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = void 0;
const Chat_1 = require("../models/Chat");
const Document_1 = require("../models/Document");
const User_1 = require("../models/User");
const index_1 = require("../index");
exports.chatController = {
    async getAll(req, res) {
        var _a, _b;
        try {
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                domain: req.userDomain, // Filter by user's domain
                workspaceId: currentWorkspace, // Filter by user's workspace
            };
            // Always scope to requesting user (separate chats by user)
            if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const chats = await Chat_1.Chat.find(query).sort({ updatedAt: -1 });
            res.json(chats);
        }
        catch (error) {
            console.error("Error fetching chats:", error);
            res.status(500).json({ error: "Failed to fetch chats" });
        }
    },
    async getByDocumentId(req, res) {
        var _a, _b;
        try {
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                documentId: req.params.documentId,
                domain: req.userDomain, // Filter by user's domain
                workspaceId: currentWorkspace, // Ensure same workspace
            };
            // Always scope to requesting user
            if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const chats = await Chat_1.Chat.find(query).sort({ updatedAt: -1 });
            res.json(chats);
        }
        catch (error) {
            console.error("Error fetching chats:", error);
            res.status(500).json({ error: "Failed to fetch chats" });
        }
    },
    async create(req, res) {
        try {
            const user = req.user;
            const chatData = { ...req.body };
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            // Check if the document exists by id and belongs to user's domain and workspace
            const document = await Document_1.Document.findOne({
                id: chatData.documentId,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
            });
            if (!document) {
                return res.status(404).json({ error: "Document not found" });
            }
            // Get user's domainId
            const userWithDomain = await User_1.User.findById(user._id).select("domainId");
            if (!(userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId)) {
                return res.status(400).json({ error: "User domainId not found. Please contact administrator." });
            }
            // Add domain, domainId, and workspace to chat data
            chatData.domain = req.userDomain;
            chatData.domainId = userWithDomain.domainId; // Link to Domain schema
            chatData.workspaceId = currentWorkspace;
            if (user.microsoftId) {
                chatData.microsoftId = user.microsoftId;
            }
            else if (user._id) {
                chatData.userId = user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            chatData.messages = Array.isArray(req.body.messages)
                ? req.body.messages
                : [req.body.messages];
            const chat = new Chat_1.Chat(chatData);
            await chat.save();
            res.status(201).json(chat);
        }
        catch (error) {
            console.error("Error creating chat:", error);
            res.status(500).json({ error: "Failed to create chat" });
        }
    },
    async addMessage(req, res) {
        var _a, _b;
        try {
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                id: req.params.chatId,
                domain: req.userDomain, // Ensure user can only access chats from their domain
                workspaceId: currentWorkspace,
            };
            // Always scope to requesting user
            if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const chat = await Chat_1.Chat.findOne(query);
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
        }
        catch (error) {
            console.error("Error adding message:", error);
            res.status(500).json({ error: "Failed to add message" });
        }
    },
    async update(req, res) {
        var _a, _b;
        try {
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                id: req.params.id,
                domain: req.userDomain, // Ensure user can only update chats from their domain
                workspaceId: currentWorkspace,
            };
            // Always scope to requesting user
            if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const chat = await Chat_1.Chat.findOneAndUpdate(query, {
                ...req.body,
                messages: Array.isArray(req.body.messages)
                    ? req.body.messages
                    : req.body.messages,
                updatedAt: new Date(),
            }, { new: true });
            if (!chat) {
                return res.status(404).json({ error: "Chat not found" });
            }
            res.json(chat);
        }
        catch (error) {
            console.error("Error updating chat:", error);
            res.status(500).json({ error: "Failed to update chat" });
        }
    },
    async delete(req, res) {
        var _a, _b;
        try {
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                id: req.params.id,
                domain: req.userDomain, // Ensure user can only delete chats from their domain
                workspaceId: currentWorkspace,
            };
            // Always scope to requesting user
            if ((_a = req.user) === null || _a === void 0 ? void 0 : _a.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const chat = await Chat_1.Chat.findOneAndDelete(query);
            if (!chat) {
                return res.status(404).json({ error: "Chat not found" });
            }
            res.json({ message: "Chat deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting chat:", error);
            res.status(500).json({ error: "Failed to delete chat" });
        }
    },
    async chatStatusUpdate(req, res) {
        try {
            const { jobId, status, error } = req.body;
            if (!jobId || !status) {
                return res.status(400).json({ message: "Missing jobId or status" });
            }
            // Only emit on failure
            if (status.trim().toLowerCase() === "failed") {
                index_1.io.emit("chat_status", { jobId, status, error });
            }
            res.status(200).json({
                message: "Chat status update processed",
                jobId,
                status,
                error,
            });
        }
        catch (err) {
            res.status(500).json({
                message: "Failed to process chat status update",
                error: err instanceof Error ? err.message : err,
            });
        }
    },
    // Admin: Get all chats (filtered by domain)
    async getAllAdmin(req, res) {
        var _a;
        try {
            const user = req.user;
            if (!user || user.role !== "admin") {
                return res.status(403).json({ error: "Admin access required" });
            }
            const query = {
                domain: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain, // Filter by user's domain
            };
            const chats = await Chat_1.Chat.find(query).sort({ updatedAt: -1 });
            res.json(chats);
        }
        catch (error) {
            console.error("Error fetching all chats:", error);
            res.status(500).json({ error: "Failed to fetch chats" });
        }
    },
    // Admin: Get chat statistics
    async getStats(req, res) {
        var _a;
        try {
            const user = req.user;
            if (!user || user.role !== "admin") {
                return res.status(403).json({ error: "Admin access required" });
            }
            const domain = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain;
            const domainFilter = { domain };
            const totalChats = await Chat_1.Chat.countDocuments(domainFilter);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const chatsToday = await Chat_1.Chat.countDocuments({
                ...domainFilter,
                updatedAt: { $gte: today },
            });
            const thisWeek = new Date();
            thisWeek.setDate(thisWeek.getDate() - 7);
            const chatsThisWeek = await Chat_1.Chat.countDocuments({
                ...domainFilter,
                updatedAt: { $gte: thisWeek },
            });
            const thisMonth = new Date();
            thisMonth.setMonth(thisMonth.getMonth() - 1);
            const chatsThisMonth = await Chat_1.Chat.countDocuments({
                ...domainFilter,
                updatedAt: { $gte: thisMonth },
            });
            // Get top documents by chat count (filtered by domain)
            const topDocuments = await Chat_1.Chat.aggregate([
                {
                    $match: domainFilter,
                },
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
        }
        catch (error) {
            console.error("Error fetching chat stats:", error);
            res.status(500).json({ error: "Failed to fetch chat statistics" });
        }
    },
    // Admin: Delete any chat by id (filtered by domain)
    async deleteAnyAdmin(req, res) {
        var _a;
        try {
            const user = req.user;
            if (!user || user.role !== "admin") {
                return res.status(403).json({ error: "Admin access required" });
            }
            const domain = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain;
            const chat = await Chat_1.Chat.findOneAndDelete({
                id: req.params.id,
                domain, // Ensure admin can only delete chats from their domain
            });
            if (!chat) {
                return res.status(404).json({ error: "Chat not found" });
            }
            res.json({ message: "Chat deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting chat:", error);
            res.status(500).json({ error: "Failed to delete chat" });
        }
    },
};
