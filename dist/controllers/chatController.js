"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = void 0;
const Chat_1 = require("../models/Chat");
exports.chatController = {
    async getByDocumentId(req, res) {
        try {
            const chats = await Chat_1.Chat.find({ documentId: req.params.documentId }).sort({ updatedAt: -1 });
            res.json(chats);
        }
        catch (error) {
            console.error("Error fetching chats:", error);
            res.status(500).json({ error: "Failed to fetch chats" });
        }
    },
    async create(req, res) {
        try {
            const chat = new Chat_1.Chat({
                ...req.body,
                messages: Array.isArray(req.body.messages)
                    ? req.body.messages
                    : [req.body.messages],
            });
            await chat.save();
            res.status(201).json(chat);
        }
        catch (error) {
            console.error("Error creating chat:", error);
            res.status(500).json({ error: "Failed to create chat" });
        }
    },
    async addMessage(req, res) {
        try {
            const chat = await Chat_1.Chat.findOne({ id: req.params.chatId });
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
        try {
            const chat = await Chat_1.Chat.findOneAndUpdate({ id: req.params.id }, {
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
        try {
            const chat = await Chat_1.Chat.findOneAndDelete({ id: req.params.id });
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
