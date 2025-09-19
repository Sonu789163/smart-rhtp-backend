"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceController = void 0;
const Workspace_1 = require("../models/Workspace");
const User_1 = require("../models/User");
function generateWorkspaceId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function toSlug(input) {
    return (input || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}
exports.workspaceController = {
    // Create a new workspace under current user's domain (admin only)
    async create(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { name, slug: rawSlug } = req.body;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin") {
                return res.status(403).json({ message: "Only domain admins can create workspaces" });
            }
            if (!name || name.trim().length < 2) {
                return res.status(400).json({ message: "Workspace name is required" });
            }
            const baseSlug = toSlug(rawSlug || name);
            if (!baseSlug) {
                return res.status(400).json({ message: "Invalid workspace slug" });
            }
            // Ensure slug uniqueness within the same domain
            const existing = await Workspace_1.Workspace.findOne({ domain, slug: baseSlug });
            if (existing) {
                return res.status(400).json({ message: "A workspace with this URL already exists" });
            }
            const workspaceId = generateWorkspaceId();
            const workspace = new Workspace_1.Workspace({
                workspaceId,
                domain,
                name: name.trim(),
                slug: baseSlug,
                ownerId: user._id,
                admins: [user._id]
            });
            await workspace.save();
            // Add to creator's accessibleWorkspaces if not present
            const creator = await User_1.User.findById(user._id);
            if (creator) {
                const already = (creator.accessibleWorkspaces || []).some((ws) => (ws.workspaceDomain || "").toLowerCase() === baseSlug.toLowerCase());
                if (!already) {
                    creator.accessibleWorkspaces = creator.accessibleWorkspaces || [];
                    creator.accessibleWorkspaces.push({
                        workspaceDomain: baseSlug,
                        workspaceName: name.trim(),
                        role: "user",
                        allowedTimeBuckets: ["all"],
                        extraDocumentIds: [],
                        blockedDocumentIds: [],
                        invitedBy: user._id,
                        joinedAt: new Date(),
                        isActive: true
                    });
                    await creator.save();
                }
            }
            return res.status(201).json({ workspace });
        }
        catch (error) {
            console.error("Create workspace error:", error);
            return res.status(500).json({ message: "Failed to create workspace" });
        }
    },
    // List members of a workspace (by workspaceId within current domain)
    async listMembers(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { workspaceId } = req.params;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin")
                return res.status(403).json({ message: "Only domain admins can view members" });
            let slug;
            if (workspaceId === 'default') {
                slug = String(domain);
            }
            else {
                const workspace = await Workspace_1.Workspace.findOne({ workspaceId, domain });
                if (!workspace)
                    return res.status(404).json({ message: "Workspace not found" });
                slug = workspace.slug;
            }
            const members = await User_1.User.find({
                domain,
                accessibleWorkspaces: { $elemMatch: { workspaceDomain: slug, isActive: true } },
            }).select("_id name email status role");
            return res.json({ members });
        }
        catch (error) {
            console.error("List members error:", error);
            return res.status(500).json({ message: "Failed to list members" });
        }
    },
    // Add a member to workspace (by userId or email)
    async addMember(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { workspaceId } = req.params;
            const { userId, email } = req.body;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin")
                return res.status(403).json({ message: "Only domain admins can add members" });
            let slug;
            let workspaceName = '';
            if (workspaceId === 'default') {
                slug = String(domain);
                workspaceName = `${domain} Workspace`;
            }
            else {
                const workspace = await Workspace_1.Workspace.findOne({ workspaceId, domain });
                if (!workspace)
                    return res.status(404).json({ message: "Workspace not found" });
                slug = workspace.slug;
                workspaceName = workspace.name;
            }
            const target = await User_1.User.findOne(userId ? { _id: userId } : { email: email });
            if (!target)
                return res.status(404).json({ message: "User not found" });
            if (target.domain !== domain) {
                return res.status(400).json({ message: "User does not belong to this domain" });
            }
            target.accessibleWorkspaces = target.accessibleWorkspaces || [];
            const existingIdx = target.accessibleWorkspaces.findIndex((w) => (w.workspaceDomain || '').toLowerCase() === slug.toLowerCase());
            if (existingIdx >= 0) {
                target.accessibleWorkspaces[existingIdx].isActive = true;
                target.accessibleWorkspaces[existingIdx].workspaceName = workspaceName;
            }
            else {
                target.accessibleWorkspaces.push({
                    workspaceDomain: slug,
                    workspaceName,
                    role: "user",
                    allowedTimeBuckets: ["all"],
                    extraDocumentIds: [],
                    blockedDocumentIds: [],
                    invitedBy: user._id,
                    joinedAt: new Date(),
                    isActive: true,
                });
            }
            await target.save();
            return res.json({ message: "User added to workspace" });
        }
        catch (error) {
            console.error("Add member error:", error);
            return res.status(500).json({ message: "Failed to add member" });
        }
    },
    // Remove a member from workspace (hard-remove entry)
    async removeMember(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { workspaceId, memberId } = req.params;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin")
                return res.status(403).json({ message: "Only domain admins can remove members" });
            let slug;
            if (workspaceId === 'default') {
                slug = String(domain);
            }
            else {
                const workspace = await Workspace_1.Workspace.findOne({ workspaceId, domain });
                if (!workspace)
                    return res.status(404).json({ message: "Workspace not found" });
                slug = workspace.slug;
            }
            const target = await User_1.User.findOne({ _id: memberId, domain });
            if (!target)
                return res.status(404).json({ message: "User not found" });
            target.accessibleWorkspaces = target.accessibleWorkspaces || [];
            target.accessibleWorkspaces = target.accessibleWorkspaces.filter((w) => (w.workspaceDomain || '').toLowerCase() !== slug.toLowerCase());
            // If the user was currently in this workspace, switch them back to their default (primary domain)
            if (String(target.currentWorkspace || '').toLowerCase() === String(slug).toLowerCase()) {
                target.currentWorkspace = target.domain;
            }
            // Ensure the primary domain is present in accessibleWorkspaces and active
            const primaryDomain = String(target.domain || '').toLowerCase();
            const hasPrimary = target.accessibleWorkspaces.some((w) => String(w.workspaceDomain || '').toLowerCase() === primaryDomain);
            if (!hasPrimary && primaryDomain) {
                target.accessibleWorkspaces.push({
                    workspaceDomain: target.domain,
                    workspaceName: `${target.domain} Workspace`,
                    role: 'user',
                    allowedTimeBuckets: ['all'],
                    extraDocumentIds: [],
                    blockedDocumentIds: [],
                    invitedBy: user._id,
                    joinedAt: new Date(),
                    isActive: true,
                });
            }
            await target.save();
            return res.json({ message: "User removed from workspace" });
        }
        catch (error) {
            console.error("Remove member error:", error);
            return res.status(500).json({ message: "Failed to remove member" });
        }
    },
    // List all workspaces for current domain (admin only)
    async list(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin") {
                return res.status(403).json({ message: "Only domain admins can view domain workspaces" });
            }
            const workspaces = await Workspace_1.Workspace.find({ domain, status: { $ne: "archived" } }).sort({ createdAt: -1 });
            return res.json({ workspaces });
        }
        catch (error) {
            console.error("List workspaces error:", error);
            return res.status(500).json({ message: "Failed to list workspaces" });
        }
    },
    // Update workspace (name/settings) - admin of domain
    async update(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { workspaceId } = req.params;
            const updates = req.body || {};
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin") {
                return res.status(403).json({ message: "Only domain admins can update workspaces" });
            }
            const workspace = await Workspace_1.Workspace.findOne({ workspaceId, domain });
            if (!workspace)
                return res.status(404).json({ message: "Workspace not found" });
            if (typeof updates.name === "string" && updates.name.trim().length >= 2) {
                workspace.name = updates.name.trim();
            }
            if (updates.settings && typeof updates.settings === "object") {
                workspace.settings = { ...workspace.settings, ...updates.settings };
            }
            if (typeof updates.status === "string") {
                workspace.status = updates.status;
            }
            await workspace.save();
            return res.json({ workspace });
        }
        catch (error) {
            console.error("Update workspace error:", error);
            return res.status(500).json({ message: "Failed to update workspace" });
        }
    },
    // Archive a workspace - admin of domain
    async archive(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { workspaceId } = req.params;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin") {
                return res.status(403).json({ message: "Only domain admins can archive workspaces" });
            }
            const workspace = await Workspace_1.Workspace.findOneAndUpdate({ workspaceId, domain }, { status: "archived" }, { new: true });
            if (!workspace)
                return res.status(404).json({ message: "Workspace not found" });
            return res.json({ message: "Workspace archived", workspace });
        }
        catch (error) {
            console.error("Archive workspace error:", error);
            return res.status(500).json({ message: "Failed to archive workspace" });
        }
    }
};
