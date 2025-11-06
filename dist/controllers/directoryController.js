"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.directoryController = void 0;
const Directory_1 = require("../models/Directory");
const Document_1 = require("../models/Document");
const Workspace_1 = require("../models/Workspace");
const events_1 = require("../lib/events");
exports.directoryController = {
    async move(req, res) {
        try {
            const { newParentId } = req.body || {};
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
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
        var _a, _b, _c, _d, _e, _f;
        try {
            const { name, parentId } = req.body || {};
            if (!name || String(name).trim() === "") {
                return res.status(400).json({ error: "Name is required" });
            }
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            const payload = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: String(name).trim(),
                parentId: parentId === "root" || !parentId ? null : parentId,
                domain: req.userDomain,
                workspaceId: currentWorkspace,
                ownerUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
            };
            const dir = new Directory_1.Directory(payload);
            await dir.save();
            await (0, events_1.publishEvent)({
                actorUserId: (_f = (_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d._id) === null || _e === void 0 ? void 0 : _e.toString) === null || _f === void 0 ? void 0 : _f.call(_e),
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
            const currentWorkspace = req.currentWorkspace || req.userDomain;
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
        var _a;
        try {
            const parentId = req.params.id === "root" ? null : req.params.id;
            const { includeDeleted, page, pageSize, sort, order } = (req.query ||
                {});
            // Get current workspace from request
            const currentWorkspace = req.currentWorkspace || req.userDomain;
            // Get the workspace to determine the correct domain
            // For cross-domain users, req.userDomain is set to workspace domain by middleware
            // But we should verify by getting the workspace
            const workspace = await Workspace_1.Workspace.findOne({ workspaceId: currentWorkspace });
            const workspaceDomain = (workspace === null || workspace === void 0 ? void 0 : workspace.domain) || req.userDomain || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.domain);
            // Use workspace domain for queries (directories and documents are stored with workspace domain)
            const filter = {
                domain: workspaceDomain,
                workspaceId: currentWorkspace,
                parentId,
            };
            const dirs = await Directory_1.Directory.find(filter).sort({ name: 1 });
            // Documents under this directory
            const docFilter = {
                domain: workspaceDomain,
                workspaceId: currentWorkspace,
            };
            docFilter.directoryId = parentId;
            // Sorting
            const sortKey = sort === "uploadedAt" ? "uploadedAt" : "name";
            const sortDir = (order || "asc").toLowerCase() === "desc" ? -1 : 1;
            const docs = await Document_1.Document.find(docFilter).sort({ [sortKey]: sortDir });
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
            const currentWorkspace = req.currentWorkspace || req.userDomain;
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
            const currentWorkspace = req.currentWorkspace || req.userDomain;
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
