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
    async triggerSummary(req, res) {
        var _a, _b, _c;
        try {
            const { documentId, namespace, docType, metadata } = req.body;
            if (!namespace || !docType) {
                return res.status(400).json({ error: "Missing required fields (namespace, docType)" });
            }
            const pythonApiUrl = process.env.PYTHON_API_URL || "http://localhost:8000";
            const domain = req.userDomain || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain);
            // Get domainId
            let domainId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.domainId;
            if (!domainId && ((_c = req.user) === null || _c === void 0 ? void 0 : _c._id)) {
                const user = await User_1.User.findById(req.user._id).select("domainId").lean();
                domainId = user === null || user === void 0 ? void 0 : user.domainId;
            }
            console.log(`Triggering Python Summary for: ${namespace} (${docType})`);
            const payload = {
                namespace,
                doc_type: docType.toLowerCase(),
                metadata: {
                    ...metadata,
                    documentId,
                    domain,
                    domainId,
                    workspaceId: req.currentWorkspace || domain,
                    authorization: req.headers.authorization
                }
            };
            const pythonResponse = await axios_1.default.post(`${pythonApiUrl}/jobs/summary`, payload, {
                timeout: 30000
            });
            if (pythonResponse.data && pythonResponse.data.status === "accepted") {
                return res.json({
                    status: "processing",
                    job_id: pythonResponse.data.job_id,
                    message: "Summary generation job started"
                });
            }
            res.status(500).json({ error: "Failed to start summary job", details: pythonResponse.data });
        }
        catch (error) {
            console.error("Error in triggerSummary:", error.message);
            res.status(500).json({ error: "Summary trigger failed", message: error.message });
        }
    },
    async getAll(req, res) {
        var _a, _b, _c, _d;
        try {
            const link = req.linkAccess;
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const domain = req.userDomain || (link === null || link === void 0 ? void 0 : link.domain);
            const query = {
                domain: domain, // Use link domain if available, otherwise user domain
                workspaceId: currentWorkspace,
            };
            // Handle link access
            if (link) {
                if (link.resourceType === "document") {
                    // If link is for a specific document, only show summaries for that document
                    query.documentId = link.resourceId;
                }
                else if (link.resourceType === "directory") {
                    // If link is for a directory, show summaries for all documents in that directory
                    const { Document } = await Promise.resolve().then(() => __importStar(require("../models/Document")));
                    const documents = await Document.find({
                        directoryId: link.resourceId,
                        domain: link.domain,
                    });
                    const documentIds = documents.map(doc => doc.id);
                    if (documentIds.length > 0) {
                        query.documentId = { $in: documentIds };
                    }
                    else {
                        // No documents in directory, return empty array
                        return res.json([]);
                    }
                }
                // For link access, don't filter by userId
            }
            else {
                // Check for shared directories via SharePermission
                const { SharePermission } = await Promise.resolve().then(() => __importStar(require("../models/SharePermission")));
                const { Document } = await Promise.resolve().then(() => __importStar(require("../models/Document")));
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                const userId = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString();
                const userEmail = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.email) === null || _d === void 0 ? void 0 : _d.toLowerCase();
                const sharedDirectoryIds = [];
                // Find all directories shared with this user
                if (userId) {
                    const userShares = await SharePermission.find({
                        resourceType: "directory",
                        scope: "user",
                        principalId: userId,
                    });
                    sharedDirectoryIds.push(...userShares.map(s => s.resourceId));
                }
                if (userEmail) {
                    const emailShares = await SharePermission.find({
                        resourceType: "directory",
                        scope: "user",
                        invitedEmail: userEmail,
                    });
                    sharedDirectoryIds.push(...emailShares.map(s => s.resourceId));
                }
                // Also check workspace-scoped shares
                if (currentWorkspace) {
                    const workspaceShares = await SharePermission.find({
                        resourceType: "directory",
                        scope: "workspace",
                        principalId: currentWorkspace,
                    });
                    sharedDirectoryIds.push(...workspaceShares.map(s => s.resourceId));
                }
                // Get all documents from shared directories
                if (sharedDirectoryIds.length > 0) {
                    const uniqueDirIds = [...new Set(sharedDirectoryIds)];
                    // Get documents from all shared directories (across domains/workspaces)
                    const sharedDocs = await Document.find({
                        directoryId: { $in: uniqueDirIds },
                    });
                    const sharedDocumentIds = sharedDocs.map(doc => doc.id);
                    // Also check for shared directories created via Directory.isShared
                    const sharedDirs = await Directory.find({
                        isShared: true,
                        sharedWithUserId: userId,
                        workspaceId: currentWorkspace,
                    });
                    for (const sharedDir of sharedDirs) {
                        if (sharedDir.sharedFromDirectoryId) {
                            const originalDir = await Directory.findOne({
                                id: sharedDir.sharedFromDirectoryId,
                                domain: sharedDir.sharedFromDomain,
                                workspaceId: sharedDir.sharedFromWorkspaceId,
                            });
                            if (originalDir) {
                                const originalDocs = await Document.find({
                                    directoryId: originalDir.id,
                                    domain: originalDir.domain,
                                    workspaceId: originalDir.workspaceId,
                                });
                                sharedDocumentIds.push(...originalDocs.map(doc => doc.id));
                            }
                        }
                    }
                    // Combine with user's own summaries or all summaries for admins
                    if (req.user && req.user.role !== "admin") {
                        // Regular users: show their own summaries + summaries for shared documents
                        if (sharedDocumentIds.length > 0) {
                            // Remove domain/workspaceId from base query since we're using $or
                            delete query.domain;
                            delete query.workspaceId;
                            query.$or = [
                                {
                                    userId: req.user._id.toString(),
                                    domain: domain,
                                    workspaceId: currentWorkspace,
                                },
                                { documentId: { $in: sharedDocumentIds } },
                            ];
                            if (req.user.microsoftId) {
                                query.$or.push({
                                    microsoftId: req.user.microsoftId,
                                    domain: domain,
                                    workspaceId: currentWorkspace,
                                });
                            }
                        }
                        else {
                            // No shared documents, show only user's own summaries
                            if (req.user.microsoftId) {
                                query.microsoftId = req.user.microsoftId;
                            }
                            else if (req.user._id) {
                                query.userId = req.user._id.toString();
                            }
                        }
                    }
                    else {
                        // Admins: show all summaries in domain + summaries for shared documents
                        if (sharedDocumentIds.length > 0) {
                            // Remove domain/workspaceId from base query since we're using $or
                            delete query.domain;
                            delete query.workspaceId;
                            query.$or = [
                                { domain: domain, workspaceId: currentWorkspace },
                                { documentId: { $in: sharedDocumentIds } },
                            ];
                        }
                        // Otherwise, query already has domain and workspaceId, so it will show all
                    }
                }
                else if (req.user && req.user.role !== "admin") {
                    // No shared directories, show only user's own summaries
                    if (req.user.microsoftId) {
                        query.microsoftId = req.user.microsoftId;
                    }
                    else if (req.user._id) {
                        query.userId = req.user._id.toString();
                    }
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
            const link = req.linkAccess;
            const query = {
                documentId,
                domain: req.userDomain, // Filter by user's domain (or link domain if link access)
                workspaceId: currentWorkspace, // Filter by user's workspace
            };
            // Handle link access - verify documentId matches link's resourceId
            if (link && link.resourceType === "document") {
                if (link.resourceId !== documentId) {
                    return res.status(403).json({ error: "Access denied to this document" });
                }
                // Link access allows viewing summaries for the linked document
                // Use link's domain (already set by domainAuthMiddleware)
            }
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
        var _a;
        try {
            const { title, content, documentId, domainId: bodyDomainId, domain: bodyDomain } = req.body;
            if (!title || !content || !documentId) {
                return res.status(400).json({
                    message: "Missing required fields",
                    required: { title, content, documentId },
                });
            }
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const actualDomain = req.userDomain || bodyDomain;
            // Get domainId - priority: 1) from request body (n8n), 2) from user, 3) from domain name lookup
            let domainId = bodyDomainId;
            if (!domainId) {
                // Try to get from user if available
                const user = req.user;
                if (user === null || user === void 0 ? void 0 : user._id) {
                    const userWithDomain = await User_1.User.findById(user._id).select("domainId").lean();
                    domainId = (userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId) || (userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId);
                }
            }
            // If domainId still not found, try to get it from the domain name
            if (!domainId && actualDomain) {
                try {
                    const { Domain } = await Promise.resolve().then(() => __importStar(require("../models/Domain")));
                    const domainRecord = await Domain.findOne({ domainName: actualDomain, status: "active" });
                    if (domainRecord) {
                        domainId = domainRecord.domainId;
                    }
                }
                catch (error) {
                    console.error("Error fetching domainId from Domain model:", error);
                }
            }
            if (!domainId) {
                return res.status(400).json({
                    error: "domainId is required. Unable to determine domainId from request body, user, or domain.",
                    message: "Please ensure domainId is included in the request body or contact administrator."
                });
            }
            const summaryData = {
                id: Date.now().toString(),
                title,
                content,
                documentId,
                domain: actualDomain, // Add domain for workspace isolation - backward compatibility
                domainId: domainId, // Link to Domain schema (required)
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
            // Update directory's updatedAt when summary is created
            if (documentId) {
                const { Document } = await Promise.resolve().then(() => __importStar(require("../models/Document")));
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                const doc = await Document.findOne({ id: documentId, workspaceId: currentWorkspace });
                if (doc === null || doc === void 0 ? void 0 : doc.directoryId) {
                    const now = new Date();
                    await Directory.updateOne({ id: doc.directoryId, workspaceId: currentWorkspace }, {
                        $set: {
                            updatedAt: now,
                        },
                    });
                }
            }
            // Publish event for workspace notification (only if user context available)
            if (((_a = req.user) === null || _a === void 0 ? void 0 : _a._id) && req.userDomain) {
                await (0, events_1.publishEvent)({
                    actorUserId: req.user._id.toString(),
                    domain: req.userDomain,
                    action: "summary.created",
                    resourceType: "summary",
                    resourceId: summary.id,
                    title: `New summary created: ${summary.title}`,
                    notifyWorkspace: true,
                });
            }
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
            // LOG START
            try {
                await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `Starting downloadDocx for ID: ${id}\n`, { flag: "a" });
            }
            catch (_a) { }
            const summary = await Summary_1.Summary.findOne({
                $or: [
                    { id: id },
                    { id: Number(id) }
                ]
            });
            if (!summary || !summary.content) {
                try {
                    await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `Summary not found or empty content for ID: ${id} (Tried Number: ${Number(id)})\n`, { flag: "a" });
                }
                catch (_b) { }
                return res.status(404).json({ error: "Summary not found" });
            }
            // Log success found
            try {
                await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `Found summary: ${summary.id} (Type: ${typeof summary.id})\n`, { flag: "a" });
            }
            catch (_c) { }
            const tmpDir = os_1.default.tmpdir();
            const docxPath = path_1.default.join(tmpDir, `summary_${id}.docx`);
            // Clean content: Replace literal \n with real newlines, remove \r, \t, etc.
            // This matches the frontend 'cleanSummaryContent' logic
            const cleanContent = (summary.content || "")
                .replace(/\\n/g, "\n")
                .replace(/\\r/g, "")
                .replace(/\\t/g, "\t")
                .replace(/\\"/g, '"');
            // Detect format (default to HTML for backward compatibility)
            let format = summary.format || "html";
            // If format is "html" (legacy default) but content looks like markdown, switch to markdown
            if (format === "html" && (cleanContent.includes("**") || cleanContent.includes("##") || cleanContent.includes("---"))) {
                format = "markdown";
            }
            let inputPath;
            let pandocCommand;
            if (format === "markdown") {
                inputPath = path_1.default.join(tmpDir, `summary_${id}.md`);
                await (0, promises_1.writeFile)(inputPath, cleanContent, "utf8");
                pandocCommand = `pandoc "${inputPath}" -f markdown -t docx -o "${docxPath}"`;
            }
            else {
                inputPath = path_1.default.join(tmpDir, `summary_${id}.html`);
                await (0, promises_1.writeFile)(inputPath, cleanContent, "utf8");
                pandocCommand = `pandoc "${inputPath}" -f html -t docx -o "${docxPath}"`;
            }
            // Log paths
            try {
                await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `Paths: Input=${inputPath}, Output=${docxPath}, Cmd=${pandocCommand}\n`, { flag: "a" });
            }
            catch (_d) { }
            // Convert to DOCX using Pandoc
            const { stdout, stderr } = await execAsync(pandocCommand);
            // Log success
            try {
                await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `Pandoc Success. Stdout: ${stdout}, Stderr: ${stderr}\n`, { flag: "a" });
            }
            catch (_e) { }
            // Send DOCX file
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            res.setHeader("Content-Disposition", `attachment; filename="${(summary.title || "summary").replace(/[^a-z0-9]/gi, "_")}.docx"`);
            res.sendFile(docxPath, async (err) => {
                // Clean up temp files
                if (err) {
                    console.error("Error sending file:", err);
                    try {
                        await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `Error sending file: ${err.message}\n`, { flag: "a" });
                    }
                    catch (_a) { }
                }
                else {
                    try {
                        await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `File sent successfully.\n`, { flag: "a" });
                    }
                    catch (_b) { }
                }
                try {
                    await (0, promises_1.unlink)(inputPath);
                    await (0, promises_1.unlink)(docxPath);
                }
                catch (cleanupError) {
                    console.error("Error cleaning up temp files:", cleanupError);
                }
            });
        }
        catch (error) {
            console.error("Error generating DOCX with Pandoc:", error);
            // Debug logging
            try {
                await (0, promises_1.writeFile)(path_1.default.join(process.cwd(), "debug_error.log"), `Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\nStack: ${error.stack}\n`, { flag: "a" });
            }
            catch (e) {
                console.error("Could not write debug log", e);
            }
            res.status(500).json({ error: "Failed to generate DOCX", details: error.message });
        }
    },
    async update(req, res) {
        try {
            const { id } = req.params;
            const query = {
                $or: [
                    { id: id },
                    { id: Number(id) }
                ],
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
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                $or: [
                    { id: id },
                    { id: Number(id) }
                ],
            };
            // Let workspace members delete summaries in the workspace
            if (currentWorkspace) {
                query.workspaceId = currentWorkspace;
            }
            else {
                query.domain = req.userDomain;
            }
            // All workspace members can delete summaries in their workspace
            // No user-based filtering needed - workspace isolation is sufficient
            const summary = await Summary_1.Summary.findOneAndDelete(query).lean();
            if (!summary) {
                return res.status(404).json({ message: "Summary not found or access denied" });
            }
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "summary.deleted",
                resourceType: "summary",
                resourceId: summary.id,
                title: `Summary deleted: ${summary.title || summary.id}`,
                notifyWorkspace: true,
            });
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
            console.log("Summary status update received from n8n:", { jobId, status, error });
            if (!jobId || !status) {
                console.error("Missing jobId or status in summary status update:", { jobId, status });
                return res.status(400).json({ message: "Missing jobId or status" });
            }
            // Emit real-time update to all connected clients
            const eventData = { jobId, status, error };
            console.log("Emitting summary_status event:", eventData);
            index_1.io.emit("summary_status", eventData);
            // Log if there's an error
            if (error) {
                console.error("Summary generation error from n8n:", { jobId, status, error });
            }
            res
                .status(200)
                .json({ message: "Status update emitted", jobId, status, error });
        }
        catch (err) {
            console.error("Error in summaryStatusUpdate:", err);
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
            const summary = await Summary_1.Summary.findOne({
                $or: [
                    { id: id },
                    { id: Number(id) }
                ]
            });
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
