"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportController = void 0;
const Report_1 = require("../models/Report");
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
exports.reportController = {
    async getAll(req, res) {
        try {
            const reports = await Report_1.Report.find({}).sort({ updatedAt: -1 });
            res.json(reports);
        }
        catch (error) {
            console.error("Error fetching reports:", error);
            res.status(500).json({ message: "Error fetching reports" });
        }
    },
    async getById(req, res) {
        try {
            const report = await Report_1.Report.findOne({ id: req.params.id });
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
            const { title, content, drhpId, rhpId, drhpNamespace, rhpNamespace } = req.body;
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
            const reportData = {
                id: Date.now().toString(),
                title,
                content,
                drhpId,
                rhpId,
                drhpNamespace,
                rhpNamespace,
                updatedAt: new Date(),
            };
            // Add user information if available
            if (req.user) {
                if (req.user.microsoftId) {
                    reportData.microsoftId = req.user.microsoftId;
                }
                else if (req.user._id) {
                    reportData.userId = req.user._id.toString();
                }
            }
            const report = new Report_1.Report(reportData);
            await report.save();
            res.status(201).json(report);
        }
        catch (error) {
            console.error("Error creating report:", error);
            res
                .status(500)
                .json({ error: "Failed to create report", details: error });
        }
    },
    async reportStatusUpdate(req, res) {
        try {
            const { jobId, status, error } = req.body;
            if (!jobId || !status) {
                return res.status(400).json({ message: "Missing jobId or status" });
            }
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
            // Call PDF.co API to generate PDF from HTML
            const pdfcoResponse = await axios_1.default.post("https://api.pdf.co/v1/pdf/convert/from/html", {
                html: report.content,
                name: `${report.title || "report"}.pdf`,
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
            res.setHeader("Content-Disposition", `attachment; filename=\"${report.title || "report"}.pdf\"`);
            pdfStream.data.pipe(res);
        }
        catch (error) {
            console.error("Error generating PDF with PDF.co:", error);
            res.status(500).json({ error: "Failed to generate PDF" });
        }
    },
};
