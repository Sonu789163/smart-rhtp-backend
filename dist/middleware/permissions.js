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
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDirectoryPermission = requireDirectoryPermission;
exports.requireBodyDocumentPermission = requireBodyDocumentPermission;
exports.requireSummaryPermission = requireSummaryPermission;
exports.requireReportPermission = requireReportPermission;
exports.requireDocumentPermission = requireDocumentPermission;
exports.requireCreateInDirectory = requireCreateInDirectory;
const Directory_1 = require("../models/Directory");
const Document_1 = require("../models/Document");
const Summary_1 = require("../models/Summary");
const Report_1 = require("../models/Report");
const SharePermission_1 = require("../models/SharePermission");
function roleRank(role) {
    switch (role) {
        case "viewer": return 1;
        case "editor": return 2;
        case "owner": return 3;
        default: return 0;
    }
}
async function getUserRoleForDirectory(req, directoryId) {
    var _a, _b, _c, _d, _e;
    // Root directory: allow editor for authenticated users within domain (can create top-level folders)
    if (!directoryId)
        return "editor";
    // Admins are owners
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === "admin")
        return "owner";
    const domain = req.userDomain;
    const dir = await Directory_1.Directory.findOne({ id: directoryId, domain });
    if (!dir)
        return "none";
    if (dir.ownerUserId && ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id) && dir.ownerUserId === req.user._id.toString()) {
        return "owner";
    }
    // Link access
    const link = req.linkAccess;
    if (link && link.resourceType === "directory" && link.resourceId === directoryId) {
        return link.role;
    }
    // Direct share for user
    const userId = (_e = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c._id) === null || _d === void 0 ? void 0 : _d.toString) === null || _e === void 0 ? void 0 : _e.call(_d);
    if (userId) {
        const share = await SharePermission_1.SharePermission.findOne({ domain, resourceType: "directory", resourceId: directoryId, scope: "user", principalId: userId });
        if (share)
            return share.role;
    }
    // Workspace share by domain or currentWorkspace
    const workspaceKey = req.currentWorkspace || domain;
    const wsShare = await SharePermission_1.SharePermission.findOne({ domain, resourceType: "directory", resourceId: directoryId, scope: "workspace", principalId: workspaceKey });
    if (wsShare)
        return wsShare.role;
    return "none";
}
async function getUserRoleForDocument(req, documentId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // Admins are owners
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === "admin")
        return "owner";
    const domain = req.userDomain;
    let doc = await Document_1.Document.findOne({ id: documentId, domain });
    // If not found in current domain, check if it's in a shared directory's original directory
    if (!doc && req.currentWorkspace) {
        const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
        const sharedDirectories = await Directory.find({
            workspaceId: req.currentWorkspace,
            isShared: true,
        });
        for (const sharedDir of sharedDirectories) {
            if (sharedDir.sharedFromDomain && sharedDir.sharedFromWorkspaceId) {
                const originalDoc = await Document_1.Document.findOne({
                    id: documentId,
                    domain: sharedDir.sharedFromDomain,
                    workspaceId: sharedDir.sharedFromWorkspaceId,
                });
                if (originalDoc) {
                    if (!sharedDir.sharedFromDirectoryId || originalDoc.directoryId === sharedDir.sharedFromDirectoryId) {
                        doc = originalDoc;
                        break;
                    }
                }
            }
        }
    }
    if (!doc)
        return "none";
    // All workspace members get editor access to documents in their workspace
    const currentWorkspace = req.currentWorkspace || domain;
    if (doc.workspaceId === currentWorkspace && doc.domain === domain) {
        return "editor";
    }
    // Link access
    const link = req.linkAccess;
    if (link && link.resourceType === "document" && link.resourceId === documentId) {
        return link.role;
    }
    // Extended link access: if link is for related pair (DRHP <-> RHP), allow same role
    if (link && link.resourceType === "document") {
        // If requested doc is RHP and the link was for its DRHP
        if (doc.type === "RHP" && doc.relatedDrhpId === link.resourceId) {
            return link.role;
        }
        // If requested doc is DRHP and the link was for its RHP
        if (doc.type === "DRHP" && doc.relatedRhpId && doc.relatedRhpId === link.resourceId) {
            return link.role;
        }
    }
    // Check if user has access via shared directory
    if (doc.directoryId && req.currentWorkspace) {
        const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
        const { SharePermission } = await Promise.resolve().then(() => __importStar(require("../models/SharePermission")));
        // Check if there's a shared directory pointing to this document's directory
        const sharedDir = await Directory.findOne({
            workspaceId: req.currentWorkspace,
            sharedFromDirectoryId: doc.directoryId,
            isShared: true,
        });
        if (sharedDir) {
            const userId = (_d = (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString) === null || _d === void 0 ? void 0 : _d.call(_c);
            const userEmail = (_f = (_e = req.user) === null || _e === void 0 ? void 0 : _e.email) === null || _f === void 0 ? void 0 : _f.toLowerCase();
            // Check if user is the recipient
            if (userId && sharedDir.sharedWithUserId === userId) {
                return "viewer"; // Shared directories typically give viewer access
            }
            // Check SharePermission for the original directory
            if (userId) {
                const userShare = await SharePermission.findOne({
                    domain: doc.domain,
                    resourceType: "directory",
                    resourceId: doc.directoryId,
                    scope: "user",
                    principalId: userId,
                });
                if (userShare)
                    return userShare.role;
            }
            if (userEmail) {
                const emailShare = await SharePermission.findOne({
                    domain: doc.domain,
                    resourceType: "directory",
                    resourceId: doc.directoryId,
                    scope: "user",
                    invitedEmail: userEmail,
                });
                if (emailShare)
                    return emailShare.role;
            }
            // Check workspace share
            const wsShare = await SharePermission.findOne({
                domain: doc.domain,
                resourceType: "directory",
                resourceId: doc.directoryId,
                scope: "workspace",
                principalId: currentWorkspace,
            });
            if (wsShare)
                return wsShare.role;
        }
    }
    // Direct share for user
    const userId = (_j = (_h = (_g = req.user) === null || _g === void 0 ? void 0 : _g._id) === null || _h === void 0 ? void 0 : _h.toString) === null || _j === void 0 ? void 0 : _j.call(_h);
    if (userId) {
        const share = await SharePermission_1.SharePermission.findOne({ domain: doc.domain, resourceType: "document", resourceId: documentId, scope: "user", principalId: userId });
        if (share)
            return share.role;
    }
    // Workspace share
    const workspaceKey = req.currentWorkspace || domain;
    const wsShare = await SharePermission_1.SharePermission.findOne({ domain: doc.domain, resourceType: "document", resourceId: documentId, scope: "workspace", principalId: workspaceKey });
    if (wsShare)
        return wsShare.role;
    return "none";
}
function requireDirectoryPermission(paramKey, needed) {
    return async (req, res, next) => {
        var _a, _b;
        try {
            const idRaw = (_b = (_a = req.params[paramKey]) !== null && _a !== void 0 ? _a : req.body[paramKey]) !== null && _b !== void 0 ? _b : req.query[paramKey];
            const directoryId = idRaw === "root" ? null : idRaw;
            const role = await getUserRoleForDirectory(req, directoryId);
            if (roleRank(role) < roleRank(needed)) {
                return res.status(403).json({ message: "Insufficient permissions" });
            }
            next();
        }
        catch (err) {
            res.status(500).json({ message: "Permission check failed" });
        }
    };
}
// Check permission based on document id provided in request body
function requireBodyDocumentPermission(bodyKey, needed) {
    return async function (req, res, next) {
        var _a;
        try {
            const documentId = (_a = req.body) === null || _a === void 0 ? void 0 : _a[bodyKey];
            if (!documentId)
                return res.status(400).json({ error: `Missing ${bodyKey}` });
            const role = await getUserRoleForDocument(req, documentId);
            if (roleRank(role) < roleRank(needed)) {
                return res.status(403).json({ error: "Insufficient permissions" });
            }
            next();
        }
        catch (err) {
            res.status(500).json({ error: "Permission check failed" });
        }
    };
}
// Check permission for a summary by summary id (maps to its document access)
function requireSummaryPermission(paramKey, needed) {
    return async function (req, res, next) {
        var _a;
        try {
            const summaryId = (_a = req.params) === null || _a === void 0 ? void 0 : _a[paramKey];
            const summary = await Summary_1.Summary.findOne({ id: summaryId, domain: req.userDomain });
            if (!summary)
                return res.status(404).json({ error: "Summary not found" });
            const role = await getUserRoleForDocument(req, summary.documentId);
            if (roleRank(role) < roleRank(needed)) {
                return res.status(403).json({ error: "Insufficient permissions" });
            }
            next();
        }
        catch (err) {
            res.status(500).json({ error: "Permission check failed" });
        }
    };
}
// Check permission for a report by report id (uses DRHP id for permission)
function requireReportPermission(paramKey, needed) {
    return async function (req, res, next) {
        var _a;
        try {
            const reportId = (_a = req.params) === null || _a === void 0 ? void 0 : _a[paramKey];
            const report = await Report_1.Report.findOne({ id: reportId, domain: req.userDomain });
            if (!report)
                return res.status(404).json({ error: "Report not found" });
            const role = await getUserRoleForDocument(req, report.drhpId || report.rhpId);
            if (roleRank(role) < roleRank(needed)) {
                return res.status(403).json({ error: "Insufficient permissions" });
            }
            next();
        }
        catch (err) {
            res.status(500).json({ error: "Permission check failed" });
        }
    };
}
function requireDocumentPermission(paramKey, needed) {
    return async (req, res, next) => {
        var _a, _b;
        try {
            const documentId = (_b = (_a = req.params[paramKey]) !== null && _a !== void 0 ? _a : req.body[paramKey]) !== null && _b !== void 0 ? _b : req.query[paramKey];
            const role = await getUserRoleForDocument(req, documentId);
            if (roleRank(role) < roleRank(needed)) {
                return res.status(403).json({ message: "Insufficient permissions" });
            }
            next();
        }
        catch (err) {
            res.status(500).json({ message: "Permission check failed" });
        }
    };
}
async function requireCreateInDirectory(req, res, next) {
    var _a, _b, _c, _d;
    try {
        const idRaw = (_d = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.parentId) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.directoryId) !== null && _d !== void 0 ? _d : null;
        const directoryId = idRaw === "root" ? null : idRaw;
        const role = await getUserRoleForDirectory(req, directoryId);
        if (roleRank(role) < roleRank("editor")) {
            return res.status(403).json({ message: "Insufficient permissions to create here" });
        }
        next();
    }
    catch (err) {
        res.status(500).json({ message: "Permission check failed" });
    }
}
