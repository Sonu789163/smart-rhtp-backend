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
exports.workspaceController = void 0;
const Workspace_1 = require("../models/Workspace");
const User_1 = require("../models/User");
const WorkspaceMembership_1 = require("../models/WorkspaceMembership");
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
    // Check if admin user needs to create workspace (first-login check)
    async checkFirstLogin(req, res) {
        try {
            const user = req.user;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            // Only admins can create workspaces
            if (user.role !== "admin") {
                return res.json({ needsWorkspace: false, isAdmin: false, isNewDomain: false });
            }
            const domain = req.userDomain || user.domain;
            // Check if this is a NEW domain (domain has no workspaces yet)
            const domainWorkspacesCount = await Workspace_1.Workspace.countDocuments({
                domain,
                status: "active",
            });
            // Check if user has any workspace memberships (via new system)
            const memberships = await WorkspaceMembership_1.WorkspaceMembership.find({
                userId: user._id,
                status: "active",
            });
            // Check if user has any legacy accessibleWorkspaces
            const hasLegacyWorkspaces = (user.accessibleWorkspaces || []).some((ws) => ws.isActive !== false);
            const hasWorkspace = memberships.length > 0 || hasLegacyWorkspaces;
            const isNewDomain = domainWorkspacesCount === 0;
            // Show modal only for new domain admin on first login (no workspaces in domain AND user has no workspace access)
            const needsWorkspace = isNewDomain && !hasWorkspace;
            return res.json({
                needsWorkspace,
                isAdmin: user.role === "admin",
                isNewDomain,
            });
        }
        catch (error) {
            console.error("Check first login error:", error);
            return res.status(500).json({ message: "Failed to check first login" });
        }
    },
    // Create a new workspace under current user's domain (admin only)
    async create(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { name, slug: rawSlug, description } = req.body;
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
            // Get user's domainId
            const userWithDomain = await User_1.User.findById(user._id).select("domainId");
            if (!(userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId)) {
                return res.status(400).json({ message: "User domainId not found. Please contact administrator." });
            }
            const workspaceId = generateWorkspaceId();
            const workspace = new Workspace_1.Workspace({
                workspaceId,
                domain,
                domainId: userWithDomain.domainId, // Link to Domain schema
                name: name.trim(),
                slug: baseSlug,
                description: (description === null || description === void 0 ? void 0 : description.trim()) || undefined,
                ownerId: user._id,
                admins: [user._id],
            });
            await workspace.save();
            // Check if this is the first workspace in the domain
            const workspaceCount = await Workspace_1.Workspace.countDocuments({
                domainId: userWithDomain.domainId,
                status: "active",
            });
            const isFirstWorkspace = workspaceCount === 1;
            // Create workspace membership for creator (as admin)
            const membership = new WorkspaceMembership_1.WorkspaceMembership({
                userId: user._id,
                workspaceId: workspace.workspaceId,
                role: "admin",
                invitedBy: user._id,
                joinedAt: new Date(),
                status: "active",
            });
            await membership.save();
            // If this is the first workspace, grant access to ALL users in the domain
            if (isFirstWorkspace) {
                const allDomainUsers = await User_1.User.find({
                    domainId: userWithDomain.domainId,
                    status: "active",
                });
                for (const domainUser of allDomainUsers) {
                    // Skip creator (already has membership)
                    if (domainUser._id.toString() === user._id.toString())
                        continue;
                    // Check if membership already exists
                    const existingMembership = await WorkspaceMembership_1.WorkspaceMembership.findOne({
                        userId: domainUser._id,
                        workspaceId: workspace.workspaceId,
                    });
                    if (!existingMembership) {
                        const userMembership = new WorkspaceMembership_1.WorkspaceMembership({
                            userId: domainUser._id,
                            workspaceId: workspace.workspaceId,
                            role: "member",
                            invitedBy: user._id,
                            joinedAt: new Date(),
                            status: "active",
                        });
                        await userMembership.save();
                    }
                }
                console.log(`✅ First workspace created - granted access to ${allDomainUsers.length} users in domain`);
            }
            // Update user's currentWorkspace if they don't have one
            const updatedUser = await User_1.User.findById(user._id);
            if (updatedUser && !updatedUser.currentWorkspace) {
                updatedUser.currentWorkspace = workspace.workspaceId;
                await updatedUser.save();
            }
            return res.status(201).json({ workspace, isFirstWorkspace });
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
            const nameUpdated = typeof updates.name === "string" && updates.name.trim().length >= 2;
            if (nameUpdated) {
                workspace.name = updates.name.trim();
            }
            if (updates.settings && typeof updates.settings === "object") {
                workspace.settings = { ...workspace.settings, ...updates.settings };
            }
            if (typeof updates.status === "string") {
                workspace.status = updates.status;
            }
            await workspace.save();
            // Update workspace name in all users' accessibleWorkspaces
            if (nameUpdated) {
                await User_1.User.updateMany({
                    domain,
                    "accessibleWorkspaces.workspaceDomain": workspace.slug
                }, {
                    $set: {
                        "accessibleWorkspaces.$.workspaceName": workspace.name
                    }
                });
            }
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
    },
    // Move a document from current workspace to target workspace (admin only)
    async moveDocument(req, res) {
        try {
            const user = req.user;
            const domain = req.userDomain || (user === null || user === void 0 ? void 0 : user.domain);
            const { workspaceId } = req.params;
            const { documentId, targetWorkspaceId } = req.body;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            if (user.role !== "admin") {
                return res.status(403).json({ message: "Only admins can move documents" });
            }
            if (!documentId || !targetWorkspaceId) {
                return res.status(400).json({
                    message: "documentId and targetWorkspaceId are required",
                });
            }
            // Verify both workspaces exist and belong to same domain
            const sourceWorkspace = await Workspace_1.Workspace.findOne({
                workspaceId,
                domain,
            });
            const targetWorkspace = await Workspace_1.Workspace.findOne({
                workspaceId: targetWorkspaceId,
                domain,
            });
            if (!sourceWorkspace) {
                return res.status(404).json({ message: "Source workspace not found" });
            }
            if (!targetWorkspace) {
                return res.status(404).json({ message: "Target workspace not found" });
            }
            // Import Document model
            const { Document } = await Promise.resolve().then(() => __importStar(require("../models/Document")));
            // Find document and verify it exists in source workspace
            const document = await Document.findOne({
                id: documentId,
                domain,
                workspaceId,
            });
            if (!document) {
                return res.status(404).json({
                    message: "Document not found in source workspace",
                });
            }
            // Check for duplicate in target workspace
            const duplicate = await Document.findOne({
                workspaceId: targetWorkspaceId,
                namespace: document.namespace,
            }).collation({ locale: "en", strength: 2 });
            if (duplicate && duplicate.id !== document.id) {
                return res.status(409).json({
                    message: "Document with this name already exists in target workspace",
                });
            }
            // Move document
            document.workspaceId = targetWorkspaceId;
            // If document has directoryId, check if directory needs to move too
            // For simplicity, we'll move the document and its directory to target workspace
            if (document.directoryId) {
                const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
                const directory = await Directory.findOne({
                    id: document.directoryId,
                    domain,
                    workspaceId,
                });
                if (directory) {
                    directory.workspaceId = targetWorkspaceId;
                    await directory.save();
                }
            }
            await document.save();
            return res.json({
                message: "Document moved successfully",
                document,
                targetWorkspace: {
                    workspaceId: targetWorkspace.workspaceId,
                    name: targetWorkspace.name,
                },
            });
        }
        catch (error) {
            console.error("Move document error:", error);
            return res.status(500).json({ message: "Failed to move document" });
        }
    },
    // Get user's workspaces via membership
    // Migrate legacy accessibleWorkspaces to WorkspaceMembership (one-time migration)
    async migrateLegacyWorkspaces(req, res) {
        try {
            const user = req.user;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            // Only admins can run migration
            if (user.role !== "admin") {
                return res.status(403).json({ message: "Only admins can run migration" });
            }
            const { User } = await Promise.resolve().then(() => __importStar(require("../models/User")));
            const { WorkspaceMembership } = await Promise.resolve().then(() => __importStar(require("../models/WorkspaceMembership")));
            const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
            // Find all users with legacy accessibleWorkspaces
            const usersWithLegacy = await User.find({
                accessibleWorkspaces: { $exists: true, $ne: [] },
            });
            let migrated = 0;
            let skipped = 0;
            const errors = [];
            for (const legacyUser of usersWithLegacy) {
                const legacyWorkspaces = (legacyUser.accessibleWorkspaces || []).filter((ws) => ws.isActive !== false);
                for (const legacyWs of legacyWorkspaces) {
                    try {
                        // Check if membership already exists
                        const existingMembership = await WorkspaceMembership.findOne({
                            userId: legacyUser._id,
                            workspaceId: legacyWs.workspaceDomain,
                        });
                        if (existingMembership) {
                            skipped++;
                            continue;
                        }
                        // Try to find workspace by slug (legacy system used slug as workspaceDomain)
                        let workspace = await Workspace.findOne({
                            domain: legacyUser.domain,
                            slug: legacyWs.workspaceDomain,
                            status: "active",
                        });
                        // If not found by slug, check if workspaceDomain is actually a workspaceId
                        if (!workspace) {
                            workspace = await Workspace.findOne({
                                workspaceId: legacyWs.workspaceDomain,
                                status: "active",
                            });
                        }
                        // If workspace doesn't exist in DB, we can still create membership with the slug as workspaceId
                        // This maintains backward compatibility
                        const workspaceId = (workspace === null || workspace === void 0 ? void 0 : workspace.workspaceId) || legacyWs.workspaceDomain;
                        // Map legacy role to membership role
                        let membershipRole = "member";
                        if (legacyWs.role === "viewer") {
                            membershipRole = "viewer";
                        }
                        else if (legacyWs.role === "editor") {
                            membershipRole = "member";
                        }
                        // Create membership
                        const membership = new WorkspaceMembership({
                            userId: legacyUser._id,
                            workspaceId,
                            role: membershipRole,
                            invitedBy: legacyWs.invitedBy || legacyUser._id,
                            joinedAt: legacyWs.joinedAt || new Date(),
                            status: "active",
                        });
                        await membership.save();
                        migrated++;
                        // Update user's currentWorkspace if needed (use workspaceId if workspace exists)
                        if (!legacyUser.currentWorkspace || legacyUser.currentWorkspace === legacyWs.workspaceDomain) {
                            legacyUser.currentWorkspace = workspaceId;
                            await legacyUser.save();
                        }
                    }
                    catch (error) {
                        errors.push(`User ${legacyUser.email}, workspace ${legacyWs.workspaceDomain}: ${error.message}`);
                    }
                }
            }
            return res.json({
                message: "Migration completed",
                stats: {
                    usersProcessed: usersWithLegacy.length,
                    membershipsCreated: migrated,
                    membershipsSkipped: skipped,
                    errors: errors.length,
                },
                errors: errors.slice(0, 10), // Return first 10 errors
            });
        }
        catch (error) {
            console.error("Migration error:", error);
            return res.status(500).json({ message: "Migration failed", error: String(error) });
        }
    },
    async getMyWorkspaces(req, res) {
        try {
            const user = req.user;
            if (!user)
                return res.status(401).json({ message: "Unauthorized" });
            const memberships = await WorkspaceMembership_1.WorkspaceMembership.find({
                userId: user._id,
                status: "active",
            }).populate("userId", "name email");
            const workspaceIds = memberships.map((m) => m.workspaceId);
            const workspaces = await Workspace_1.Workspace.find({
                workspaceId: { $in: workspaceIds },
                status: "active",
            });
            const workspacesWithRole = workspaces.map((ws) => {
                const membership = memberships.find((m) => m.workspaceId === ws.workspaceId);
                return {
                    workspaceId: ws.workspaceId,
                    name: ws.name,
                    slug: ws.slug,
                    description: ws.description,
                    domain: ws.domain,
                    role: (membership === null || membership === void 0 ? void 0 : membership.role) || "member",
                    joinedAt: membership === null || membership === void 0 ? void 0 : membership.joinedAt,
                };
            });
            return res.json({ workspaces: workspacesWithRole });
        }
        catch (error) {
            console.error("Get my workspaces error:", error);
            return res.status(500).json({ message: "Failed to get workspaces" });
        }
    },
};
