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
const SharePermission_1 = require("../models/SharePermission");
const Directory_1 = require("../models/Directory");
const User_1 = require("../models/User");
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const r2_1 = require("../config/r2");
const events_1 = require("../lib/events");
const client_s3_1 = require("@aws-sdk/client-s3");
const Summary_1 = require("../models/Summary");
const Report_1 = require("../models/Report");
const Chat_1 = require("../models/Chat");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
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
    // Helper to check if user has access to a directory
    async hasDirectoryAccess(req, directoryId) {
        var _a, _b, _c, _d, _e;
        try {
            const user = req.user;
            const userId = (_a = user === null || user === void 0 ? void 0 : user._id) === null || _a === void 0 ? void 0 : _a.toString();
            // Get the workspace domain - for cross-domain users, req.userDomain is set to workspace domain by middleware
            // For same-domain users, req.userDomain equals user.domain
            const workspaceDomain = req.userDomain || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.domain);
            const userDomain = user === null || user === void 0 ? void 0 : user.domain;
            const isCrossDomainUser = userDomain && userDomain !== workspaceDomain;
            const isSameDomainAdmin = (user === null || user === void 0 ? void 0 : user.role) === "admin" && userDomain === workspaceDomain;
            // Same-domain admins of the workspace domain have access to all directories
            if (isSameDomainAdmin) {
                return true;
            }
            // Root directory (null directoryId)
            // Cross-domain users should NOT have access to root directory (they need explicit directory access)
            // Same-domain users can access root directory
            if (!directoryId) {
                return !isCrossDomainUser;
            }
            // Check if user owns the directory - use workspace domain for directory lookup
            // Cross-domain users won't own directories in other domains, so skip this check
            let directory = await Directory_1.Directory.findOne({
                id: directoryId,
                domain: workspaceDomain, // Use workspace domain, not user domain
            });
            // If not found in workspace domain, also check if it's a shared directory
            if (!directory) {
                directory = await Directory_1.Directory.findOne({
                    id: directoryId,
                    workspaceId: req.currentWorkspace,
                });
            }
            if (!directory) {
                // Check if this directoryId is the original directory of a shared directory
                // that the user has access to in their current workspace
                if (req.currentWorkspace) {
                    const sharedDir = await Directory_1.Directory.findOne({
                        workspaceId: req.currentWorkspace,
                        sharedFromDirectoryId: directoryId,
                        isShared: true,
                    });
                    if (sharedDir) {
                        // User has access to a shared directory that points to this original directory
                        // Check if they have permission to access the original directory (SharePermission is on the original)
                        const userEmail = (_c = user === null || user === void 0 ? void 0 : user.email) === null || _c === void 0 ? void 0 : _c.toLowerCase();
                        // First check if user is the direct recipient of the shared directory
                        if (userId && sharedDir.sharedWithUserId === userId) {
                            return true;
                        }
                        // Get the original directory to check its domain
                        const originalDirectory = await Directory_1.Directory.findOne({
                            id: directoryId,
                        });
                        if (originalDirectory) {
                            // Check SharePermission for the original directory (not the shared directory)
                            // SharePermission is stored on the original directory in the original domain
                            const { SharePermission } = await Promise.resolve().then(() => __importStar(require("../models/SharePermission")));
                            // Check user-scoped share permission (by userId)
                            if (userId) {
                                const userShare = await SharePermission.findOne({
                                    domain: originalDirectory.domain,
                                    resourceType: "directory",
                                    resourceId: directoryId, // Original directory ID
                                    scope: "user",
                                    principalId: userId,
                                });
                                if (userShare)
                                    return true;
                            }
                            // Check user-scoped share permission (by email) - important for cross-domain sharing
                            if (userEmail) {
                                const emailShare = await SharePermission.findOne({
                                    domain: originalDirectory.domain,
                                    resourceType: "directory",
                                    resourceId: directoryId, // Original directory ID
                                    scope: "user",
                                    invitedEmail: userEmail,
                                });
                                if (emailShare)
                                    return true;
                            }
                            // Check workspace-scoped share permission
                            // Try both the current workspace and the original workspace
                            const currentWorkspaceKey = req.currentWorkspace;
                            if (currentWorkspaceKey) {
                                const wsShare = await SharePermission.findOne({
                                    domain: originalDirectory.domain,
                                    resourceType: "directory",
                                    resourceId: directoryId, // Original directory ID
                                    scope: "workspace",
                                    principalId: currentWorkspaceKey,
                                });
                                if (wsShare)
                                    return true;
                            }
                            // Also try the original workspace (in case it was shared to the original workspace)
                            if (originalDirectory.workspaceId) {
                                const originalWsShare = await SharePermission.findOne({
                                    domain: originalDirectory.domain,
                                    resourceType: "directory",
                                    resourceId: directoryId,
                                    scope: "workspace",
                                    principalId: originalDirectory.workspaceId,
                                });
                                if (originalWsShare)
                                    return true;
                            }
                        }
                    }
                }
                return false;
            }
            // If this is a shared directory, check access to the original directory
            if (directory.isShared && directory.sharedFromDirectoryId) {
                const originalDirectoryId = directory.sharedFromDirectoryId;
                const originalDirectory = await Directory_1.Directory.findOne({
                    id: originalDirectoryId,
                });
                if (originalDirectory) {
                    // Check SharePermission for the original directory
                    const userEmail = (_d = user === null || user === void 0 ? void 0 : user.email) === null || _d === void 0 ? void 0 : _d.toLowerCase();
                    if (userId) {
                        const userShare = await SharePermission_1.SharePermission.findOne({
                            domain: originalDirectory.domain,
                            resourceType: "directory",
                            resourceId: originalDirectoryId,
                            scope: "user",
                            principalId: userId,
                        });
                        if (userShare)
                            return true;
                    }
                    if (userEmail) {
                        const emailShare = await SharePermission_1.SharePermission.findOne({
                            domain: originalDirectory.domain,
                            resourceType: "directory",
                            resourceId: originalDirectoryId,
                            scope: "user",
                            invitedEmail: userEmail,
                        });
                        if (emailShare)
                            return true;
                    }
                }
            }
            // Only check ownership for same-domain users
            if (!isCrossDomainUser && directory.ownerUserId === userId)
                return true;
            // Check user-scoped share permission (this is the key for cross-domain users)
            // SharePermission uses the workspace domain (where the directory exists)
            const userEmail = (_e = user === null || user === void 0 ? void 0 : user.email) === null || _e === void 0 ? void 0 : _e.toLowerCase();
            if (userId) {
                const userShare = await SharePermission_1.SharePermission.findOne({
                    domain: workspaceDomain,
                    resourceType: "directory",
                    resourceId: directoryId,
                    scope: "user",
                    principalId: userId,
                });
                if (userShare)
                    return true;
            }
            // Also check by email for cross-domain sharing
            if (userEmail) {
                const emailShare = await SharePermission_1.SharePermission.findOne({
                    domain: workspaceDomain,
                    resourceType: "directory",
                    resourceId: directoryId,
                    scope: "user",
                    invitedEmail: userEmail,
                });
                if (emailShare)
                    return true;
            }
            // Check workspace-scoped share permission
            const workspaceKey = req.currentWorkspace || workspaceDomain;
            const wsShare = await SharePermission_1.SharePermission.findOne({
                domain: workspaceDomain,
                resourceType: "directory",
                resourceId: directoryId,
                scope: "workspace",
                principalId: workspaceKey,
            });
            return !!wsShare;
        }
        catch (error) {
            console.error("Error in hasDirectoryAccess:", error);
            // Return false on error to be safe (deny access)
            return false;
        }
    },
    async getAll(req, res) {
        var _a, _b, _c;
        try {
            const { type, directoryId, includeDeleted } = (req.query || {});
            // Handle link access
            const linkAccess = req.linkAccess;
            let effectiveDirectoryId = directoryId;
            // If link is for a directory and no directoryId is provided, use the link's directory
            if (linkAccess && linkAccess.resourceType === "directory" && !directoryId) {
                effectiveDirectoryId = linkAccess.resourceId;
            }
            // If link is for a document, only return that document
            if (linkAccess && linkAccess.resourceType === "document") {
                const document = await Document_1.Document.findOne({
                    id: linkAccess.resourceId,
                    domain: linkAccess.domain,
                });
                return res.json(document ? [document] : []);
            }
            // Get current workspace from request
            // Workspace is required - domainAuth middleware ensures req.currentWorkspace is set
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({
                    error: "Workspace is required. Please select a workspace.",
                });
            }
            // For document queries, use the workspace domain (where documents are stored)
            // For cross-domain users, req.userDomain should be set to the workspace domain by middleware
            // But if not, we need to get it from the workspace
            const userHomeDomain = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain;
            // Get workspace to find its domain
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            const workspace = await Workspace.findOne({ workspaceId: currentWorkspace });
            const workspaceDomain = (workspace === null || workspace === void 0 ? void 0 : workspace.domain) || userHomeDomain; // Domain where workspace exists
            // Check if this is a shared directory first (before building query)
            let originalDirectoryId = effectiveDirectoryId;
            let sharedDirectoryInfo = null;
            if (effectiveDirectoryId && effectiveDirectoryId !== "root") {
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                const directory = await Directory.findOne({
                    id: effectiveDirectoryId,
                    workspaceId: currentWorkspace,
                });
                // If it's a shared directory, also get documents from the original directory
                if ((directory === null || directory === void 0 ? void 0 : directory.isShared) && directory.sharedFromDirectoryId) {
                    sharedDirectoryInfo = directory;
                    originalDirectoryId = directory.sharedFromDirectoryId;
                }
                else if (linkAccess && linkAccess.resourceType === "directory") {
                    // If accessing via link and directory not found in current workspace,
                    // check if the link's resourceId matches the requested directoryId
                    if (linkAccess.resourceId === effectiveDirectoryId) {
                        // Link is for this directory - get the original directory to find its workspace
                        const originalDir = await Directory.findOne({
                            id: effectiveDirectoryId,
                            domain: linkAccess.domain,
                        });
                        if (originalDir) {
                            sharedDirectoryInfo = {
                                sharedFromDirectoryId: effectiveDirectoryId,
                                sharedFromDomain: linkAccess.domain,
                                sharedFromWorkspaceId: originalDir.workspaceId,
                            };
                            originalDirectoryId = effectiveDirectoryId;
                        }
                    }
                    else {
                        // Check if there's a shared directory pointing to this directory
                        const sharedDir = await Directory.findOne({
                            workspaceId: currentWorkspace,
                            sharedFromDirectoryId: effectiveDirectoryId,
                            isShared: true,
                        });
                        if (sharedDir) {
                            sharedDirectoryInfo = sharedDir;
                            originalDirectoryId = effectiveDirectoryId;
                        }
                    }
                }
            }
            else if (linkAccess && linkAccess.resourceType === "directory" && !effectiveDirectoryId) {
                // If no directoryId provided but link is for a directory, use the link's directory
                effectiveDirectoryId = linkAccess.resourceId;
                const originalDir = await Directory_1.Directory.findOne({
                    id: linkAccess.resourceId,
                    domain: linkAccess.domain,
                });
                if (originalDir) {
                    sharedDirectoryInfo = {
                        sharedFromDirectoryId: linkAccess.resourceId,
                        sharedFromDomain: linkAccess.domain,
                        sharedFromWorkspaceId: originalDir.workspaceId,
                    };
                    originalDirectoryId = linkAccess.resourceId;
                }
            }
            // Build query - for shared directories, we need to query across domains/workspaces
            const query = {};
            if (sharedDirectoryInfo) {
                // For shared directories, query documents from both the shared directory and original directory
                query.$or = [
                    {
                        domain: workspaceDomain,
                        workspaceId: currentWorkspace,
                        directoryId: effectiveDirectoryId, // Documents created in recipient's workspace
                    },
                    {
                        domain: sharedDirectoryInfo.sharedFromDomain,
                        workspaceId: sharedDirectoryInfo.sharedFromWorkspaceId,
                        directoryId: originalDirectoryId, // Original documents
                    },
                ];
            }
            else {
                // Normal query - use workspace domain and workspace
                query.domain = workspaceDomain;
                query.workspaceId = currentWorkspace;
            }
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
            if ((_b = wsEntry === null || wsEntry === void 0 ? void 0 : wsEntry.extraDocumentIds) === null || _b === void 0 ? void 0 : _b.length) {
                // If there are extra documents, we need to include them regardless of time filtering
                const extraDocsQuery = { id: { $in: wsEntry.extraDocumentIds } };
                if (query.uploadedAt) {
                    // If we have time filtering, we need to combine it with existing $or (if any)
                    if (query.$or) {
                        // We have a shared directory $or, need to combine with time filter and extra docs
                        // Use $and to combine: (shared directory $or) AND (time filter OR extra docs)
                        query.$and = [
                            { $or: query.$or },
                            { $or: [{ uploadedAt: query.uploadedAt }, extraDocsQuery] }
                        ];
                        delete query.$or;
                        delete query.uploadedAt;
                    }
                    else {
                        // No existing $or, just combine time filter with extra docs
                        query.$or = [{ uploadedAt: query.uploadedAt }, extraDocsQuery];
                        delete query.uploadedAt;
                    }
                }
                else {
                    // No time filtering
                    if (query.$or) {
                        // We have a shared directory $or, add extra docs to it
                        query.$or.push(extraDocsQuery);
                    }
                    else {
                        // No existing $or, just add extra docs
                        query.$or = [extraDocsQuery];
                    }
                }
            }
            if ((_c = wsEntry === null || wsEntry === void 0 ? void 0 : wsEntry.blockedDocumentIds) === null || _c === void 0 ? void 0 : _c.length) {
                query.id = { $nin: wsEntry.blockedDocumentIds };
            }
            // Set directoryId filter (if not already set in $or for shared directories)
            if (effectiveDirectoryId === "root") {
                if (sharedDirectoryInfo) {
                    // For root in shared context, this shouldn't happen, but handle it
                    query.directoryId = null;
                }
                else {
                    query.directoryId = null;
                }
            }
            else if (typeof effectiveDirectoryId === "string" && !sharedDirectoryInfo) {
                // Only set directoryId if we didn't already set it in $or above
                query.directoryId = effectiveDirectoryId;
            }
            // no trash filter; return all in directory
            const allDocuments = await Document_1.Document.find(query).sort({ uploadedAt: -1 });
            // Filter documents based on directory access permissions
            // Only show documents from directories the user has access to
            // Same-domain admins of the workspace domain see all documents
            // BUT cross-domain users (both admin and regular, invited from other domains) should only see documents in granted directories
            // Link access bypasses directory access checks
            if (linkAccess) {
                return res.json(allDocuments);
            }
            const userDomain = user === null || user === void 0 ? void 0 : user.domain;
            const isSameDomainAdmin = (user === null || user === void 0 ? void 0 : user.role) === "admin" && userDomain && userDomain === workspaceDomain;
            const isCrossDomainUser = userDomain && userDomain !== workspaceDomain;
            if (isSameDomainAdmin) {
                return res.json(allDocuments);
            }
            // Filter documents: only include those whose parent directory user has access to
            const accessibleDocuments = await Promise.all(allDocuments.map(async (doc) => {
                // If viewing a shared directory, allow documents from the original directory
                if (sharedDirectoryInfo && doc.directoryId === originalDirectoryId) {
                    // User has access to the shared directory, so they can see documents from the original
                    return doc;
                }
                // For documents in the shared directory itself (created in recipient's workspace)
                if (sharedDirectoryInfo && doc.directoryId === effectiveDirectoryId) {
                    // Check access to the shared directory
                    const hasAccess = await exports.documentController.hasDirectoryAccess(req, effectiveDirectoryId);
                    return hasAccess ? doc : null;
                }
                // For normal directories, check access normally
                const hasAccess = await exports.documentController.hasDirectoryAccess(req, doc.directoryId || null);
                return hasAccess ? doc : null;
            }));
            // Filter out null values (documents without directory access)
            const filteredDocuments = accessibleDocuments.filter((d) => d !== null);
            res.json(filteredDocuments);
        }
        catch (error) {
            console.error("Error in getAll documents:", error);
            console.error("Error stack:", error.stack);
            res.status(500).json({ error: "Failed to fetch documents", details: String(error) });
        }
    },
    async getById(req, res) {
        var _a, _b;
        try {
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            // Get workspace to find its domain (where documents are stored)
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            const workspace = await Workspace.findOne({ workspaceId: currentWorkspace });
            const workspaceDomain = (workspace === null || workspace === void 0 ? void 0 : workspace.domain) || req.userDomain;
            const userDomain = (_a = req.user) === null || _a === void 0 ? void 0 : _a.domain;
            const isCrossDomainUser = userDomain && userDomain !== workspaceDomain;
            const isSameDomainAdmin = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === "admin" && userDomain === workspaceDomain;
            // Check for link access first
            const linkAccess = req.linkAccess;
            let document = null;
            if (linkAccess &&
                linkAccess.resourceType === "document" &&
                linkAccess.resourceId === req.params.id) {
                // Allow access via link token
                document = await Document_1.Document.findOne({
                    id: req.params.id,
                    domain: linkAccess.domain,
                });
            }
            // If not found via link, try current workspace/domain
            if (!document) {
                document = await Document_1.Document.findOne({
                    id: req.params.id,
                    domain: workspaceDomain,
                    workspaceId: currentWorkspace,
                });
            }
            // If still not found, check if it's in a shared directory's original directory
            if (!document) {
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                // Find all shared directories in current workspace that might contain this document
                const sharedDirectories = await Directory.find({
                    workspaceId: currentWorkspace,
                    isShared: true,
                });
                // Try to find the document in original directories
                for (const sharedDir of sharedDirectories) {
                    if (sharedDir.sharedFromDomain && sharedDir.sharedFromWorkspaceId) {
                        // Search in original domain/workspace
                        const originalDoc = await Document_1.Document.findOne({
                            id: req.params.id,
                            domain: sharedDir.sharedFromDomain,
                            workspaceId: sharedDir.sharedFromWorkspaceId,
                        });
                        if (originalDoc) {
                            // If we have a specific shared directory ID, verify the document is in that directory
                            // Otherwise, allow any document in the original workspace (access will be checked later)
                            if (!sharedDir.sharedFromDirectoryId || originalDoc.directoryId === sharedDir.sharedFromDirectoryId) {
                                document = originalDoc;
                                break;
                            }
                        }
                    }
                }
            }
            if (!document) {
                return res.status(404).json({ error: "Document not found" });
            }
            // Check access to the document's directory
            // Same-domain admins have access to all documents
            if (!isSameDomainAdmin) {
                // For same-domain users in the same workspace, allow access
                // (they should have access to documents in their workspace)
                const isSameDomainSameWorkspace = !isCrossDomainUser &&
                    document.workspaceId === currentWorkspace &&
                    document.domain === workspaceDomain;
                if (!isSameDomainSameWorkspace) {
                    // For cross-domain users or documents from different workspaces, check directory access
                    const hasAccess = await exports.documentController.hasDirectoryAccess(req, document.directoryId || null);
                    if (!hasAccess) {
                        return res.status(403).json({ error: "You do not have access to this document" });
                    }
                }
            }
            res.json(document);
        }
        catch (error) {
            console.error("Error in getById:", error);
            res.status(500).json({ error: "Failed to fetch document" });
        }
    },
    async create(req, res) {
        var _a, _b, _c, _d;
        try {
            const docData = { ...req.body };
            // Ensure namespace is always set and preserve original name with .pdf extension
            if (!docData.namespace) {
                docData.namespace = docData.name;
            }
            // Keep original namespace as-is to preserve .pdf extension
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            // Always use user's actual domain (not workspace slug)
            // req.userDomain might be workspace slug, but we need the actual user domain
            const actualDomain = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain;
            // Add domain and workspace to document data
            docData.domain = actualDomain; // Use actual user domain, not workspace slug
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
                actorUserId: (_d = (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString) === null || _d === void 0 ? void 0 : _d.call(_c),
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
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
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
            // Update directory's updatedAt when document is renamed or moved
            if (document.directoryId) {
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                const now = new Date();
                await Directory.updateOne({ id: document.directoryId, workspaceId: currentWorkspace }, {
                    $set: {
                        updatedAt: now,
                    },
                });
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
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
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
            // Build list of document ids to cascade delete against (only the document being deleted)
            const docIdsToDelete = [document.id];
            let linkedRhpId = null;
            let linkedRhpDoc = null;
            // If deleting a DRHP, unlink from RHP (don't delete RHP)
            if (document.type === "DRHP" && document.relatedRhpId) {
                linkedRhpId = document.relatedRhpId;
                linkedRhpDoc = await Document_1.Document.findOne({ id: linkedRhpId, domain: req.userDomain, workspaceId: currentWorkspace });
                if (linkedRhpDoc) {
                    // Unlink RHP from DRHP
                    linkedRhpDoc.relatedDrhpId = undefined;
                    await linkedRhpDoc.save();
                    // Don't delete RHP - just unlink
                }
            }
            // If deleting an RHP, unlink from DRHP (don't delete DRHP)
            if (document.type === "RHP") {
                const drhpDoc = await Document_1.Document.findOne({ relatedRhpId: document.id, domain: req.userDomain, workspaceId: currentWorkspace });
                if (drhpDoc) {
                    drhpDoc.relatedRhpId = undefined;
                    await drhpDoc.save();
                    // Only unlink, don't delete DRHP
                }
            }
            // Delete summaries - only for the document being deleted
            await Summary_1.Summary.deleteMany({
                domain: req.userDomain,
                workspaceId: currentWorkspace,
                documentId: document.id
            });
            // Delete chats for the document being deleted
            await Chat_1.Chat.deleteMany({ domain: req.userDomain, workspaceId: currentWorkspace, documentId: document.id });
            // Delete reports based on document type
            if (document.type === "DRHP") {
                // When deleting DRHP: delete reports that reference this DRHP
                await Report_1.Report.deleteMany({
                    domain: req.userDomain,
                    workspaceId: currentWorkspace,
                    $or: [
                        { drhpId: document.id },
                        { drhpNamespace: document.namespace }
                    ]
                });
            }
            else if (document.type === "RHP") {
                // When deleting RHP: delete reports that reference this RHP
                await Report_1.Report.deleteMany({
                    domain: req.userDomain,
                    workspaceId: currentWorkspace,
                    $or: [
                        { rhpId: document.id },
                        { rhpNamespace: document.rhpNamespace || document.namespace }
                    ]
                });
            }
            else {
                // For other document types: delete reports that reference this document
                await Report_1.Report.deleteMany({
                    domain: req.userDomain,
                    workspaceId: currentWorkspace,
                    $or: [
                        { drhpId: document.id },
                        { rhpId: document.id },
                        { drhpNamespace: document.namespace },
                        { rhpNamespace: document.namespace }
                    ]
                });
            }
            // Finally, delete the documents themselves
            await Document_1.Document.deleteMany({ id: { $in: docIdsToDelete }, domain: req.userDomain, workspaceId: currentWorkspace });
            // Update directory statistics after deletion
            if (document.directoryId) {
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                const directory = await Directory.findOne({
                    id: document.directoryId,
                    workspaceId: currentWorkspace,
                });
                if (directory) {
                    // Recalculate directory statistics
                    const docCount = await Document_1.Document.countDocuments({
                        directoryId: document.directoryId,
                        workspaceId: currentWorkspace,
                    });
                    const drhpCount = await Document_1.Document.countDocuments({
                        directoryId: document.directoryId,
                        workspaceId: currentWorkspace,
                        type: "DRHP",
                    });
                    const rhpCount = await Document_1.Document.countDocuments({
                        directoryId: document.directoryId,
                        workspaceId: currentWorkspace,
                        type: "RHP",
                    });
                    const lastDoc = await Document_1.Document.findOne({
                        directoryId: document.directoryId,
                        workspaceId: currentWorkspace,
                    })
                        .sort({ uploadedAt: -1 })
                        .select("uploadedAt");
                    const now = new Date();
                    await Directory.updateOne({ id: document.directoryId, workspaceId: currentWorkspace }, {
                        $set: {
                            documentCount: docCount,
                            drhpCount,
                            rhpCount,
                            updatedAt: now,
                            ...((lastDoc === null || lastDoc === void 0 ? void 0 : lastDoc.uploadedAt) && { lastDocumentUpload: lastDoc.uploadedAt }),
                        },
                    });
                }
            }
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
            // Workspace is required for document upload
            const workspaceId = req.currentWorkspace;
            if (!workspaceId) {
                return res.status(400).json({ error: "Workspace is required. Please select a workspace." });
            }
            // Get user's domainId
            const userWithDomain = await User_1.User.findById(user._id).select("domainId");
            if (!(userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId)) {
                return res.status(400).json({ error: "User domainId not found. Please contact administrator." });
            }
            // Determine document type from request body, default to DRHP
            const documentType = req.body.type || "DRHP"; // Accept type from frontend, default to DRHP
            // NEW: Directory is now required for document upload (directory-first approach)
            const directoryId = req.body.directoryId === "root" ? null : req.body.directoryId;
            if (!directoryId) {
                return res.status(400).json({
                    error: "Directory is required. Please select a company directory before uploading."
                });
            }
            // Verify directory exists in the workspace (including shared directories)
            const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
            let directory = await Directory.findOne({
                id: directoryId,
                workspaceId,
            });
            // If not found, check if it's a shared directory
            if (!directory) {
                directory = await Directory.findOne({
                    id: directoryId,
                    workspaceId,
                    isShared: true,
                    sharedWithUserId: user._id.toString(),
                });
            }
            if (!directory) {
                return res.status(404).json({
                    error: "Directory not found. Please select a valid company directory."
                });
            }
            // If this is a shared directory, use the recipient's workspace (current workspace)
            // Documents created in shared directories go to recipient's workspace
            const finalWorkspaceId = directory.isShared ? workspaceId : directory.workspaceId;
            // For shared directories, use the shared directory ID (not the original)
            const finalDirectoryId = directory.isShared ? directory.id : directoryId;
            const docData = {
                id: req.body.id || fileKey, // Use provided id from frontend or fallback to fileKey
                name: originalname,
                fileKey: fileKey,
                namespace: originalname || req.body.namespace, // Use original name directly to preserve .pdf
                type: documentType, // Set type based on request (DRHP or RHP)
                status: "processing", // Set status to processing initially - n8n will update to completed
                domain: user.domain, // Add domain for workspace isolation - backward compatibility
                domainId: userWithDomain.domainId, // Link to Domain schema
                workspaceId, // Workspace required - middleware ensures it's set
                directoryId: directoryId, // Required - no null allowed
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
            // NEW: Update directory statistics (use the actual directory ID that was used)
            if (finalDirectoryId) {
                const now = new Date();
                await Directory.updateOne({ id: finalDirectoryId, workspaceId: finalWorkspaceId }, {
                    $inc: {
                        documentCount: 1,
                        ...(documentType === "DRHP" ? { drhpCount: 1 } : { rhpCount: 1 }),
                    },
                    $set: {
                        lastDocumentUpload: now,
                        updatedAt: now,
                    },
                });
            }
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
            // Notify Python AI Platform for further processing
            const pythonPlatformUrl = process.env.PYTHON_PLATFORM_URL || "http://localhost:8000";
            try {
                // Generate pre-signed URL for the Python worker to download the file directly from R2
                const getObjectCommand = new client_s3_1.GetObjectCommand({
                    Bucket: r2_1.R2_BUCKET,
                    Key: fileKey,
                });
                const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2_1.r2Client, getObjectCommand, { expiresIn: 3600 }); // 1 hour
                console.log(`🚀 Sending document to Python AI Platform: ${documentType}`);
                await axios_1.default.post(`${pythonPlatformUrl}/jobs/document`, {
                    file_url: signedUrl,
                    file_type: "pdf",
                    metadata: {
                        filename: document.name,
                        doc_type: documentType.toLowerCase(),
                        documentId: document.id,
                        domain: document.domain || user.domain,
                        domainId: document.domainId || userWithDomain.domainId,
                        workspaceId: document.workspaceId || workspaceId
                    }
                }, {
                    headers: { "Content-Type": "application/json" },
                    timeout: 30000
                });
            }
            catch (pythonErr) {
                console.error("❌ Failed to notify Python AI Platform:", pythonErr.message);
            }
            res.status(201).json({ message: "File uploaded successfully", document });
        }
        catch (error) {
            console.error("Error uploading document:", error);
            res.status(500).json({ error: "Failed to upload document" });
        }
    },
    async downloadDocument(req, res) {
        var _a, _b;
        try {
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            const workspace = await Workspace.findOne({ workspaceId: currentWorkspace });
            const workspaceDomain = (workspace === null || workspace === void 0 ? void 0 : workspace.domain) || req.userDomain;
            const userDomain = (_a = req.user) === null || _a === void 0 ? void 0 : _a.domain;
            const isCrossDomainUser = userDomain && userDomain !== workspaceDomain;
            const isSameDomainAdmin = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) === "admin" && userDomain === workspaceDomain;
            let document = await Document_1.Document.findOne({
                id: req.params.id,
                domain: workspaceDomain,
                workspaceId: currentWorkspace,
            });
            if (!document) {
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                const sharedDirectories = await Directory.find({
                    workspaceId: currentWorkspace,
                    isShared: true,
                });
                for (const sharedDir of sharedDirectories) {
                    if (sharedDir.sharedFromDomain && sharedDir.sharedFromWorkspaceId) {
                        const originalDoc = await Document_1.Document.findOne({
                            id: req.params.id,
                            domain: sharedDir.sharedFromDomain,
                            workspaceId: sharedDir.sharedFromWorkspaceId,
                        });
                        if (originalDoc) {
                            if (!sharedDir.sharedFromDirectoryId || originalDoc.directoryId === sharedDir.sharedFromDirectoryId) {
                                document = originalDoc;
                                break;
                            }
                        }
                    }
                }
            }
            if (!document || !document.fileKey) {
                return res.status(404).json({ error: "Document not found or no file" });
            }
            if (!isSameDomainAdmin) {
                const isSameDomainSameWorkspace = !isCrossDomainUser &&
                    document.workspaceId === currentWorkspace &&
                    document.domain === workspaceDomain;
                if (!isSameDomainSameWorkspace) {
                    const hasAccess = await exports.documentController.hasDirectoryAccess(req, document.directoryId || null);
                    if (!hasAccess) {
                        return res.status(403).json({ error: "You do not have access to this document" });
                    }
                }
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
            console.error("Error in downloadDocument:", error);
            res.status(500).json({ error: "Failed to download document" });
        }
    },
    async checkExistingByNamespace(req, res) {
        try {
            const { namespace } = req.query;
            if (!namespace) {
                return res.status(400).json({ error: "Namespace parameter is required" });
            }
            const queryNamespace = namespace;
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            const query = {
                namespace: queryNamespace,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
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
            const { jobId, documentId, status, error } = req.body;
            const identifier = jobId || documentId;
            if (!identifier || !status) {
                return res.status(400).json({
                    message: "Missing jobId/documentId or status",
                    received: { jobId, documentId, status }
                });
            }
            const normalizedStatus = status.trim().toLowerCase();
            console.log(`📥 Received status update for ${identifier}: ${normalizedStatus}`);
            try {
                let document = await Document_1.Document.findOne({ id: identifier });
                if (!document && documentId)
                    document = await Document_1.Document.findOne({ id: documentId });
                if (!document)
                    document = await Document_1.Document.findOne({ fileKey: identifier });
                if (!document && identifier.match(/^[0-9a-fA-F]{24}$/))
                    document = await Document_1.Document.findById(identifier);
                if (document) {
                    let newStatus = document.status;
                    if (normalizedStatus === "completed" || normalizedStatus === "ready" || normalizedStatus === "complete") {
                        newStatus = "completed";
                    }
                    else if (normalizedStatus === "failed" || normalizedStatus === "error") {
                        newStatus = "failed";
                    }
                    else if (normalizedStatus === "processing") {
                        newStatus = "processing";
                    }
                    if (document.status !== newStatus) {
                        document.status = newStatus;
                        await document.save();
                        await Document_1.Document.updateOne({ _id: document._id }, { $set: { status: newStatus } });
                    }
                    index_1.io.emit("upload_status", { jobId: document.id, status: newStatus, error });
                    res.status(200).json({
                        message: "Upload status update processed",
                        jobId: document.id,
                        status: normalizedStatus,
                        newStatus: newStatus,
                        error,
                    });
                }
                else {
                    res.status(404).json({ message: "Document not found", identifier });
                }
            }
            catch (dbError) {
                res.status(500).json({ message: "Database error", error: dbError.message });
            }
        }
        catch (err) {
            res.status(500).json({ message: "Failed to process update", error: String(err) });
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
            const workspaceId = req.currentWorkspace;
            if (!workspaceId) {
                return res.status(400).json({ error: "Workspace is required." });
            }
            const userWithDomain = await User_1.User.findById(user._id).select("domainId");
            if (!(userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId)) {
                return res.status(400).json({ error: "User domainId not found." });
            }
            const rhpDocData = {
                id: fileKey,
                fileKey: fileKey,
                name: req.file.originalname,
                namespace: req.file.originalname,
                type: "RHP",
                status: "processing",
                relatedDrhpId: drhp.id,
                domain: user.domain,
                domainId: userWithDomain.domainId,
                workspaceId,
            };
            if (user === null || user === void 0 ? void 0 : user.microsoftId)
                rhpDocData.microsoftId = user.microsoftId;
            else if (user === null || user === void 0 ? void 0 : user._id)
                rhpDocData.userId = user._id.toString();
            const rhpDoc = new Document_1.Document(rhpDocData);
            await rhpDoc.save();
            drhp.relatedRhpId = rhpDoc.id;
            await drhp.save();
            const pythonPlatformUrl = process.env.PYTHON_PLATFORM_URL || "http://localhost:8000";
            try {
                const getObjectCommand = new client_s3_1.GetObjectCommand({
                    Bucket: r2_1.R2_BUCKET,
                    Key: fileKey,
                });
                const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2_1.r2Client, getObjectCommand, { expiresIn: 3600 });
                await axios_1.default.post(`${pythonPlatformUrl}/jobs/document`, {
                    file_url: signedUrl,
                    file_type: "pdf",
                    metadata: {
                        filename: rhpDoc.name,
                        doc_type: "rhp",
                        documentId: rhpDoc.id,
                        domain: rhpDoc.domain,
                        domainId: rhpDoc.domainId,
                        workspaceId: rhpDoc.workspaceId
                    }
                });
            }
            catch (pythonErr) {
                console.error("❌ Failed to notify Python platform for RHP:", pythonErr.message);
            }
            index_1.io.emit("upload_status", { jobId: rhpDoc.id, status: "processing" });
            res.status(201).json({ message: "RHP uploaded and linked", document: rhpDoc });
        }
        catch (error) {
            console.error("Error uploading RHP:", error);
            res.status(500).json({ error: "Failed to upload RHP" });
        }
    },
    async getAllAdmin(req, res) {
        var _a, _b, _c;
        try {
            const user = req.user;
            if (!user || user.role !== "admin") {
                return res.status(403).json({ error: "Admin access required" });
            }
            const query = {
                domain: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain,
            };
            const userWithDomain = await User_1.User.findById(req.user._id).select("domainId");
            if (userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId) {
                query.$or = [
                    { domain: ((_b = req.user) === null || _b === void 0 ? void 0 : _b.domain) || req.userDomain },
                    { domainId: userWithDomain.domainId }
                ];
            }
            const documents = await Document_1.Document.find(query).sort({ uploadedAt: -1 });
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            const workspaces = await Workspace.find({ domain: ((_c = req.user) === null || _c === void 0 ? void 0 : _c.domain) || req.userDomain });
            const workspaceMap = new Map(workspaces.map(ws => [ws.workspaceId, { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug }]));
            const documentsWithWorkspace = documents.map(doc => ({
                ...doc.toObject(),
                workspaceId: workspaceMap.get(doc.workspaceId) || { workspaceId: doc.workspaceId, name: "Excollo", slug: "unknown" }
            }));
            res.json(documentsWithWorkspace);
        }
        catch (error) {
            console.error("Error fetching admin documents:", error);
            res.status(500).json({ error: "Failed to fetch documents" });
        }
    },
    async getAvailableForCompare(req, res) {
        try {
            const { id } = req.params;
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const document = await Document_1.Document.findOne({
                id,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
            });
            if (!document)
                return res.status(404).json({ error: "Document not found" });
            const oppositeType = document.type === "DRHP" ? "RHP" : "DRHP";
            const availableDocuments = await Document_1.Document.find({
                domain: req.userDomain,
                workspaceId: currentWorkspace,
                type: oppositeType,
                $and: [
                    { id: { $ne: document.id } },
                    { relatedDrhpId: { $ne: document.id } },
                    { relatedRhpId: { $ne: document.id } }
                ]
            }).select('id name type uploadedAt namespace').sort({ uploadedAt: -1 });
            res.json({
                selectedDocument: { id: document.id, name: document.name, type: document.type, uploadedAt: document.uploadedAt },
                availableDocuments
            });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to fetch available documents" });
        }
    },
    async linkForCompare(req, res) {
        var _a, _b, _c;
        try {
            const { drhpId, rhpId } = req.body;
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            if (!drhpId || !rhpId)
                return res.status(400).json({ error: "IDs required" });
            const drhpDoc = await Document_1.Document.findOne({ id: drhpId, domain: req.userDomain, workspaceId: currentWorkspace, type: "DRHP" });
            const rhpDoc = await Document_1.Document.findOne({ id: rhpId, domain: req.userDomain, workspaceId: currentWorkspace, type: "RHP" });
            if (!drhpDoc || !rhpDoc)
                return res.status(404).json({ error: "Documents not found" });
            drhpDoc.relatedRhpId = rhpId;
            rhpDoc.relatedDrhpId = drhpId;
            await drhpDoc.save();
            await rhpDoc.save();
            (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "documents.linked",
                resourceType: "document",
                resourceId: drhpId,
                title: `Documents linked: ${drhpDoc.name} ↔ ${rhpDoc.name}`,
                notifyWorkspace: true,
            }).catch(console.error);
            res.json({ message: "Linked successfully", drhpDocument: drhpDoc, rhpDocument: rhpDoc });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to link" });
        }
    },
    async unlinkForCompare(req, res) {
        try {
            const { id } = req.params;
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const document = await Document_1.Document.findOne({ id, domain: req.userDomain, workspaceId: currentWorkspace });
            if (!document)
                return res.status(404).json({ error: "Not found" });
            if (document.type === "DRHP" && document.relatedRhpId) {
                await Document_1.Document.updateOne({ id: document.relatedRhpId }, { $unset: { relatedDrhpId: 1 } });
                document.relatedRhpId = undefined;
            }
            else if (document.type === "RHP" && document.relatedDrhpId) {
                await Document_1.Document.updateOne({ id: document.relatedDrhpId }, { $unset: { relatedRhpId: 1 } });
                document.relatedDrhpId = undefined;
            }
            await document.save();
            res.json({ message: "Unlinked successfully" });
        }
        catch (error) {
            res.status(500).json({ error: "Failed to unlink" });
        }
    },
};
