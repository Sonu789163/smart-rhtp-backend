"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryController = void 0;
const Summary_1 = require("../models/Summary");
const Document_1 = require("../models/Document");
exports.summaryController = {
    async getAll(req, res) {
        try {
            const query = {};
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const summaries = await Summary_1.Summary.find(query).sort({ updatedAt: -1 });
            res.json(summaries);
        }
        catch (error) {
            console.error("Error fetching summaries:", error);
            res.status(500).json({ message: "Error fetching summaries" });
        }
    },
    async getByDocumentId(req, res) {
        try {
            const { documentId } = req.params;
            const query = { documentId };
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const summaries = await Summary_1.Summary.find(query).sort({ updatedAt: -1 });
            res.json(summaries);
        }
        catch (error) {
            console.error("Error fetching summaries:", error);
            res.status(500).json({ message: "Error fetching summaries" });
        }
    },
    async create(req, res) {
        try {
            const { title, content, documentId, metadata } = req.body;
            if (!title || !content || !documentId) {
                return res.status(400).json({
                    message: "Missing required fields",
                    required: { title, content, documentId },
                });
            }
            const user = req.user;
            // Validate that the document belongs to the user
            const documentQuery = { id: documentId };
            if (user.microsoftId) {
                documentQuery.microsoftId = user.microsoftId;
            }
            else if (user._id) {
                documentQuery.userId = user._id.toString();
            }
            else {
                return res.status(400).json({ message: "No user identifier found" });
            }
            // Check if document exists and belongs to user
            const document = await Document_1.Document.findOne(documentQuery);
            if (!document) {
                return res
                    .status(404)
                    .json({ error: "Document not found or access denied" });
            }
            const summaryData = {
                id: Date.now().toString(),
                title,
                content,
                documentId,
                updatedAt: new Date(),
                metadata,
            };
            if (user.microsoftId) {
                summaryData.microsoftId = user.microsoftId;
            }
            else if (user._id) {
                summaryData.userId = user._id.toString();
            }
            else {
                return res.status(400).json({ message: "No user identifier found" });
            }
            const summary = new Summary_1.Summary(summaryData);
            await summary.save();
            res.status(201).json(summary);
        }
        catch (error) {
            console.error("Error creating summary:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            res.status(500).json({
                message: "Error creating summary",
                error: errorMessage,
            });
        }
    },
    async update(req, res) {
        try {
            const { id } = req.params;
            const query = { id };
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const summary = await Summary_1.Summary.findOneAndUpdate(query, req.body, {
                new: true,
            });
            if (!summary) {
                return res.status(404).json({ message: "Summary not found" });
            }
            res.json(summary);
        }
        catch (error) {
            console.error("Error updating summary:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            res.status(500).json({
                message: "Error updating summary",
                error: errorMessage,
            });
        }
    },
    async delete(req, res) {
        try {
            const { id } = req.params;
            const query = { id };
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const summary = await Summary_1.Summary.findOneAndDelete(query);
            if (!summary) {
                return res.status(404).json({ message: "Summary not found" });
            }
            res.json({ message: "Summary deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting summary:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            res.status(500).json({
                message: "Error deleting summary",
                error: errorMessage,
            });
        }
    },
};
