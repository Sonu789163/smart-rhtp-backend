"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryController = void 0;
const Summary_1 = require("../models/Summary");
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const html_docx_js_1 = __importDefault(require("html-docx-js"));
const index_1 = require("../index");
const events_1 = require("../lib/events");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
exports.summaryController = {
    async getAll(req, res) {
        try {
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                domain: req.userDomain, // Filter by user's domain
                workspaceId: currentWorkspace, // Filter by user's workspace
            };
            const link = req.linkAccess;
            // Admins or link access can see all summaries in domain
            if (!link && req.user && req.user.role !== "admin") {
                if (req.user.microsoftId) {
                    query.microsoftId = req.user.microsoftId;
                }
                else if (req.user._id) {
                    query.userId = req.user._id.toString();
                }
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
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                documentId,
                domain: req.userDomain, // Filter by user's domain
                workspaceId: currentWorkspace, // Filter by user's workspace
            };
            const link = req.linkAccess;
            if (!link && req.user && req.user.role !== "admin") {
                if (req.user.microsoftId) {
                    query.microsoftId = req.user.microsoftId;
                }
                else if (req.user._id) {
                    query.userId = req.user._id.toString();
                }
            }
            const summaries = await Summary_1.Summary.find(query).sort({
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
        var _a, _b, _c;
        try {
            const { title, content, documentId } = req.body;
            if (!title || !content || !documentId) {
                return res.status(400).json({
                    message: "Missing required fields",
                    required: { title, content, documentId },
                });
            }
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const summaryData = {
                id: Date.now().toString(),
                title,
                content,
                documentId,
                domain: req.userDomain, // Add domain for workspace isolation
                workspaceId: currentWorkspace, // Add workspace for team isolation
                updatedAt: new Date(),
            };
            // Add user information if available
            if (req.user) {
                if (req.user.microsoftId) {
                    summaryData.microsoftId = req.user.microsoftId;
                }
                else if (req.user._id) {
                    summaryData.userId = req.user._id.toString();
                }
            }
            const summary = new Summary_1.Summary(summaryData);
            await summary.save();
            // Publish event for workspace notification
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "summary.created",
                resourceType: "summary",
                resourceId: summary.id,
                title: `New summary created: ${summary.title}`,
                notifyWorkspace: true,
            });
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
            // Prepare full HTML (wrap if only fragment provided)
            const rawHtml = String(summary.content || "");
            const html = /<html[\s\S]*?>[\s\S]*<\/html>/i.test(rawHtml)
                ? rawHtml
                : `<!DOCTYPE html><html><head><meta charset="UTF-8" /></head><body>${rawHtml}</body></html>`;
            const safeTitle = (summary.title || "summary").replace(/[^a-z0-9\-_. ]/gi, "_");
            let docxBuffer = null;
            // Try html-to-docx first (robust in Node)
            try {
                const mod = await Promise.resolve().then(() => __importStar(require("html-to-docx")));
                const HTMLtoDOCX = mod.default || mod;
                docxBuffer = (await HTMLtoDOCX(html, undefined, {
                    title: safeTitle,
                    description: "Generated from HTML",
                }));
            }
            catch (e) {
                // Fallback to html-docx-js
                try {
                    const blobOrBuffer = html_docx_js_1.default.asBlob(html);
                    if (Buffer.isBuffer(blobOrBuffer)) {
                        docxBuffer = blobOrBuffer;
                    }
                    else if (blobOrBuffer &&
                        "arrayBuffer" in blobOrBuffer &&
                        typeof blobOrBuffer.arrayBuffer === "function") {
                        const ab = await blobOrBuffer.arrayBuffer();
                        docxBuffer = Buffer.from(ab);
                    }
                    else {
                        docxBuffer = Buffer.from(String(blobOrBuffer) || "");
                    }
                }
                catch (fallbackErr) {
                    console.error("Both html-to-docx and html-docx-js failed:", fallbackErr);
                    throw fallbackErr;
                }
            }
            // Send DOCX file
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.docx"`);
            res.end(docxBuffer);
        }
        catch (error) {
            console.error("Error generating DOCX:", error);
            res.status(500).json({ error: "Failed to generate DOCX" });
        }
    },
    async update(req, res) {
        try {
            const { id } = req.params;
            const query = {
                id,
                domain: req.userDomain, // Ensure user can only update summaries from their domain
            };
            // Admins can update all summaries in their domain, regular users see only their own
            if (req.user.role !== "admin") {
                if (req.user.microsoftId) {
                    query.microsoftId = req.user.microsoftId;
                }
                else if (req.user._id) {
                    query.userId = req.user._id.toString();
                }
                else {
                    return res.status(400).json({ error: "No user identifier found" });
                }
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
        var _a, _b, _c;
        try {
            const { id } = req.params;
            const query = {
                id,
                domain: req.userDomain, // Ensure user can only delete summaries from their domain
            };
            // Admins can delete all summaries in their domain, regular users see only their own
            if (req.user.role !== "admin") {
                if (req.user.microsoftId) {
                    query.microsoftId = req.user.microsoftId;
                }
                else if (req.user._id) {
                    query.userId = req.user._id.toString();
                }
                else {
                    return res.status(400).json({ error: "No user identifier found" });
                }
            }
            const summary = await Summary_1.Summary.findOneAndDelete(query).lean();
            if (summary) {
                await (0, events_1.publishEvent)({
                    actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                    domain: req.userDomain,
                    action: "summary.deleted",
                    resourceType: "summary",
                    resourceId: summary.id,
                    title: `Summary deleted: ${summary.title || summary.id}`,
                    notifyWorkspace: true,
                });
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
