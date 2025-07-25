"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportController = void 0;
const Report_1 = require("../models/Report");
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const r2_1 = require("../config/r2");
const client_s3_1 = require("@aws-sdk/client-s3");
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
exports.reportController = {
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
            const reports = await Report_1.Report.find(query).sort({ updatedAt: -1 });
            res.json(reports);
        }
        catch (error) {
            console.error("Error fetching reports:", error);
            res.status(500).json({ message: "Error fetching reports" });
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
            const report = await Report_1.Report.findOne(query);
            if (!report) {
                return res.status(404).json({ error: "Report not found" });
            }
            res.json(report);
        }
        catch (error) {
            console.error("Error fetching report:", error);
            res.status(500).json({ message: "Error fetching report" });
        }
    },
    async create(req, res) {
        try {
            const { title, content, drhpId, rhpId, drhpNamespace, rhpNamespace, metadata, } = req.body;
            if (!title ||
                !content ||
                !drhpId ||
                !rhpId ||
                !drhpNamespace ||
                !rhpNamespace) {
                return res.status(400).json({
                    message: "Missing required fields",
                    required: {
                        title,
                        content,
                        drhpId,
                        rhpId,
                        drhpNamespace,
                        rhpNamespace,
                    },
                });
            }
            // 1. Find existing report for this document and user
            let userQuery = {};
            if (req.user.microsoftId) {
                userQuery.microsoftId = req.user.microsoftId;
            }
            else if (req.user._id) {
                userQuery.userId = req.user._id.toString();
            }
            const existingReport = await Report_1.Report.findOne({
                drhpId,
                rhpId,
                ...userQuery,
            });
            // 2. If found, delete previous PDF from R2 and remove MongoDB record
            if (existingReport) {
                if (existingReport.pdfFileKey) {
                    try {
                        await r2_1.r2Client.send(new client_s3_1.DeleteObjectCommand({
                            Bucket: r2_1.R2_BUCKET,
                            Key: existingReport.pdfFileKey,
                        }));
                    }
                    catch (err) {
                        console.warn("Failed to delete previous PDF from R2:", err);
                    }
                }
                await existingReport.deleteOne();
            }
            const user = req.user;
            let pdfFileKey = null;
            if (req.headers && metadata.url) {
                try {
                    // Download the PDF from the URL and upload to S3
                    const response = await axios_1.default.get(metadata.url, {
                        responseType: "stream",
                    });
                    let contentLength = undefined;
                    // Prefer contentLength from metadata if provided by n8n
                    if (metadata.contentLength &&
                        !isNaN(Number(metadata.contentLength))) {
                        contentLength = Number(metadata.contentLength);
                    }
                    else {
                        // fallback: try to get it from HEAD request
                        try {
                            const headResp = await axios_1.default.head(metadata.url);
                            contentLength = headResp.headers["content-length"]
                                ? parseInt(headResp.headers["content-length"], 10)
                                : undefined;
                        }
                        catch (e) {
                            // If HEAD fails, continue without contentLength
                        }
                    }
                    // Ensure file is stored in the 'reports/' directory
                    const s3Key = `reports/${Date.now()}-${title.replace(/\s+/g, "_")}.pdf`;
                    await r2_1.r2Client.send(new client_s3_1.PutObjectCommand({
                        Bucket: r2_1.R2_BUCKET,
                        Key: s3Key,
                        Body: response.data,
                        ContentType: "application/pdf",
                        ...(typeof contentLength === "number"
                            ? { ContentLength: contentLength }
                            : {}),
                    }));
                    pdfFileKey = s3Key;
                }
                catch (err) {
                    console.error("PDF upload failed:", err);
                    return res
                        .status(500)
                        .json({ message: "Failed to upload PDF to R2" });
                }
            }
            const reportData = {
                id: Date.now().toString(),
                title,
                content,
                drhpId,
                rhpId,
                drhpNamespace,
                rhpNamespace,
                updatedAt: new Date(),
                metadata,
                pdfFileKey,
            };
            if (user.microsoftId) {
                reportData.microsoftId = user.microsoftId;
            }
            else if (user._id) {
                reportData.userId = user._id.toString();
            }
            const report = new Report_1.Report(reportData);
            await report.save();
            res.status(201).json(report);
        }
        catch (error) {
            console.error("Error creating report:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            res.status(500).json({
                message: "Error creating report",
                error: errorMessage,
            });
        }
    },
    async reportStatusUpdate(req, res) {
        try {
            const { jobId, status, error } = req.body;
            if (!jobId || !status) {
                return res.status(400).json({ message: "Missing jobId or status" });
            }
            console.log("Emitting compare_status:", { jobId, status, error });
            // Emit real-time update
            index_1.io.emit("compare_status", { jobId, status, error });
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
    // Download PDF from GridFS by report ID
    async downloadPdf(req, res) {
        try {
            const { id } = req.params;
            const report = await Report_1.Report.findOne({ id });
            if (!report || !report.pdfFileKey) {
                return res.status(404).json({ error: "PDF not found for this report" });
            }
            res.set("Content-Type", "application/pdf");
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: r2_1.R2_BUCKET,
                Key: report.pdfFileKey,
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
    // Download DOCX generated from HTML content by report ID
    async downloadDocx(req, res) {
        try {
            const { id } = req.params;
            const report = await Report_1.Report.findOne({ id });
            if (!report || !report.content) {
                return res.status(404).json({ error: "Report not found" });
            }
            // Write HTML to a temp file
            const tmpDir = os_1.default.tmpdir();
            const htmlPath = path_1.default.join(tmpDir, `report_${id}.html`);
            const docxPath = path_1.default.join(tmpDir, `report_${id}.docx`);
            await (0, promises_1.writeFile)(htmlPath, report.content, "utf8");
            // Convert HTML to DOCX using Pandoc
            await execAsync(`pandoc "${htmlPath}" -o "${docxPath}"`);
            // Send DOCX file
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${report.title || "report"}.docx"`);
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
            const report = await Report_1.Report.findOneAndUpdate(query, req.body, {
                new: true,
            });
            if (!report) {
                return res.status(404).json({ error: "Report not found" });
            }
            res.json(report);
        }
        catch (error) {
            console.error("Error updating report:", error);
            res.status(500).json({ error: "Failed to update report" });
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
            const report = await Report_1.Report.findOne(query);
            if (!report) {
                return res.status(404).json({ error: "Report not found" });
            }
            // Delete PDF file from S3
            if (report.pdfFileKey) {
                await r2_1.r2Client.send(new client_s3_1.DeleteObjectCommand({
                    Bucket: r2_1.R2_BUCKET,
                    Key: report.pdfFileKey,
                }));
            }
            await report.deleteOne();
            res.json({ message: "Report deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting report:", error);
            res.status(500).json({ error: "Failed to delete report" });
        }
    },
    async downloadPdfFromHtml(req, res) {
        try {
            const { id } = req.params;
            const report = await Report_1.Report.findOne({ id });
            if (!report || !report.content) {
                return res.status(404).json({ error: "Report not found" });
            }
            // Launch headless browser
            const browser = await puppeteer_1.default.launch();
            const page = await browser.newPage();
            // Set HTML content
            await page.setContent(report.content, { waitUntil: "networkidle0" });
            // Generate PDF buffer
            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
            });
            await browser.close();
            // Send PDF as download
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${report.title || "report"}.pdf"`);
            res.send(pdfBuffer);
        }
        catch (error) {
            console.error("Error generating PDF from HTML:", error);
            res.status(500).json({ error: "Failed to generate PDF" });
        }
    },
};
