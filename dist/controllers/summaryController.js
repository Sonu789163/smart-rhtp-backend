"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryController = void 0;
const Summary_1 = require("../models/Summary");
const axios_1 = __importDefault(require("axios"));
const r2_1 = require("../config/r2");
const client_s3_1 = require("@aws-sdk/client-s3");
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const index_1 = require("../index");
const puppeteer_1 = __importDefault(require("puppeteer"));
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
            const response = req.body;
            if (!response) {
                throw new Error("Data is empty");
            }
            // Delete any existing summaries for this document
            await Summary_1.Summary.deleteMany({ documentId: response.documentId });
            let pdfFileKey = null;
            if (response.metadata && response.metadata.url) {
                try {
                    const axiosResponse = await axios_1.default.get(response.metadata.url, {
                        responseType: "stream",
                    });
                    const s3Key = `${Date.now()}-${(response.title || "summary").replace(/\s+/g, "_")}.pdf`;
                    await r2_1.r2Client.send(new client_s3_1.PutObjectCommand({
                        Bucket: r2_1.R2_BUCKET,
                        Key: s3Key,
                        Body: axiosResponse.data,
                        ContentType: "application/pdf",
                    }));
                    pdfFileKey = s3Key;
                }
                catch (err) {
                    console.error("Failed to download/upload PDF to S3:", err);
                    return res
                        .status(500)
                        .json({ error: "Failed to upload PDF to Cloudflare R2" });
                }
            }
            // Add pdfFileKey to the summary document
            const summaryData = { ...response, pdfFileKey };
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
    // New endpoint: Download PDF from GridFS by summary ID
    async downloadPdf(req, res) {
        try {
            const { id } = req.params;
            const { documentId } = req.query; // Accept documentId as a query parameter for extra safety
            let summary;
            if (documentId) {
                summary = (await Summary_1.Summary.findOne({ id, documentId }).lean());
            }
            else {
                summary = (await Summary_1.Summary.findOne({ id }).lean());
            }
            if (!summary || !summary.pdfFileKey) {
                return res
                    .status(404)
                    .json({ error: "PDF not found for this summary" });
            }
            res.set("Content-Type", "application/pdf");
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: r2_1.R2_BUCKET,
                Key: summary.pdfFileKey,
            });
            const s3Response = await r2_1.r2Client.send(getObjectCommand);
            if (s3Response.Body) {
                s3Response.Body.pipe(res);
            }
            else {
                res.status(500).json({ error: "File stream not available" });
            }
        }
        catch (error) {
            console.error("Error downloading PDF from S3:", error);
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
            const summary = await Summary_1.Summary.findOneAndDelete(query).lean();
            if (summary && summary.pdfFileKey) {
                await r2_1.r2Client.send(new client_s3_1.DeleteObjectCommand({
                    Bucket: r2_1.R2_BUCKET,
                    Key: summary.pdfFileKey,
                }));
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
    async downloadHtmlPdf(req, res) {
        try {
            const { id } = req.params;
            const summary = await Summary_1.Summary.findOne({ id });
            if (!summary || !summary.content) {
                return res.status(404).json({ error: "Summary not found" });
            }
            const browser = await puppeteer_1.default.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
            const page = await browser.newPage();
            await page.setContent(summary.content, { waitUntil: "networkidle0" });
            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
            });
            await browser.close();
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${summary.title || "summary"}.pdf"`);
            res.send(pdfBuffer);
        }
        catch (error) {
            console.error("Error generating PDF from HTML:", error);
            res.status(500).json({ error: "Failed to generate PDF" });
        }
    },
};
