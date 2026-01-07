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
exports.shareController = void 0;
const SharePermission_1 = require("../models/SharePermission");
const User_1 = require("../models/User");
const Directory_1 = require("../models/Directory");
const Document_1 = require("../models/Document");
const Workspace_1 = require("../models/Workspace");
const events_1 = require("../lib/events");
const emailService_1 = require("../services/emailService");
function generateId(prefix = "shr") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function generateToken() {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}
exports.shareController = {
    async list(req, res) {
        try {
            const { resourceType, resourceId } = req.query;
            if (!resourceType || !resourceId) {
                return res.status(400).json({ error: "resourceType and resourceId are required" });
            }
            const items = await SharePermission_1.SharePermission.find({
                domain: req.userDomain,
                resourceType,
                resourceId,
            }).sort({ createdAt: -1 });
            res.json(items);
        }
        catch (err) {
            res.status(500).json({ error: "Failed to list shares" });
        }
    },
    async create(req, res) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const { resourceType, resourceId, scope, principalId, role, expiresAt, invitedEmail } = req.body || {};
            if (!resourceType || !resourceId || !scope || !role) {
                return res.status(400).json({ error: "Missing required fields" });
            }
            // For user scope, allow email-based sharing (cross-domain)
            let finalPrincipalId = principalId;
            let finalInvitedEmail = invitedEmail;
            if (scope === "user") {
                // If email is provided but no principalId, try to find user by email (cross-domain)
                if (invitedEmail && !principalId) {
                    const userByEmail = await User_1.User.findOne({
                        email: invitedEmail.toLowerCase().trim()
                    }).select("_id email domain");
                    if (userByEmail) {
                        finalPrincipalId = userByEmail._id.toString();
                        finalInvitedEmail = userByEmail.email;
                    }
                    else {
                        // User doesn't exist yet, but we'll store the email for future reference
                        // This allows sharing with users who haven't signed up yet
                        finalInvitedEmail = invitedEmail.toLowerCase().trim();
                    }
                }
                else if (principalId && !invitedEmail) {
                    // If principalId is provided, get the email
                    const userById = await User_1.User.findById(principalId).select("email");
                    if (userById) {
                        finalInvitedEmail = userById.email;
                    }
                }
                // Validate that we have either principalId or invitedEmail
                if (!finalPrincipalId && !finalInvitedEmail) {
                    return res.status(400).json({ error: "Either principalId or invitedEmail is required for user scope" });
                }
            }
            else if (scope === "workspace") {
                if (!principalId) {
                    return res.status(400).json({ error: "principalId (workspaceId) is required for workspace scope" });
                }
            }
            const payload = {
                id: generateId(),
                resourceType,
                resourceId,
                domain: req.userDomain, // Resource domain (where the resource is located)
                scope,
                principalId: finalPrincipalId || null,
                role,
                invitedEmail: finalInvitedEmail || null,
                createdBy: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
            };
            if (expiresAt)
                payload.expiresAt = new Date(expiresAt);
            const share = new SharePermission_1.SharePermission(payload);
            await share.save();
            // For directory sharing to cross-domain users, create directory in recipient's workspace
            if (resourceType === "directory" && scope === "user" && finalInvitedEmail) {
                try {
                    // Find recipient user
                    const recipientUser = finalPrincipalId
                        ? await User_1.User.findById(finalPrincipalId)
                        : await User_1.User.findOne({ email: finalInvitedEmail.toLowerCase().trim() });
                    if (recipientUser) {
                        // Get original directory details
                        const originalDirectory = await Directory_1.Directory.findOne({
                            id: resourceId,
                            domain: req.userDomain
                        });
                        if (originalDirectory) {
                            // Get recipient's domain and workspace
                            const recipientDomain = recipientUser.domain;
                            const recipientDomainId = recipientUser.domainId;
                            // Get recipient's current workspace or default workspace
                            let recipientWorkspaceId = recipientUser.currentWorkspace;
                            // If no current workspace, find their first workspace
                            if (!recipientWorkspaceId) {
                                const { WorkspaceMembership } = await Promise.resolve().then(() => __importStar(require("../models/WorkspaceMembership")));
                                const firstMembership = await WorkspaceMembership.findOne({
                                    userId: recipientUser._id,
                                    status: "active"
                                }).sort({ joinedAt: 1 });
                                if (firstMembership) {
                                    recipientWorkspaceId = firstMembership.workspaceId;
                                }
                                else {
                                    // If no workspace membership, find or create default workspace
                                    const defaultWorkspace = await Workspace_1.Workspace.findOne({
                                        domain: recipientDomain,
                                        status: "active"
                                    }).sort({ createdAt: 1 });
                                    if (defaultWorkspace) {
                                        recipientWorkspaceId = defaultWorkspace.workspaceId;
                                    }
                                    else {
                                        console.log(`[shareController] No workspace found for recipient ${finalInvitedEmail}, directory share will be available when they create/join a workspace`);
                                        // Continue without creating directory - it will be created when they access it
                                    }
                                }
                            }
                            // Create directory in recipient's workspace if workspace exists
                            if (recipientWorkspaceId) {
                                // Check if shared directory already exists
                                const existingSharedDir = await Directory_1.Directory.findOne({
                                    sharedFromDirectoryId: resourceId,
                                    sharedWithUserId: recipientUser._id.toString(),
                                    workspaceId: recipientWorkspaceId,
                                });
                                if (!existingSharedDir) {
                                    // Create new directory in recipient's workspace
                                    const sharedDirectoryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                                    const sharedDirectory = new Directory_1.Directory({
                                        id: sharedDirectoryId,
                                        name: originalDirectory.name,
                                        normalizedName: originalDirectory.normalizedName || originalDirectory.name.toLowerCase().trim(),
                                        parentId: null, // Top-level in recipient's workspace
                                        domain: recipientDomain,
                                        domainId: recipientDomainId,
                                        workspaceId: recipientWorkspaceId,
                                        ownerUserId: recipientUser._id.toString(),
                                        documentCount: 0,
                                        drhpCount: 0,
                                        rhpCount: 0,
                                        // Mark as shared directory
                                        sharedFromDirectoryId: resourceId,
                                        sharedFromDomain: req.userDomain,
                                        sharedFromWorkspaceId: originalDirectory.workspaceId,
                                        sharedWithUserId: recipientUser._id.toString(),
                                        isShared: true,
                                    });
                                    await sharedDirectory.save();
                                    console.log(`✅ Created shared directory ${sharedDirectoryId} in recipient workspace ${recipientWorkspaceId} for user ${finalInvitedEmail}`);
                                }
                                else {
                                    console.log(`[shareController] Shared directory already exists for ${finalInvitedEmail}`);
                                }
                            }
                        }
                    }
                    else {
                        console.log(`[shareController] Recipient user not found for ${finalInvitedEmail}, directory will be created when they sign up`);
                    }
                }
                catch (dirError) {
                    // Don't fail the share creation if directory creation fails
                    console.error("Failed to create directory in recipient workspace:", dirError);
                }
            }
            // Send email notification if sharing with an email address (cross-domain or new user)
            if (scope === "user" && finalInvitedEmail) {
                try {
                    // Get resource name
                    let resourceName = resourceId;
                    if (resourceType === "directory") {
                        const directory = await Directory_1.Directory.findOne({ id: resourceId, domain: req.userDomain });
                        resourceName = (directory === null || directory === void 0 ? void 0 : directory.name) || resourceId;
                    }
                    else if (resourceType === "document") {
                        const document = await Document_1.Document.findOne({ _id: resourceId, domain: req.userDomain });
                        resourceName = (document === null || document === void 0 ? void 0 : document.namespace) || (document === null || document === void 0 ? void 0 : document.name) || resourceId;
                    }
                    // Get sharer info
                    const sharer = await User_1.User.findById((_d = req.user) === null || _d === void 0 ? void 0 : _d._id).select("name email domain");
                    const sharerName = (sharer === null || sharer === void 0 ? void 0 : sharer.name) || (sharer === null || sharer === void 0 ? void 0 : sharer.email) || "A user";
                    const sharerDomain = (sharer === null || sharer === void 0 ? void 0 : sharer.domain) || req.userDomain || "unknown";
                    // Get workspace info if available
                    const currentWorkspace = req.currentWorkspace;
                    let workspaceName = null;
                    if (currentWorkspace) {
                        const workspace = await Workspace_1.Workspace.findOne({ workspaceId: currentWorkspace });
                        workspaceName = (workspace === null || workspace === void 0 ? void 0 : workspace.name) || null;
                    }
                    // Get base URL from environment or construct it
                    const baseUrl = process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";
                    const dashboardUrl = `${baseUrl}/dashboard`;
                    const signupUrl = `${baseUrl}/login`;
                    await (0, emailService_1.sendEmail)({
                        to: finalInvitedEmail,
                        subject: `${sharerName} shared a ${resourceType === "directory" ? "directory" : "document"} with you`,
                        template: "directory-share",
                        data: {
                            sharerName,
                            sharerDomain,
                            resourceType,
                            resourceName,
                            resourceId,
                            role,
                            workspaceName,
                            dashboardUrl,
                            signupUrl,
                        },
                    });
                    console.log(`✅ Email notification sent to ${finalInvitedEmail} for ${resourceType} share`);
                }
                catch (emailError) {
                    // Don't fail the share creation if email fails
                    console.error("Failed to send share notification email:", emailError);
                }
            }
            await (0, events_1.publishEvent)({
                actorUserId: (_g = (_f = (_e = req.user) === null || _e === void 0 ? void 0 : _e._id) === null || _f === void 0 ? void 0 : _f.toString) === null || _g === void 0 ? void 0 : _g.call(_f),
                domain: req.userDomain,
                action: "share.granted",
                resourceType: resourceType,
                resourceId: resourceId,
                title: `Share granted: ${role}`,
            });
            res.status(201).json(share);
        }
        catch (err) {
            console.error("Error creating share:", err);
            res.status(500).json({ error: err.message || "Failed to create share" });
        }
    },
    async revoke(req, res) {
        var _a, _b, _c;
        try {
            const { id } = req.params;
            const toDelete = await SharePermission_1.SharePermission.findOne({ id, domain: req.userDomain });
            const deleted = await SharePermission_1.SharePermission.deleteOne({ id, domain: req.userDomain });
            if (deleted.deletedCount === 0) {
                return res.status(404).json({ error: "Share not found" });
            }
            if (toDelete) {
                await (0, events_1.publishEvent)({
                    actorUserId: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                    domain: req.userDomain,
                    action: "share.revoked",
                    resourceType: toDelete.resourceType,
                    resourceId: toDelete.resourceId,
                    title: `Share revoked`,
                });
            }
            res.json({ message: "Share revoked" });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to revoke share" });
        }
    },
    async linkCreateOrRotate(req, res) {
        var _a, _b, _c, _d, _e, _f;
        try {
            const { resourceType, resourceId, role, expiresAt } = req.body || {};
            if (!resourceType || !resourceId || !role) {
                return res.status(400).json({ error: "Missing required fields" });
            }
            // Upsert one link per resource/domain
            const token = generateToken();
            const update = {
                id: generateId("lnk"),
                resourceType,
                resourceId,
                domain: req.userDomain,
                scope: "link",
                role,
                linkToken: token,
                createdBy: (_c = (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b),
                expiresAt: expiresAt ? new Date(expiresAt) : null,
            };
            const link = await SharePermission_1.SharePermission.findOneAndUpdate({ domain: req.userDomain, resourceType, resourceId, scope: "link" }, update, { new: true, upsert: true, setDefaultsOnInsert: true });
            await (0, events_1.publishEvent)({
                actorUserId: (_f = (_e = (_d = req.user) === null || _d === void 0 ? void 0 : _d._id) === null || _e === void 0 ? void 0 : _e.toString) === null || _f === void 0 ? void 0 : _f.call(_e),
                domain: req.userDomain,
                action: "share.link.rotated",
                resourceType,
                resourceId,
                title: `Share link created/rotated`,
            });
            res.json({ token: link.linkToken });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to create link" });
        }
    },
    async linkResolve(req, res) {
        try {
            const { token } = req.params;
            // Find any domain link (domain-agnostic resolve by token)
            const link = await SharePermission_1.SharePermission.findOne({ scope: "link", linkToken: token });
            if (!link) {
                return res.status(404).json({ error: "Invalid link" });
            }
            if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
                return res.status(410).json({ error: "Link expired" });
            }
            res.json({
                resourceType: link.resourceType,
                resourceId: link.resourceId,
                role: link.role,
                domain: link.domain,
            });
        }
        catch (err) {
            res.status(500).json({ error: "Failed to resolve link" });
        }
    },
};
