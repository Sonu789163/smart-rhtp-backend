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
const events_1 = require("../lib/events");
const client_s3_1 = require("@aws-sdk/client-s3");
exports.documentController = {
    // Helper to normalize namespace consistently (trim, drop trailing .pdf)
    // Keep case as-is; rely on Mongo collation for case-insensitive uniqueness
    normalizeNamespace(raw) {
        if (!raw)
            return "";
        let s = String(raw).trim();
        // Remove extension
        s = s.replace(/\.pdf$/i, "");
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
            // Ensure namespace is always set
            if (!docData.namespace) {
                docData.namespace = docData.name;
            }
            docData.namespace = exports.documentController.normalizeNamespace(docData.namespace);
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
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
            if (document.type === "DRHP") {
                // If deleting a DRHP, also delete its related RHP
                if (document.relatedRhpId) {
                    const rhpDoc = await Document_1.Document.findOne({ id: document.relatedRhpId });
                    if (rhpDoc && rhpDoc.fileKey) {
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
                        await Document_1.Document.deleteOne({ id: document.relatedRhpId });
                    }
                }
                await Document_1.Document.deleteOne({ id: document.id });
                // Publish delete event
                await (0, events_1.publishEvent)({
                    actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                    domain: req.userDomain,
                    action: "document.deleted",
                    resourceType: "document",
                    resourceId: document.id,
                    title: `Document deleted: ${document.name}`,
                    notifyWorkspace: true,
                });
                res.json({ message: "DRHP and related RHP deleted successfully" });
            }
            else if (document.type === "RHP") {
                const drhpDoc = await Document_1.Document.findOne({ relatedRhpId: document.id });
                if (drhpDoc) {
                    drhpDoc.relatedRhpId = undefined;
                    await drhpDoc.save();
                }
                await Document_1.Document.deleteOne({ id: document.id });
                await (0, events_1.publishEvent)({
                    actorUserId: (_f = (_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d._id) === null || _e === void 0 ? void 0 : _e.toString) === null || _f === void 0 ? void 0 : _f.call(_e),
                    domain: req.userDomain,
                    action: "document.deleted",
                    resourceType: "document",
                    resourceId: document.id,
                    title: `Document deleted: ${document.name}`,
                    notifyWorkspace: true,
                });
                res.json({ message: "RHP deleted successfully" });
            }
            else {
                await Document_1.Document.deleteOne({ id: document.id });
                await (0, events_1.publishEvent)({
                    actorUserId: (_j = (_h = (_g = req.user) === null || _g === void 0 ? void 0 : _g._id) === null || _h === void 0 ? void 0 : _h.toString) === null || _j === void 0 ? void 0 : _j.call(_h),
                    domain: req.userDomain,
                    action: "document.deleted",
                    resourceType: "document",
                    resourceId: document.id,
                    title: `Document deleted: ${document.name}`,
                    notifyWorkspace: true,
                });
                res.json({ message: "Document deleted successfully" });
            }
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
            // Use namespace from frontend if present, else fallback to originalname
            const docData = {
                id: req.body.id || fileKey, // Use provided id from frontend or fallback to fileKey
                name: originalname,
                fileKey: fileKey,
                namespace: exports.documentController.normalizeNamespace(req.body.namespace || originalname),
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
            const normalized = exports.documentController.normalizeNamespace(namespace);
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const query = {
                namespace: normalized,
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
                name: drhp.name,
                namespace: drhp.namespace, // Keep original namespace for reference
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
};
