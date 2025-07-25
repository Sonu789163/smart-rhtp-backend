"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryController = void 0;
const Summary_1 = require("../models/Summary");
const axios_1 = __importDefault(require("axios"));
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
            const { title, content, documentId } = req.body;
            if (!title || !content || !documentId) {
                return res.status(400).json({
                    message: "Missing required fields",
                    required: { title, content, documentId },
                });
            }
            const user = req.user;
            const summaryData = {
                id: Date.now().toString(),
                title,
                content,
                documentId,
                updatedAt: new Date(),
            };
            if (user.microsoftId) {
                summaryData.microsoftId = user.microsoftId;
            }
            else if (user._id) {
                summaryData.userId = user._id.toString();
            }
            const summary = new Summary_1.Summary(summaryData);
            await summary.save();
            res.status(201).json(summary);
        }
        catch (error) {
            console.error("Error creating summary:", error);
            res.status(500).json({
                error: "Failed to create summary",
                details: error,
            });
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
            const summary = await Summary_1.Summary.findOneAndDelete(query).lean();
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
    async downloadHtmlPdf(req, res) {
        try {
            const { id } = req.params;
            const summary = await Summary_1.Summary.findOne({ id });
            if (!summary || !summary.content) {
                return res.status(404).json({ error: "Summary not found" });
            }
            // Call PDF.co API to generate PDF from HTML
            const pdfcoResponse = await axios_1.default.post("https://api.pdf.co/v1/pdf/convert/from/html", {
                html: summary.content,
                name: `${summary.title || "summary"}.pdf`,
            }, {
                headers: {
                    "x-api-key": process.env.PDFCO_API_KEY,
                    "Content-Type": "application/json",
                },
            });
            if (!pdfcoResponse.data || !pdfcoResponse.data.url) {
                throw new Error("PDF.co did not return a PDF URL");
            }
            // Download the generated PDF and stream to client
            const pdfStream = await axios_1.default.get(pdfcoResponse.data.url, {
                responseType: "stream",
            });
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename=\"${summary.title || "summary"}.pdf\"`);
            pdfStream.data.pipe(res);
        }
        catch (error) {
            console.error("Error generating PDF with PDF.co:", error);
            res.status(500).json({ error: "Failed to generate PDF" });
        }
    },
};
