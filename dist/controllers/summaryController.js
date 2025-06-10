"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryController = void 0;
const Summary_1 = require("../models/Summary");
exports.summaryController = {
    async getByDocumentId(req, res) {
        try {
            const { documentId } = req.params;
            const summaries = await Summary_1.Summary.find({ documentId }).sort({
                updatedAt: -1,
            });
            res.json(summaries);
        }
        catch (error) {
            console.error("Error fetching summaries:", error);
            res.status(500).json({ message: "Error fetching summaries" });
        }
    },
    async create(req, res) {
        try {
            const { title, content, documentId } = req.body;
            if (!title || !content || !documentId) {
                return res.status(400).json({
                    message: "Missing required fields",
                    required: { title, content, documentId },
                });
            }
            const summary = new Summary_1.Summary({
                id: Date.now().toString(),
                title,
                content,
                documentId,
                updatedAt: new Date(),
            });
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
            const summary = await Summary_1.Summary.findOneAndUpdate({ id }, req.body, {
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
            const summary = await Summary_1.Summary.findOneAndDelete({ id });
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
