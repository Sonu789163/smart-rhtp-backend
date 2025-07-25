"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentController = void 0;
const Document_1 = require("../models/Document");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const index_1 = require("../index");
const r2_1 = require("../config/r2");
const client_s3_1 = require("@aws-sdk/client-s3");
exports.documentController = {
    async getAll(req, res) {
        try {
            const query = { type: "DRHP" };
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
            const docData = { ...req.body };
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
    async uploadDocument(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            const originalname = req.file.originalname;
            const fileKey = req.file.key;
            const user = req.user;
            // Use namespace from frontend if present, else fallback to originalname
            const docData = {
                id: fileKey,
                name: originalname,
                fileKey: fileKey,
                namespace: req.body.namespace || originalname,
                type: "DRHP", // Set type for DRHP documents
            };
            // if (user?.microsoftId) {
            //   docData.microsoftId = user.microsoftId;
            // } else if (user?._id) {
            //   docData.userId = user._id.toString();
            // } else {
            //   return res.status(400).json({ error: "No user identifier found" });
            // }
            const document = new Document_1.Document(docData);
            await document.save();
            // Notify n8n for further processing
            const n8nWebhookUrl = "https://n8n-excollo.azurewebsites.net/webhook/bfda1ff3-99be-4f6e-995f-7728ca5b2f6a";
            // Download file from S3 and send to n8n
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: r2_1.R2_BUCKET,
                Key: fileKey,
            });
            const s3Response = await r2_1.r2Client.send(getObjectCommand);
            const form = new form_data_1.default();
            form.append("file", s3Response.Body, {
                filename: document.name,
                contentType: "application/pdf",
            });
            form.append("documentId", document.id);
            form.append("namespace", document.name);
            form.append("name", document.name);
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
            if (!document || !document.fileKey) {
                return res.status(404).json({ error: "Document not found or no file" });
            }
            res.set({
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename=\"${document.name}\"`,
            });
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: r2_1.R2_BUCKET,
                Key: document.fileKey,
            });
            const s3Response = await r2_1.r2Client.send(getObjectCommand);
            if (s3Response.Body) {
                s3Response.Body.pipe(res).on("error", () => {
                    res.status(500).json({ error: "Error downloading file" });
                });
            }
            else {
                res.status(500).json({ error: "File stream not available" });
            }
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
            // if (req.user.microsoftId) {
            //   query.microsoftId = req.user.microsoftId;
            // } else if (req.user._id) {
            //   query.userId = req.user._id.toString();
            // } else {
            //   return res.status(400).json({ error: "No user identifier found" });
            // }
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
    async uploadStatusUpdate(req, res) {
        try {
            const { jobId, status, error } = req.body;
            if (!jobId || !status) {
                return res.status(400).json({ message: "Missing jobId or status" });
            }
            // Only emit on failure
            if (status.trim().toLowerCase() === "failed") {
                console.log("Emitting upload_status:", { jobId, status, error });
                index_1.io.emit("upload_status", { jobId, status, error });
            }
            res.status(200).json({
                message: "Upload status update processed",
                jobId,
                status,
                error,
            });
        }
        catch (err) {
            res.status(500).json({
                message: "Failed to process upload status update",
                error: err instanceof Error ? err.message : err,
            });
        }
    },
    async uploadRhp(req, res) {
        try {
            const { drhpId } = req.body;
            if (!req.file)
                return res.status(400).json({ error: "No file uploaded" });
            if (!drhpId)
                return res.status(400).json({ error: "Missing DRHP ID" });
            const drhp = await Document_1.Document.findById(drhpId);
            if (!drhp)
                return res.status(404).json({ error: "DRHP not found" });
            const fileKey = req.file.key;
            // const user = (req as any).user;
            // Create RHP namespace by appending "-rhp" to the DRHP namespace
            const rhpNamespace = req.file.originalname;
            const rhpDoc = new Document_1.Document({
                id: fileKey,
                fileKey: fileKey,
                name: drhp.name,
                namespace: drhp.namespace, // Keep original namespace for reference
                rhpNamespace: rhpNamespace,
                type: "RHP",
                relatedDrhpId: drhp.id,
            });
            await rhpDoc.save();
            drhp.relatedRhpId = rhpDoc.id;
            await drhp.save();
            // Send to n8n with RHP namespace
            const n8nWebhookUrl = "https://n8n-excollo.azurewebsites.net/webhook/upload-rhp";
            // Download file from S3 and send to n8n
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: r2_1.R2_BUCKET,
                Key: fileKey,
            });
            const s3Response = await r2_1.r2Client.send(getObjectCommand);
            const form = new form_data_1.default();
            form.append("file", s3Response.Body, {
                filename: rhpDoc.name,
                contentType: "application/pdf",
            });
            form.append("documentId", rhpDoc.id);
            form.append("namespace", rhpNamespace); // Use RHP namespace for n8n
            form.append("name", drhp.name);
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
            // Emit upload status (processing)
            const jobId = rhpDoc.id;
            index_1.io.emit("upload_status", { jobId, status: "processing" });
            res
                .status(201)
                .json({ message: "RHP uploaded and linked", document: rhpDoc });
        }
        catch (error) {
            console.error("Error uploading RHP:", error);
            res.status(500).json({ error: "Failed to upload RHP" });
        }
    },
};
