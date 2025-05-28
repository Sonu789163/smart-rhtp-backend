"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentController = void 0;
const Document_1 = require("../models/Document");
exports.documentController = {
    async getAll(req, res) {
        try {
            const documents = await Document_1.Document.find().sort({ uploadedAt: -1 });
            res.json(documents);
        }
        catch (error) {
            res.status(500).json({ error: "Failed to fetch documents" });
        }
    },
    async getById(req, res) {
        try {
            const document = await Document_1.Document.findOne({ id: req.params.id });
            if (!document) {
                return res.status(404).json({ error: "Document not found" });
            }
            res.json(document);
        }
        catch (error) {
            res.status(500).json({ error: "Failed to fetch document" });
        }
    },
    async create(req, res) {
        try {
            const document = new Document_1.Document(req.body);
            await document.save();
            res.status(201).json(document);
        }
        catch (error) {
            res.status(500).json({ error: "Failed to create document" });
        }
    },
    async update(req, res) {
        try {
            const document = await Document_1.Document.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
            if (!document) {
                return res.status(404).json({ error: "Document not found" });
            }
            res.json(document);
        }
        catch (error) {
            res.status(500).json({ error: "Failed to update document" });
        }
    },
    async delete(req, res) {
        try {
            const document = await Document_1.Document.findOneAndDelete({ id: req.params.id });
            if (!document) {
                return res.status(404).json({ error: "Document not found" });
            }
            res.json({ message: "Document deleted successfully" });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to delete document" });
        }
    },
};
