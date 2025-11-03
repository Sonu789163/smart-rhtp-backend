"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.directoryController = void 0;
const Directory_1 = require("../models/Directory");
const User_1 = require("../models/User");
const Document_1 = require("../models/Document");
const SharePermission_1 = require("../models/SharePermission");
const events_1 = require("../lib/events");
exports.directoryController = {
    async move(req, res) {
        try {
            const { newParentId } = req.body || {};
            // Get current workspace from request
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            const dir = await Directory_1.Directory.findOne({
                id: req.params.id,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
            });
            if (!dir) {
                return res.status(404).json({ error: "Directory not found" });
            }
            if (newParentId === dir.id) {
                return res.status(400).json({ error: "Cannot move into itself" });
            }
            // Validate new parent if provided
            if (newParentId) {
                const parent = await Directory_1.Directory.findOne({
                    id: newParentId,
                    domain: req.userDomain,
                    workspaceId: currentWorkspace,
                });
                if (!parent) {
                    return res.status(400).json({ error: "Invalid destination folder" });
                }
            }
            dir.parentId = newParentId || null;
            await dir.save();
            res.json(dir);
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === 11000) {
                return res
                    .status(409)
                    .json({ error: "A folder with this name already exists here" });
            }
            res.status(500).json({ error: "Failed to move directory" });
        }
    },
    async create(req, res) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            const { name, parentId } = req.body || {};
            if (!name || String(name).trim() === "") {
                return res.status(400).json({ error: "Name is required" });
            }
            // Get current workspace from request
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            // Always use user's actual domain (not workspace slug)
            // req.userDomain might be workspace slug, but we need the actual user domain
            const actualDomain = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain;
            // Get user's domainId
            const userWithDomain = await User_1.User.findById((_b = req.user) === null || _b === void 0 ? void 0 : _b._id).select("domainId");
            if (!(userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId)) {
                return res.status(400).json({ error: "User domainId not found. Please contact administrator." });
            }
            const payload = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: String(name).trim(),
                parentId: parentId === "root" || !parentId ? null : parentId,
                domain: actualDomain, // Use actual user domain, not workspace slug - backward compatibility
                domainId: userWithDomain.domainId, // Link to Domain schema
                workspaceId: currentWorkspace,
                ownerUserId: (_e = (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c._id) === null || _d === void 0 ? void 0 : _d.toString) === null || _e === void 0 ? void 0 : _e.call(_d),
            };
            const dir = new Directory_1.Directory(payload);
            await dir.save();
            await (0, events_1.publishEvent)({
                actorUserId: (_h = (_g = (_f = req.user) === null || _f === void 0 ? void 0 : _f._id) === null || _g === void 0 ? void 0 : _g.toString) === null || _h === void 0 ? void 0 : _h.call(_g),
                domain: req.userDomain,
                action: "directory.created",
                resourceType: "directory",
                resourceId: dir.id,
                title: `Folder created: ${dir.name}`,
                notifyWorkspace: true,
            });
            res.status(201).json(dir);
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === 11000) {
                return res
                    .status(409)
                    .json({ error: "A folder with this name already exists here" });
            }
            res.status(500).json({ error: "Failed to create directory" });
        }
    },
    async getById(req, res) {
        try {
            // Get current workspace from request
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            const dir = await Directory_1.Directory.findOne({
                id: req.params.id,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
            });
            if (!dir) {
                return res.status(404).json({ error: "Directory not found" });
            }
            res.json(dir);
        }
        catch (err) {
            res.status(500).json({ error: "Failed to fetch directory" });
        }
    },
    async listChildren(req, res) {
        var _a, _b, _c, _d, _e, _f;
        try {
            const parentId = req.params.id === "root" ? null : req.params.id;
            const { includeDeleted, page, pageSize, sort, order } = (req.query ||
                {});
            // Get current workspace from request
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            // Use actual user domain when querying directories (not workspace slug)
            // Directories are stored with actual domain, not workspace slug
            const actualDomain = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain;
            const filter = {
                domain: actualDomain, // Use actual domain, not workspace slug
                workspaceId: currentWorkspace,
                parentId,
            };
            const allDirs = await Directory_1.Directory.find(filter).sort({ name: 1 });
            // Filter directories by user permissions (only show directories user has access to)
            const userId = (_c = (_b = req.user) === null || _b === void 0 ? void 0 : _b._id) === null || _c === void 0 ? void 0 : _c.toString();
            // Use actual user domain, not workspace slug (req.userDomain might be slug)
            const domain = ((_d = req.user) === null || _d === void 0 ? void 0 : _d.domain) || req.userDomain;
            const visibleDirs = await Promise.all(allDirs.map(async (dir) => {
                var _a;
                // Admins can see all directories
                if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === "admin")
                    return dir;
                // Directory owners can see their own directories
                if (dir.ownerUserId === userId)
                    return dir;
                // Check user-scoped share permission
                if (userId) {
                    const userShare = await SharePermission_1.SharePermission.findOne({
                        domain,
                        resourceType: "directory",
                        resourceId: dir.id,
                        scope: "user",
                        principalId: userId,
                    });
                    if (userShare)
                        return dir;
                }
                // Check workspace-scoped share permission
                const wsShare = await SharePermission_1.SharePermission.findOne({
                    domain,
                    resourceType: "directory",
                    resourceId: dir.id,
                    scope: "workspace",
                    principalId: currentWorkspace,
                });
                if (wsShare)
                    return dir;
                // No permission - don't show this directory
                return null;
            }));
            // Filter out null values (directories without permission)
            const dirs = visibleDirs.filter((d) => d !== null);
            // Documents under this directory
            // Use actual domain when querying documents (not workspace slug)
            const actualDomainForDocs = ((_e = req.user) === null || _e === void 0 ? void 0 : _e.domain) || req.userDomain;
            const docFilter = {
                domain: actualDomainForDocs, // Use actual domain, not workspace slug
                workspaceId: currentWorkspace,
            };
            docFilter.directoryId = parentId;
            // Sorting
            const sortKey = sort === "uploadedAt" ? "uploadedAt" : "name";
            const sortDir = (order || "asc").toLowerCase() === "desc" ? -1 : 1;
            const allDocs = await Document_1.Document.find(docFilter).sort({ [sortKey]: sortDir });
            // Filter documents based on directory access permissions
            // Only show documents from directories the user has access to
            let docs = allDocs;
            if (((_f = req.user) === null || _f === void 0 ? void 0 : _f.role) !== "admin") {
                // Check access for each document's directory
                const accessibleDocs = await Promise.all(allDocs.map(async (doc) => {
                    var _a;
                    const docDirId = doc.directoryId || null;
                    // Root directory - allow access
                    if (!docDirId)
                        return doc;
                    // Check if directory is in the visible directories list (already filtered)
                    const hasDirAccess = dirs.some((d) => d.id === docDirId);
                    if (hasDirAccess)
                        return doc;
                    // Also check if user owns the directory or has explicit share
                    const directory = dirs.find((d) => d.id === docDirId);
                    if ((directory === null || directory === void 0 ? void 0 : directory.ownerUserId) === userId)
                        return doc;
                    // Use actual user domain when checking SharePermission (not workspace slug)
                    const actualDomain = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain) || req.userDomain;
                    if (userId) {
                        const userShare = await SharePermission_1.SharePermission.findOne({
                            domain: actualDomain,
                            resourceType: "directory",
                            resourceId: docDirId,
                            scope: "user",
                            principalId: userId,
                        });
                        if (userShare)
                            return doc;
                    }
                    const wsShare = await SharePermission_1.SharePermission.findOne({
                        domain: actualDomain,
                        resourceType: "directory",
                        resourceId: docDirId,
                        scope: "workspace",
                        principalId: currentWorkspace,
                    });
                    if (wsShare)
                        return doc;
                    // No access
                    return null;
                }));
                docs = accessibleDocs.filter((d) => d !== null);
            }
            // Merge and paginate
            const merged = [
                ...dirs.map((d) => ({ kind: "directory", item: d })),
                ...docs.map((d) => ({ kind: "document", item: d })),
            ];
            const p = Math.max(parseInt(page || "1", 10), 1);
            const ps = Math.min(Math.max(parseInt(pageSize || "50", 10), 1), 200);
            const start = (p - 1) * ps;
            const paged = merged.slice(start, start + ps);
            res.json({
                total: merged.length,
                page: p,
                pageSize: ps,
                items: paged,
            });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to list children" });
        }
    },
    async update(req, res) {
        var _a, _b, _c;
        try {
            const { name, parentId } = req.body || {};
            // Get current workspace from request
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            const dir = await Directory_1.Directory.findOne({
                id: req.params.id,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
            });
            if (!dir) {
                return res.status(404).json({ error: "Directory not found" });
            }
            if (typeof name === "string" && name.trim() !== "") {
                dir.name = name.trim();
            }
            if (typeof parentId !== "undefined") {
                dir.parentId = parentId || null;
            }
            await dir.save();
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "directory.updated",
                resourceType: "directory",
                resourceId: dir.id,
                title: `Folder updated: ${dir.name}`,
                notifyWorkspace: true,
            });
            res.json(dir);
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === 11000) {
                return res
                    .status(409)
                    .json({ error: "A folder with this name already exists here" });
            }
            res.status(500).json({ error: "Failed to update directory" });
        }
    },
    // Soft delete removed
    // Restore removed
    async delete(req, res) {
        var _a, _b, _c;
        try {
            // Get current workspace from request
            // Workspace is required
            const currentWorkspace = req.currentWorkspace;
            if (!currentWorkspace) {
                return res.status(400).json({ error: "Workspace is required" });
            }
            const dir = await Directory_1.Directory.findOne({
                id: req.params.id,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
            });
            if (!dir) {
                return res.status(404).json({ error: "Directory not found" });
            }
            // Get all descendant directories recursively
            const queue = [dir.id];
            const visited = new Set();
            const dirsToDelete = [];
            while (queue.length) {
                const current = queue.shift();
                if (visited.has(current))
                    continue;
                visited.add(current);
                dirsToDelete.push(current);
                const children = await Directory_1.Directory.find({
                    domain: req.userDomain,
                    workspaceId: currentWorkspace,
                    parentId: current,
                });
                for (const child of children) {
                    if (!visited.has(child.id))
                        queue.push(child.id);
                }
            }
            // Delete all documents in all directories
            await Document_1.Document.deleteMany({
                domain: req.userDomain,
                workspaceId: currentWorkspace,
                directoryId: { $in: dirsToDelete },
            });
            // Delete all directories
            await Directory_1.Directory.deleteMany({
                domain: req.userDomain,
                workspaceId: currentWorkspace,
                id: { $in: dirsToDelete },
            });
            await (0, events_1.publishEvent)({
                actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                domain: req.userDomain,
                action: "directory.deleted",
                resourceType: "directory",
                resourceId: dir.id,
                title: `Folder permanently deleted: ${dir.name}`,
                notifyWorkspace: true,
            });
            res.json({ message: "Directory and all contents permanently deleted" });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to delete directory" });
        }
    },
};
