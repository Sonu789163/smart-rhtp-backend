"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryController = void 0;
const Summary_1 = require("../models/Summary");
const Document_1 = require("../models/Document");
const axios_1 = __importDefault(require("axios"));
const gridfs_1 = require("../config/gridfs");
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const index_1 = require("../index");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
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
            let pdfFileId = null;
            // If metadata.url exists, download and store PDF in GridFS
            if (metadata && metadata.url) {
                try {
                    const bucket = (0, gridfs_1.getGridFSBucket)();
                    const response = await axios_1.default.get(metadata.url, {
                        responseType: "stream",
                    });
                    const uploadStream = bucket.openUploadStream(`${title}.pdf`, {
                        contentType: "application/pdf",
                    });
                    await new Promise((resolve, reject) => {
                        response.data
                            .pipe(uploadStream)
                            .on("error", reject)
                            .on("finish", resolve);
                    });
                    pdfFileId = uploadStream.id;
                }
                catch (err) {
                    console.error("Failed to download/upload PDF to GridFS:", err);
                }
            }
            const summaryData = {
                id: Date.now().toString(),
                title,
                content,
                documentId,
                updatedAt: new Date(),
                metadata,
                pdfFileId,
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
    // New endpoint: Download PDF from GridFS by summary ID
    async downloadPdf(req, res) {
        try {
            const { id } = req.params;
            const summary = await Summary_1.Summary.findOne({ id });
            if (!summary || !summary.pdfFileId) {
                return res
                    .status(404)
                    .json({ error: "PDF not found for this summary" });
            }
            const bucket = (0, gridfs_1.getGridFSBucket)();
            res.set("Content-Type", "application/pdf");
            bucket.openDownloadStream(summary.pdfFileId).pipe(res);
        }
        catch (error) {
            console.error("Error downloading PDF from GridFS:", error);
            res.status(500).json({ error: "Failed to download PDF" });
        }
    },
    // Endpoint: Download DOCX generated from HTML content by summary ID
    async downloadDocx(req, res) {
        try {
            const { id } = req.params;
            const summary = await Summary_1.Summary.findOne({ id });
            if (!summary || !summary.content) {
                return res.status(404).json({ error: "Summary not found" });
            }
            // Write HTML to a temp file
            const tmpDir = os_1.default.tmpdir();
            const htmlPath = path_1.default.join(tmpDir, `summary_${id}.html`);
            const docxPath = path_1.default.join(tmpDir, `summary_${id}.docx`);
            await (0, promises_1.writeFile)(htmlPath, summary.content, "utf8");
            // Convert HTML to DOCX using Pandoc
            await execAsync(`pandoc "${htmlPath}" -o "${docxPath}"`);
            // Send DOCX file
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${summary.title || "summary"}.docx"`);
            res.sendFile(docxPath, async (err) => {
                // Clean up temp files
                await (0, promises_1.unlink)(htmlPath);
                await (0, promises_1.unlink)(docxPath);
            });
        }
        catch (error) {
            console.error("Error generating DOCX with Pandoc:", error);
            res.status(500).json({ error: "Failed to generate DOCX" });
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
    async summaryStatusUpdate(req, res) {
        try {
            const { jobId, status, error } = req.body;
            if (!jobId || !status) {
                return res.status(400).json({ message: "Missing jobId or status" });
            }
            console.log("Emitting summary_status:", { jobId, status, error });
            // Emit real-time update
            index_1.io.emit("summary_status", { jobId, status, error });
            res
                .status(200)
                .json({ message: "Status update emitted", jobId, status, error });
        }
        catch (err) {
            res.status(500).json({
                message: "Failed to emit status update",
                error: err instanceof Error ? err.message : err,
            });
        }
    },
};
