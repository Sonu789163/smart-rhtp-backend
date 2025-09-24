"use strict";
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
    var _a, _b, _c, _d;
    // Admins are owners
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === "admin")
        return "owner";
    const domain = req.userDomain;
    const doc = await Document_1.Document.findOne({ id: documentId, domain });
    if (!doc)
        return "none";
    // All workspace members get editor access to documents in their workspace
    const currentWorkspace = req.currentWorkspace || domain;
    if (doc.workspaceId === currentWorkspace) {
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
    // Direct share for user
    const userId = (_d = (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString) === null || _d === void 0 ? void 0 : _d.call(_c);
    if (userId) {
        const share = await SharePermission_1.SharePermission.findOne({ domain, resourceType: "document", resourceId: documentId, scope: "user", principalId: userId });
        if (share)
            return share.role;
    }
    // Workspace share
    const workspaceKey = req.currentWorkspace || domain;
    const wsShare = await SharePermission_1.SharePermission.findOne({ domain, resourceType: "document", resourceId: documentId, scope: "workspace", principalId: workspaceKey });
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
