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
const Document_1 = require("../models/Document");
const Domain_1 = require("../models/Domain");
const User_1 = require("../models/User");
const axios_1 = __importDefault(require("axios"));
const promises_1 = require("fs/promises");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
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
            // All workspace members can see all summaries in their workspace
            // No user-based filtering needed - workspace isolation is sufficient
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
        var _a, _b, _c, _d;
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
            // Resolve domainId - can come from request body, user, or document
            let domainId = req.body.domainId;
            let domain = req.body.domain || req.userDomain;
            // If domainId not in request body, try to get it
            if (!domainId) {
                // Try from domain name if we have it
                if (domain) {
                    try {
                        const domainRecord = await Domain_1.Domain.findOne({ domainName: domain, status: "active" });
                        if (domainRecord) {
                            domainId = domainRecord.domainId;
                        }
                    }
                    catch (error) {
                        console.error("Error fetching domainId from Domain:", error);
                    }
                }
                // Fallback: get from document
                if (!domainId && documentId) {
                    try {
                        const doc = await Document_1.Document.findOne({ id: documentId });
                        if (doc && doc.domainId) {
                            domainId = doc.domainId;
                            if (!domain)
                                domain = doc.domain;
                        }
                    }
                    catch (error) {
                        console.error("Error fetching domainId from document:", error);
                    }
                }
                // Fallback: get from user if available
                if (!domainId && ((_a = req.user) === null || _a === void 0 ? void 0 : _a._id)) {
                    try {
                        const user = await User_1.User.findById(req.user._id).select("domainId domain");
                        if (user && user.domainId) {
                            domainId = user.domainId;
                            if (!domain)
                                domain = user.domain;
                        }
                    }
                    catch (error) {
                        console.error("Error fetching domainId from user:", error);
                    }
                }
            }
            // If still no domainId, we cannot proceed
            if (!domainId || !domain) {
                return res.status(400).json({
                    error: "domainId and domain are required",
                    message: "Unable to determine domainId. Please ensure domainId is provided in request body or linked to the document.",
                });
            }
            const summaryData = {
                id: Date.now().toString(),
                title,
                content,
                documentId,
                domain: domain, // Add domain for workspace isolation
                domainId: domainId, // Link to Domain schema - REQUIRED
                workspaceId: currentWorkspace, // Add workspace for team isolation
                updatedAt: new Date(),
            };
            // // Add user information if available
            // if (req.user) {
            //   if (req.user.microsoftId) {
            //     summaryData.microsoftId = req.user.microsoftId;
            //   } else if (req.user._id) {
            //     summaryData.userId = req.user._id.toString();
            //   }
            // }
            const summary = new Summary_1.Summary(summaryData);
            await summary.save();
            // Publish event for workspace notification
            await (0, events_1.publishEvent)({
                actorUserId: (_d = (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString) === null || _d === void 0 ? void 0 : _d.call(_c),
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
            const query = {
                id,
                domain: req.userDomain, // Ensure user can only update summaries from their domain
            };
            // All workspace members can update summaries in their workspace
            // No user-based filtering needed - workspace isolation is sufficient
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
            // All workspace members can delete summaries in their workspace
            // No user-based filtering needed - workspace isolation is sufficient
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
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const { id } = req.params;
            const summary = await Summary_1.Summary.findOne({ id });
            if (!summary || !summary.content) {
                return res.status(404).json({ error: "Summary not found" });
            }
            // Call PDF.co API to generate PDF from HTML
            try {
                const pdfcoResponse = await axios_1.default.post("https://api.pdf.co/v1/pdf/convert/from/html", {
                    html: summary.content,
                    name: `${summary.title || "summary"}.pdf`,
                    allowAbsoluteUrls: true,
                }, {
                    headers: {
                        "x-api-key": process.env.PDFCO_API_KEY,
                        "Content-Type": "application/json",
                    },
                });
                if (!pdfcoResponse.data || !pdfcoResponse.data.url) {
                    // Check if PDF.co returned an error in the response
                    if (((_a = pdfcoResponse.data) === null || _a === void 0 ? void 0 : _a.error) || ((_b = pdfcoResponse.data) === null || _b === void 0 ? void 0 : _b.status) === 402) {
                        const errorMsg = ((_c = pdfcoResponse.data) === null || _c === void 0 ? void 0 : _c.message) || "PDF.co API error: Insufficient credits or service unavailable";
                        console.error("PDF.co API error:", pdfcoResponse.data);
                        return res.status(503).json({
                            error: "PDF generation service temporarily unavailable",
                            message: errorMsg,
                            details: "The PDF generation service is currently unavailable. Please try again later or contact support."
                        });
                    }
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
            catch (pdfcoError) {
                // Handle PDF.co specific errors
                if (((_d = pdfcoError.response) === null || _d === void 0 ? void 0 : _d.status) === 402) {
                    const errorData = ((_e = pdfcoError.response) === null || _e === void 0 ? void 0 : _e.data) || {};
                    console.error("PDF.co API error (402):", errorData);
                    return res.status(503).json({
                        error: "PDF generation service unavailable",
                        message: errorData.message || "Insufficient credits for PDF generation",
                        details: "The PDF generation service requires additional credits. Please contact support or try again later."
                    });
                }
                if ((_f = pdfcoError.response) === null || _f === void 0 ? void 0 : _f.status) {
                    const errorData = ((_g = pdfcoError.response) === null || _g === void 0 ? void 0 : _g.data) || {};
                    console.error(`PDF.co API error (${pdfcoError.response.status}):`, errorData);
                    return res.status(503).json({
                        error: "PDF generation service error",
                        message: errorData.message || "PDF generation failed",
                        details: "The PDF generation service encountered an error. Please try again later."
                    });
                }
                throw pdfcoError; // Re-throw if it's not a PDF.co response error
            }
        }
        catch (error) {
            console.error("Error generating PDF with PDF.co:", error);
            // Check if response was already sent
            if (res.headersSent) {
                return;
            }
            // Return proper error response
            res.status(500).json({
                error: "Failed to generate PDF",
                message: error.message || "An unexpected error occurred",
                details: "Please try again later or contact support if the problem persists."
            });
        }
    },
    // Admin: Get all summaries across all workspaces in domain
    async getAllAdmin(req, res) {
        var _a, _b;
        try {
            const user = req.user;
            if (!user || user.role !== "admin") {
                return res.status(403).json({ error: "Admin access required" });
            }
            const query = {
                domain: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain, // Use user's actual domain for admin
            };
            const summaries = await Summary_1.Summary.find(query).sort({ updatedAt: -1 });
            // Get all workspaces to map workspaceId to workspace name
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            const workspaces = await Workspace.find({
                domain: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.domain) || req.userDomain,
            });
            const workspaceMap = new Map(workspaces.map((ws) => [
                ws.workspaceId,
                { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug },
            ]));
            // Add workspace information to each summary
            const summariesWithWorkspace = summaries.map((summary) => {
                var _a, _b;
                return ({
                    ...summary.toObject(),
                    workspaceId: workspaceMap.get(summary.workspaceId) || {
                        workspaceId: summary.workspaceId,
                        name: ((_a = workspaceMap.get(summary.workspaceId)) === null || _a === void 0 ? void 0 : _a.name)
                            ? (_b = workspaceMap.get(summary.workspaceId)) === null || _b === void 0 ? void 0 : _b.name
                            : "Excollo",
                        slug: "unknown",
                    },
                });
            });
            res.json(summariesWithWorkspace);
        }
        catch (error) {
            console.error("Error fetching admin summaries:", error);
            res.status(500).json({ error: "Failed to fetch summaries" });
        }
    },
};
