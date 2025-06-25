"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentController = void 0;
const Document_1 = require("../models/Document");
exports.documentController = {
    async getAll(req, res) {
        try {
            const query = {};
            if (req.user.microsoftId)
                query.microsoftId = req.user.microsoftId;
            else if (req.user._id)
                query.userId = req.user._id;
            const documents = await Document_1.Document.find(query).sort({ uploadedAt: -1 });
            res.json(documents);
        }
        catch (error) {
            res.status(500).json({ error: "Failed to fetch documents" });
        }
    },
    async getById(req, res) {
        try {
            const query = { id: req.params.id };
            if (req.user.microsoftId)
                query.microsoftId = req.user.microsoftId;
            else if (req.user._id)
                query.userId = req.user._id;
            const document = await Document_1.Document.findOne(query);
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
            const user = req.user;
            const docData = { ...req.body };
            if (user.microsoftId) {
                docData.microsoftId = user.microsoftId;
            }
            else if (user._id) {
                docData.userId = user._id;
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const document = new Document_1.Document(docData);
            await document.save();
            res.status(201).json(document);
        }
        catch (error) {
            console.error("Error creating document:", error);
            res.status(500).json({ error: "Failed to create document" });
        }
    },
    async update(req, res) {
        try {
            const query = { id: req.params.id };
            if (req.user.microsoftId)
                query.microsoftId = req.user.microsoftId;
            else if (req.user._id)
                query.userId = req.user._id;
            const document = await Document_1.Document.findOneAndUpdate(query, req.body, {
                new: true,
            });
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
            const query = { id: req.params.id };
            if (req.user.microsoftId)
                query.microsoftId = req.user.microsoftId;
            else if (req.user._id)
                query.userId = req.user._id;
            const document = await Document_1.Document.findOneAndDelete(query);
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
