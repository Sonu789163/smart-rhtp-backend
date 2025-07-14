"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentController = void 0;
const Document_1 = require("../models/Document");
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_1 = require("mongodb");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
exports.documentController = {
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
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
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
                docData.userId = user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            // Ensure namespace is always set
            if (!docData.namespace) {
                docData.namespace = docData.name;
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
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
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
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const document = await Document_1.Document.findOne(query);
            if (!document) {
                return res.status(404).json({ error: "Document not found" });
            }
            // Delete file from GridFS
            if (document.fileId) {
                const conn = mongoose_1.default.connection;
                const bucket = new mongodb_1.GridFSBucket(conn.db, { bucketName: "uploads" });
                await bucket.delete(document.fileId);
            }
            await document.deleteOne();
            res.json({ message: "Document deleted successfully" });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to delete document" });
        }
    },
    async uploadDocument(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            const originalname = req.file.originalname;
            const fileId = req.file.id;
            const user = req.user;
            // Use namespace from frontend if present, else fallback to originalname
            const docData = {
                id: fileId.toString(),
                name: originalname,
                fileId: fileId,
                namespace: req.body.namespace || originalname,
            };
            if (user === null || user === void 0 ? void 0 : user.microsoftId) {
                docData.microsoftId = user.microsoftId;
            }
            else if (user === null || user === void 0 ? void 0 : user._id) {
                docData.userId = user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const document = new Document_1.Document(docData);
            await document.save();
            // Notify n8n for further processing
            const n8nWebhookUrl = "https://n8n-excollo.azurewebsites.net/webhook/bfda1ff3-99be-4f6e-995f-7728ca5b2f6a";
            const conn = mongoose_1.default.connection;
            const bucket = new mongodb_1.GridFSBucket(conn.db, { bucketName: "uploads" });
            const form = new form_data_1.default();
            form.append("file", bucket.openDownloadStream(document.fileId), {
                filename: document.name,
                contentType: "application/pdf",
            });
            form.append("documentId", document.id);
            form.append("namespace", document.name);
            form.append("name", document.name);
            form.append("userId", document.userId || document.microsoftId);
            console.log("fromData", form);
            try {
                await axios_1.default.post(n8nWebhookUrl, form, {
                    headers: form.getHeaders(),
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                });
            }
            catch (n8nErr) {
                console.error("Failed to send file to n8n:", n8nErr);
            }
            res.status(201).json({ message: "File uploaded successfully", document });
        }
        catch (error) {
            console.error("Error uploading document:", error);
            res.status(500).json({ error: "Failed to upload document" });
        }
    },
    async downloadDocument(req, res) {
        try {
            const document = await Document_1.Document.findOne({ id: req.params.id });
            if (!document || !document.fileId) {
                return res.status(404).json({ error: "Document not found or no file" });
            }
            const conn = mongoose_1.default.connection;
            const bucket = new mongodb_1.GridFSBucket(conn.db, { bucketName: "uploads" });
            res.set({
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename=\"${document.name}\"`,
            });
            const downloadStream = bucket.openDownloadStream(document.fileId);
            downloadStream.pipe(res).on("error", () => {
                res.status(500).json({ error: "Error downloading file" });
            });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to download document" });
        }
    },
    async checkExistingByNamespace(req, res) {
        try {
            const { namespace } = req.query;
            if (!namespace) {
                return res
                    .status(400)
                    .json({ error: "Namespace parameter is required" });
            }
            const query = { namespace: namespace };
            if (req.user.microsoftId) {
                query.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                query.userId = req.user._id.toString();
            }
            else {
                return res.status(400).json({ error: "No user identifier found" });
            }
            const existingDocument = await Document_1.Document.findOne(query);
            if (existingDocument) {
                res.json({
                    exists: true,
                    document: existingDocument,
                    message: "Document with this name already exists",
                });
            }
            else {
                res.json({
                    exists: false,
                    message: "Document with this name does not exist",
                });
            }
        }
        catch (error) {
            console.error("Error checking existing document:", error);
            res.status(500).json({ error: "Failed to check existing document" });
        }
    },
};
