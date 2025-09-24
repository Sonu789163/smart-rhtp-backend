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
exports.documentController = void 0;
const Document_1 = require("../models/Document");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const index_1 = require("../index");
const r2_1 = require("../config/r2");
const events_1 = require("../lib/events");
const client_s3_1 = require("@aws-sdk/client-s3");
const Summary_1 = require("../models/Summary");
const Report_1 = require("../models/Report");
const Chat_1 = require("../models/Chat");
exports.documentController = {
    // Helper to normalize namespace consistently (trim, preserve .pdf extension)
    // Keep case as-is; rely on Mongo collation for case-insensitive uniqueness
    normalizeNamespace(raw) {
        if (!raw)
            return "";
        let s = String(raw).trim();
        // Keep .pdf extension - don't remove it
        // Standardize separators to spaces
        s = s.replace(/[\-_]+/g, " ");
        // Collapse multiple spaces
        s = s.replace(/\s+/g, " ");
        // Trim again
        s = s.trim();
        return s;
    },
    async getAll(req, res) {
        var _a, _b;
        try {
            const { type, directoryId, includeDeleted } = (req.query || {});
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                domain: req.userDomain, // Still filter by domain for security
                workspaceId: currentWorkspace, // Filter by workspace for isolation
            };
            // If a type filter is provided, use it
            if (type === "DRHP" || type === "RHP") {
                query.type = type;
            }
            // Enforce time-bucket permissions based on user's accessibleWorkspaces
            const user = req.user;
            const wsEntry = Array.isArray(user === null || user === void 0 ? void 0 : user.accessibleWorkspaces)
                ? user.accessibleWorkspaces.find((w) => w.workspaceDomain === req.userDomain && w.isActive)
                : undefined;
            // Default to all if no entry found (backward compatibility)
            let allowedBuckets = (wsEntry === null || wsEntry === void 0 ? void 0 : wsEntry.allowedTimeBuckets) || ["all"];
            // Always allow admins full access
            if ((user === null || user === void 0 ? void 0 : user.role) === "admin") {
                allowedBuckets = ["all"];
            }
            // If this is the user's primary domain, allow all
            if (((user === null || user === void 0 ? void 0 : user.domain) || "").toLowerCase() ===
                (req.userDomain || "").toLowerCase()) {
                allowedBuckets = ["all"];
            }
            // Build date range conditions
            if (!allowedBuckets.includes("all")) {
                const now = new Date();
                // Use the most restrictive time bucket (shortest time range)
                // Priority: today > last7 > last15 > last30 > last90
                let selectedBucket = null;
                if (allowedBuckets.includes("today")) {
                    selectedBucket = "today";
                }
                else if (allowedBuckets.includes("last7")) {
                    selectedBucket = "last7";
                }
                else if (allowedBuckets.includes("last15")) {
                    selectedBucket = "last15";
                }
                else if (allowedBuckets.includes("last30")) {
                    selectedBucket = "last30";
                }
                else if (allowedBuckets.includes("last90")) {
                    selectedBucket = "last90";
                }
                if (selectedBucket) {
                    let start;
                    if (selectedBucket === "today") {
                        start = new Date();
                        start.setUTCHours(0, 0, 0, 0);
                        query.uploadedAt = { $gte: start, $lte: now };
                    }
                    else if (selectedBucket === "last7") {
                        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        query.uploadedAt = { $gte: start, $lte: now };
                    }
                    else if (selectedBucket === "last15") {
                        start = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
                        query.uploadedAt = { $gte: start, $lte: now };
                    }
                    else if (selectedBucket === "last30") {
                        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        query.uploadedAt = { $gte: start, $lte: now };
                    }
                    else if (selectedBucket === "last90") {
                        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                        query.uploadedAt = { $gte: start, $lte: now };
                    }
                }
            }
            // Apply explicit overrides if present
            if ((_a = wsEntry === null || wsEntry === void 0 ? void 0 : wsEntry.extraDocumentIds) === null || _a === void 0 ? void 0 : _a.length) {
                // If there are extra documents, we need to include them regardless of time filtering
                const extraDocsQuery = { id: { $in: wsEntry.extraDocumentIds } };
                if (query.uploadedAt) {
                    // If we have time filtering, use $or to include both time-filtered docs and extra docs
                    query.$or = [{ uploadedAt: query.uploadedAt }, extraDocsQuery];
                    delete query.uploadedAt; // Remove the direct time filter since we're using $or
                }
                else {
                    // No time filtering, just add extra docs
                    query.$or = query.$or || [];
                    query.$or.push(extraDocsQuery);
                }
            }
            if ((_b = wsEntry === null || wsEntry === void 0 ? void 0 : wsEntry.blockedDocumentIds) === null || _b === void 0 ? void 0 : _b.length) {
                query.id = { $nin: wsEntry.blockedDocumentIds };
            }
            if (directoryId === "root") {
                query.directoryId = null;
            }
            else if (typeof directoryId === "string") {
                query.directoryId = directoryId;
            }
            // no trash filter; return all in directory
            const documents = await Document_1.Document.find(query).sort({ uploadedAt: -1 });
            res.json(documents);
        }
        catch (error) {
            res.status(500).json({ error: "Failed to fetch documents" });
        }
    },
    async getById(req, res) {
        try {
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                id: req.params.id,
                domain: req.userDomain, // Ensure user can only access documents from their domain
                workspaceId: currentWorkspace, // Ensure user can only access documents from their workspace
            };
            // Check for link access
            const linkAccess = req.linkAccess;
            if (linkAccess &&
                linkAccess.resourceType === "document" &&
                linkAccess.resourceId === req.params.id) {
                // Allow access via link token
                query.domain = linkAccess.domain;
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
        var _a, _b, _c;
        try {
            const docData = { ...req.body };
            // Ensure namespace is always set and preserve original name with .pdf extension
            if (!docData.namespace) {
                docData.namespace = docData.name;
            }
            // Keep original namespace as-is to preserve .pdf extension
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            // Add domain and workspace to document data
            docData.domain = req.userDomain;
            docData.workspaceId = currentWorkspace;
            // Check duplicate by namespace within workspace
            const existing = await Document_1.Document.findOne({
                workspaceId: currentWorkspace,
                namespace: docData.namespace,
            }).collation({ locale: "en", strength: 2 });
            if (existing) {
                return res.status(409).json({
                    error: "Document with this namespace already exists",
                    existingDocument: existing,
                });
            }
            const document = new Document_1.Document(docData);
            await document.save();
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "document.uploaded",
                resourceType: "document",
                resourceId: document.id,
                title: `Document uploaded: ${document.name}`,
                notifyWorkspace: true,
            });
            res.status(201).json(document);
        }
        catch (error) {
            console.error("Error creating document:", error);
            res.status(500).json({ error: "Failed to create document" });
        }
    },
    async update(req, res) {
        var _a;
        try {
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                id: req.params.id,
                domain: req.userDomain, // Ensure user can only update documents from their domain
                workspaceId: currentWorkspace, // Ensure user can only update documents from their workspace
            };
            const update = { ...req.body };
            if (typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.directoryId) !== "undefined") {
                update.directoryId =
                    req.body.directoryId === "root" ? null : req.body.directoryId;
            }
            const document = await Document_1.Document.findOneAndUpdate(query, update, {
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
    // restore disabled while trash functionality is off
    async delete(req, res) {
        var _a, _b, _c;
        try {
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                id: req.params.id,
                domain: req.userDomain, // Ensure user can only delete documents from their domain
                workspaceId: currentWorkspace, // Ensure user can only delete documents from their workspace
            };
            const document = await Document_1.Document.findOne(query);
            if (!document) {
                return res.status(404).json({ error: "Document not found" });
            }
            // HARD DELETE: remove file(s) from R2 and Mongo based on type
            if (document.fileKey) {
                try {
                    const deleteCommand = new client_s3_1.DeleteObjectCommand({
                        Bucket: r2_1.R2_BUCKET,
                        Key: document.fileKey,
                    });
                    await r2_1.r2Client.send(deleteCommand);
                }
                catch (err) {
                    console.error("Failed to delete file from R2:", err);
                }
            }
            // Build list of document ids to cascade delete against (this doc + paired doc if any)
            const docIdsToDelete = [document.id];
            // If deleting a DRHP, also delete its related RHP document and its file
            if (document.type === "DRHP" && document.relatedRhpId) {
                const rhpDoc = await Document_1.Document.findOne({ id: document.relatedRhpId, domain: req.userDomain, workspaceId: currentWorkspace });
                if (rhpDoc) {
                    if (rhpDoc.fileKey) {
                        try {
                            const deleteRhpCommand = new client_s3_1.DeleteObjectCommand({
                                Bucket: r2_1.R2_BUCKET,
                                Key: rhpDoc.fileKey,
                            });
                            await r2_1.r2Client.send(deleteRhpCommand);
                        }
                        catch (err) {
                            console.error("Failed to delete RHP file from R2:", err);
                        }
                    }
                    docIdsToDelete.push(rhpDoc.id);
                }
            }
            // If deleting an RHP, unlink from DRHP (and include for report deletion scope)
            if (document.type === "RHP") {
                const drhpDoc = await Document_1.Document.findOne({ relatedRhpId: document.id, domain: req.userDomain, workspaceId: currentWorkspace });
                if (drhpDoc) {
                    drhpDoc.relatedRhpId = undefined;
                    await drhpDoc.save();
                    // not deleting DRHP here; only unlink
                }
            }
            // Delete summaries for all affected documents
            await Summary_1.Summary.deleteMany({ domain: req.userDomain, workspaceId: currentWorkspace, documentId: { $in: docIdsToDelete } });
            // Delete chats for all affected documents
            await Chat_1.Chat.deleteMany({ domain: req.userDomain, workspaceId: currentWorkspace, documentId: { $in: docIdsToDelete } });
            // Delete reports that reference any of the affected documents as DRHP or RHP
            await Report_1.Report.deleteMany({ domain: req.userDomain, workspaceId: currentWorkspace, $or: [{ drhpId: { $in: docIdsToDelete } }, { rhpId: { $in: docIdsToDelete } }] });
            // Finally, delete the documents themselves
            await Document_1.Document.deleteMany({ id: { $in: docIdsToDelete }, domain: req.userDomain, workspaceId: currentWorkspace });
            // Publish delete event for the primary document
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "document.deleted",
                resourceType: "document",
                resourceId: document.id,
                title: `Document deleted: ${document.name}`,
                notifyWorkspace: true,
            });
            res.json({ message: "Document and related artifacts deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting document:", error);
            res.status(500).json({ error: "Failed to delete document" });
        }
    },
    async uploadDocument(req, res) {
        var _a, _b, _c;
        try {
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            const originalname = req.file.originalname;
            const fileKey = req.file.key;
            const user = req.user;
            // Use original filename for namespace to preserve .pdf extension
            const docData = {
                id: req.body.id || fileKey, // Use provided id from frontend or fallback to fileKey
                name: originalname,
                fileKey: fileKey,
                namespace: originalname || req.body.namespace, // Use original name directly to preserve .pdf
                type: "DRHP", // Set type for DRHP documents
                domain: user.domain, // Add domain for workspace isolation
                workspaceId: req.currentWorkspace || user.domain, // Add workspace for team isolation
                directoryId: req.body.directoryId === "root" ? null : req.body.directoryId || null,
            };
            // Pre-check duplicate by namespace within workspace
            const duplicate = await Document_1.Document.findOne({
                workspaceId: docData.workspaceId,
                namespace: docData.namespace,
            }).collation({ locale: "en", strength: 2 });
            if (duplicate) {
                return res.status(409).json({
                    error: "Document with this namespace already exists",
                    existingDocument: duplicate,
                });
            }
            if (user === null || user === void 0 ? void 0 : user.microsoftId) {
                docData.microsoftId = user.microsoftId;
            }
            else if (user === null || user === void 0 ? void 0 : user._id) {
                docData.userId = user._id.toString();
            }
            const document = new Document_1.Document(docData);
            await document.save();
            // Publish event for upload
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "document.uploaded",
                resourceType: "document",
                resourceId: document.id,
                title: `Document uploaded: ${document.name}`,
                notifyWorkspace: true,
            });
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
            const inline = req.query.inline === "1";
            res.set({
                "Content-Type": "application/pdf",
                "Content-Disposition": `${inline ? "inline" : "attachment"}; filename=\"${document.name}\"`,
                "Cache-Control": "private, max-age=60",
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
            // Use namespace as-is to preserve .pdf extension
            const queryNamespace = namespace;
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                namespace: queryNamespace,
                domain: req.userDomain, // Check within user's domain only
                workspaceId: currentWorkspace, // Check within user's workspace only
            };
            const existingDocument = await Document_1.Document.findOne(query).collation({
                locale: "en",
                strength: 2,
            });
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
            const user = req.user;
            // Create RHP namespace by appending "-rhp" to the DRHP namespace
            const rhpNamespace = req.file.originalname;
            const rhpDocData = {
                id: fileKey,
                fileKey: fileKey,
                name: req.file.originalname, // Use original filename with .pdf extension
                namespace: req.file.originalname, // Use original filename with .pdf extension
                rhpNamespace: rhpNamespace,
                type: "RHP",
                relatedDrhpId: drhp.id,
                domain: user.domain, // Add domain for workspace isolation
                workspaceId: req.currentWorkspace || user.domain, // Add workspace for team isolation
            };
            // Add user information if available
            if (user === null || user === void 0 ? void 0 : user.microsoftId) {
                rhpDocData.microsoftId = user.microsoftId;
            }
            else if (user === null || user === void 0 ? void 0 : user._id) {
                rhpDocData.userId = user._id.toString();
            }
            const rhpDoc = new Document_1.Document(rhpDocData);
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
    // Admin: Get all documents across all workspaces in domain
    async getAllAdmin(req, res) {
        var _a, _b;
        try {
            const user = req.user;
            console.log("Admin getAllAdmin - User:", user === null || user === void 0 ? void 0 : user.role, "Domain:", req.userDomain);
            if (!user || user.role !== "admin") {
                console.log("Admin access denied for user:", user === null || user === void 0 ? void 0 : user.role);
                return res.status(403).json({ error: "Admin access required" });
            }
            const query = {
                domain: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain, // Use user's actual domain for admin
            };
            console.log("Admin query:", query);
            const documents = await Document_1.Document.find(query).sort({ uploadedAt: -1 });
            console.log("Found documents:", documents.length);
            // Get all workspaces to map workspaceId to workspace name
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            const workspaces = await Workspace.find({ domain: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.domain) || req.userDomain });
            console.log("Found workspaces:", workspaces.length);
            const workspaceMap = new Map(workspaces.map(ws => [ws.workspaceId, { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug }]));
            // Add workspace information to each document
            const documentsWithWorkspace = documents.map(doc => {
                var _a, _b;
                return ({
                    ...doc.toObject(),
                    workspaceId: workspaceMap.get(doc.workspaceId) || { workspaceId: doc.workspaceId, name: ((_a = workspaceMap.get(doc.workspaceId)) === null || _a === void 0 ? void 0 : _a.name) ? (_b = workspaceMap.get(doc.workspaceId)) === null || _b === void 0 ? void 0 : _b.name : 'Excollo', slug: 'unknown' }
                });
            });
            console.log("Returning documents with workspace info:", documentsWithWorkspace.length);
            res.json(documentsWithWorkspace);
        }
        catch (error) {
            console.error("Error fetching admin documents:", error);
            res.status(500).json({ error: "Failed to fetch documents" });
        }
    },
};
