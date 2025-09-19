"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceInvitationController = void 0;
const User_1 = require("../models/User");
const WorkspaceInvitation_1 = require("../models/WorkspaceInvitation");
const emailService_1 = require("../services/emailService");
exports.workspaceInvitationController = {
    // Send workspace invitation
    async sendInvitation(req, res) {
        try {
            const { inviteeEmail, inviteeName, invitedRole = "user", message, allowedTimeBuckets, } = req.body;
            const inviterId = req.user._id;
            const workspaceDomain = req.userDomain;
            // Validate required fields
            if (!inviteeEmail) {
                return res.status(400).json({ message: "Invitee email is required" });
            }
            // Check if inviter is admin of the workspace
            if (req.user.role !== "admin") {
                return res.status(403).json({
                    message: "Only workspace admins can send invitations",
                });
            }
            // Check if user is trying to invite themselves
            if (inviteeEmail === req.user.email) {
                return res.status(400).json({
                    message: "You cannot invite yourself",
                });
            }
            // Check if user already exists and has access to this workspace
            const existingUser = await User_1.User.findOne({ email: inviteeEmail });
            if (existingUser) {
                const hasAccess = existingUser.accessibleWorkspaces.some((ws) => ws.workspaceDomain === workspaceDomain && ws.isActive);
                if (hasAccess) {
                    return res.status(400).json({
                        message: "User already has access to this workspace",
                    });
                }
            }
            // Check for existing pending invitation
            const existingInvitation = await WorkspaceInvitation_1.WorkspaceInvitation.findOne({
                inviteeEmail: inviteeEmail.toLowerCase(),
                workspaceDomain,
                status: "pending",
            });
            if (existingInvitation) {
                return res.status(400).json({
                    message: "A pending invitation already exists for this email",
                });
            }
            // Create invitation
            const invitationId = `inv_${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}`;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry
            const invitation = new WorkspaceInvitation_1.WorkspaceInvitation({
                invitationId,
                inviterId,
                inviterEmail: req.user.email,
                inviterName: req.user.name,
                inviteeEmail: inviteeEmail.toLowerCase(),
                inviteeName: inviteeName || inviteeEmail.split("@")[0],
                workspaceDomain,
                workspaceName: `${workspaceDomain} Workspace`, // You can customize this
                invitedRole,
                message,
                expiresAt,
                // Persist desired time-bucket permissions on invitation
                allowedTimeBuckets: Array.isArray(allowedTimeBuckets) && allowedTimeBuckets.length
                    ? allowedTimeBuckets
                    : ["today"],
            });
            await invitation.save();
            // Send invitation email
            try {
                await sendInvitationEmail(invitation);
                invitation.emailSent = true;
                invitation.emailSentAt = new Date();
                await invitation.save();
            }
            catch (emailError) {
                console.error("Failed to send invitation email:", emailError);
                // Don't fail the request if email fails
            }
            res.status(201).json({
                message: "Invitation sent successfully",
                invitation: {
                    id: invitation._id,
                    invitationId: invitation.invitationId,
                    inviteeEmail: invitation.inviteeEmail,
                    invitedRole: invitation.invitedRole,
                    expiresAt: invitation.expiresAt,
                },
            });
        }
        catch (error) {
            console.error("Error sending invitation:", error);
            res.status(500).json({ message: "Failed to send invitation" });
        }
    },
    // Get all invitations for a workspace (admin only)
    async getWorkspaceInvitations(req, res) {
        try {
            const workspaceDomain = req.userDomain;
            if (req.user.role !== "admin") {
                return res.status(403).json({
                    message: "Only workspace admins can view invitations",
                });
            }
            const invitations = await WorkspaceInvitation_1.WorkspaceInvitation.find({
                workspaceDomain,
                inviterId: req.user._id,
            })
                .sort({ createdAt: -1 })
                .populate("inviterId", "name email");
            res.json(invitations);
        }
        catch (error) {
            console.error("Error fetching invitations:", error);
            res.status(500).json({ message: "Failed to fetch invitations" });
        }
    },
    // Get invitations sent to a specific email
    async getInvitationsByEmail(req, res) {
        try {
            const { email } = req.params;
            const invitations = await WorkspaceInvitation_1.WorkspaceInvitation.find({
                inviteeEmail: email.toLowerCase(),
                status: "pending",
                expiresAt: { $gt: new Date() },
            })
                .populate("inviterId", "name email")
                .sort({ createdAt: -1 });
            res.json(invitations);
        }
        catch (error) {
            console.error("Error fetching invitations by email:", error);
            res.status(500).json({ message: "Failed to fetch invitations" });
        }
    },
    // Accept invitation
    async acceptInvitation(req, res) {
        var _a, _b;
        try {
            const { invitationId } = req.params;
            const userId = req.user._id;
            // Look up invitation by id first for better error messages
            const invitation = await WorkspaceInvitation_1.WorkspaceInvitation.findOne({
                invitationId,
                status: "pending",
            });
            if (!invitation) {
                return res.status(404).json({
                    message: "Invitation not found or already processed",
                });
            }
            // Ensure the signed-in user matches the invitee
            if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) ||
                req.user.email.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
                return res.status(403).json({
                    message: "This invitation was sent to a different email. Please sign in with the invited email to accept.",
                    invitedEmail: invitation.inviteeEmail,
                });
            }
            if (new Date() > invitation.expiresAt) {
                invitation.status = "expired";
                await invitation.save();
                return res.status(400).json({
                    message: "Invitation has expired",
                });
            }
            // Add workspace access to user
            const user = await User_1.User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            // Check if user already has access (case-insensitive domain check)
            const hasAccess = user.accessibleWorkspaces.some((ws) => (ws.workspaceDomain || "").toLowerCase() ===
                (invitation.workspaceDomain || "").toLowerCase() && ws.isActive);
            if (hasAccess) {
                return res.status(400).json({
                    message: "You already have access to this workspace",
                });
            }
            // Add workspace access
            user.accessibleWorkspaces.push({
                workspaceDomain: invitation.workspaceDomain,
                workspaceName: invitation.workspaceName,
                role: invitation.invitedRole,
                allowedTimeBuckets: ((_b = invitation.allowedTimeBuckets) === null || _b === void 0 ? void 0 : _b.length)
                    ? invitation.allowedTimeBuckets
                    : ["today"],
                extraDocumentIds: [],
                blockedDocumentIds: [],
                invitedBy: invitation.inviterId,
                joinedAt: new Date(),
                isActive: true,
            });
            // De-duplicate any accidental duplicates by domain
            const seen = {};
            user.accessibleWorkspaces = user.accessibleWorkspaces.filter((ws) => {
                const key = (ws.workspaceDomain || "").toLowerCase();
                if (seen[key])
                    return false;
                seen[key] = true;
                return true;
            });
            // Set as current workspace if it's the first one
            if (user.accessibleWorkspaces.length === 1) {
                user.currentWorkspace = invitation.workspaceDomain;
            }
            await user.save();
            // Update invitation status
            invitation.status = "accepted";
            invitation.acceptedAt = new Date();
            await invitation.save();
            res.json({
                message: "Invitation accepted successfully",
                workspace: {
                    domain: invitation.workspaceDomain,
                    name: invitation.workspaceName,
                    role: invitation.invitedRole,
                },
            });
        }
        catch (error) {
            console.error("Error accepting invitation:", error);
            res.status(500).json({ message: "Failed to accept invitation" });
        }
    },
    // Decline invitation
    async declineInvitation(req, res) {
        try {
            const { invitationId } = req.params;
            const invitation = await WorkspaceInvitation_1.WorkspaceInvitation.findOne({
                invitationId,
                inviteeEmail: req.user.email.toLowerCase(),
                status: "pending",
            });
            if (!invitation) {
                return res.status(404).json({
                    message: "Invitation not found or already processed",
                });
            }
            invitation.status = "declined";
            invitation.declinedAt = new Date();
            await invitation.save();
            res.json({ message: "Invitation declined successfully" });
        }
        catch (error) {
            console.error("Error declining invitation:", error);
            res.status(500).json({ message: "Failed to decline invitation" });
        }
    },
    // Cancel invitation (admin only)
    async cancelInvitation(req, res) {
        try {
            const { invitationId } = req.params;
            const workspaceDomain = req.userDomain;
            if (req.user.role !== "admin") {
                return res.status(403).json({
                    message: "Only workspace admins can cancel invitations",
                });
            }
            const invitation = await WorkspaceInvitation_1.WorkspaceInvitation.findOne({
                invitationId,
                workspaceDomain,
                inviterId: req.user._id,
                status: "pending",
            });
            if (!invitation) {
                return res.status(404).json({
                    message: "Invitation not found",
                });
            }
            invitation.status = "cancelled";
            await invitation.save();
            res.json({ message: "Invitation cancelled successfully" });
        }
        catch (error) {
            console.error("Error cancelling invitation:", error);
            res.status(500).json({ message: "Failed to cancel invitation" });
        }
    },
    // Delete invitation record (admin only)
    async deleteInvitation(req, res) {
        try {
            const { invitationId } = req.params;
            const workspaceDomain = req.userDomain;
            if (req.user.role !== "admin") {
                return res.status(403).json({
                    message: "Only workspace admins can delete invitations",
                });
            }
            const invitation = await WorkspaceInvitation_1.WorkspaceInvitation.findOne({
                invitationId,
                workspaceDomain,
                inviterId: req.user._id,
            });
            if (!invitation) {
                return res.status(404).json({ message: "Invitation not found" });
            }
            await WorkspaceInvitation_1.WorkspaceInvitation.deleteOne({ _id: invitation._id });
            res.json({ message: "Invitation deleted" });
        }
        catch (error) {
            console.error("Error deleting invitation:", error);
            res.status(500).json({ message: "Failed to delete invitation" });
        }
    },
    // Get user's accessible workspaces
    async getUserWorkspaces(req, res) {
        try {
            const user = await User_1.User.findById(req.user._id).select("accessibleWorkspaces currentWorkspace");
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json({
                workspaces: user.accessibleWorkspaces.filter((ws) => ws.isActive),
                currentWorkspace: user.currentWorkspace,
            });
        }
        catch (error) {
            console.error("Error fetching user workspaces:", error);
            res.status(500).json({ message: "Failed to fetch workspaces" });
        }
    },
    // Switch workspace
    async switchWorkspace(req, res) {
        try {
            const { workspaceDomain } = req.body;
            const userId = req.user._id;
            const user = await User_1.User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            // Check if user has access to this workspace
            const hasAccess = user.accessibleWorkspaces.some((ws) => ws.workspaceDomain === workspaceDomain && ws.isActive);
            if (!hasAccess) {
                return res.status(403).json({
                    message: "You don't have access to this workspace",
                });
            }
            user.currentWorkspace = workspaceDomain;
            await user.save();
            res.json({
                message: "Workspace switched successfully",
                currentWorkspace: workspaceDomain,
            });
        }
        catch (error) {
            console.error("Error switching workspace:", error);
            res.status(500).json({ message: "Failed to switch workspace" });
        }
    },
    // Update friendly workspace name for the current user
    async updateWorkspaceName(req, res) {
        try {
            const { workspaceDomain, workspaceName } = req.body;
            if (!workspaceDomain || !workspaceName) {
                return res
                    .status(400)
                    .json({ message: "workspaceDomain and workspaceName are required" });
            }
            const trimmed = (workspaceName || "").trim();
            if (trimmed.length < 2 || trimmed.length > 64) {
                return res
                    .status(400)
                    .json({ message: "Workspace name must be 2-64 characters" });
            }
            const user = await User_1.User.findById(req.user._id);
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const idx = (user.accessibleWorkspaces || []).findIndex((ws) => (ws.workspaceDomain || "").toLowerCase() ===
                (workspaceDomain || "").toLowerCase());
            if (idx === -1) {
                return res
                    .status(404)
                    .json({ message: "Workspace not found for this user" });
            }
            user.accessibleWorkspaces[idx].workspaceName = trimmed;
            await user.save();
            res.json({ message: "Workspace name updated", workspaceName: trimmed });
        }
        catch (error) {
            console.error("Error updating workspace name:", error);
            res.status(500).json({ message: "Failed to update workspace name" });
        }
    },
    // Admin: update a user's allowed time buckets for this workspace
    async updateUserTimeBuckets(req, res) {
        try {
            if (req.user.role !== "admin") {
                return res
                    .status(403)
                    .json({ message: "Only admins can update permissions" });
            }
            const { userEmail, allowedTimeBuckets } = req.body;
            if (!userEmail ||
                !Array.isArray(allowedTimeBuckets) ||
                allowedTimeBuckets.length === 0) {
                return res
                    .status(400)
                    .json({ message: "userEmail and allowedTimeBuckets are required" });
            }
            const user = await User_1.User.findOne({ email: userEmail.toLowerCase() });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const idx = (user.accessibleWorkspaces || []).findIndex((ws) => (ws.workspaceDomain || "").toLowerCase() ===
                (req.userDomain || "").toLowerCase());
            if (idx === -1) {
                return res
                    .status(404)
                    .json({ message: "User does not have access to this workspace" });
            }
            user.accessibleWorkspaces[idx].allowedTimeBuckets =
                allowedTimeBuckets;
            await user.save();
            return res.json({ message: "Permissions updated", allowedTimeBuckets });
        }
        catch (error) {
            console.error("Error updating user time buckets:", error);
            return res.status(500).json({ message: "Failed to update permissions" });
        }
    },
    // Admin: revoke a user's access to this workspace
    async revokeUserAccess(req, res) {
        var _a, _b;
        try {
            if (req.user.role !== "admin") {
                return res
                    .status(403)
                    .json({ message: "Only admins can revoke access" });
            }
            const { userEmail } = req.body;
            if (!userEmail) {
                return res.status(400).json({ message: "userEmail is required" });
            }
            const user = await User_1.User.findOne({ email: userEmail.toLowerCase() });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            const before = (user.accessibleWorkspaces || []).length;
            user.accessibleWorkspaces = (user.accessibleWorkspaces || []).filter((ws) => (ws.workspaceDomain || "").toLowerCase() !==
                (req.userDomain || "").toLowerCase());
            // If currentWorkspace was this domain, switch to primary domain if still present
            if ((user.currentWorkspace || "").toLowerCase() ===
                (req.userDomain || "").toLowerCase()) {
                const primary = (user.domain || "").toLowerCase();
                const hasPrimary = (user.accessibleWorkspaces || []).some((w) => (w.workspaceDomain || "").toLowerCase() === primary);
                user.currentWorkspace = hasPrimary
                    ? user.domain
                    : ((_b = (_a = user.accessibleWorkspaces) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.workspaceDomain) || "";
            }
            if ((user.accessibleWorkspaces || []).length === before) {
                return res
                    .status(404)
                    .json({ message: "User did not have access to this workspace" });
            }
            await user.save();
            return res.json({ message: "Access revoked" });
        }
        catch (error) {
            console.error("Error revoking user access:", error);
            return res.status(500).json({ message: "Failed to revoke access" });
        }
    },
};
// Helper function to send invitation email
async function sendInvitationEmail(invitation) {
    const invitationUrl = `${process.env.FRONTEND_URL}/invitation/${invitation.invitationId}`;
    const emailData = {
        to: invitation.inviteeEmail,
        subject: `Invitation to join ${invitation.workspaceName}`,
        template: "workspace-invitation",
        data: {
            inviterName: invitation.inviterName,
            workspaceName: invitation.workspaceName,
            workspaceDomain: invitation.workspaceDomain,
            invitedRole: invitation.invitedRole,
            message: invitation.message,
            invitationUrl,
            expiresAt: invitation.expiresAt.toLocaleDateString(),
        },
    };
    await (0, emailService_1.sendEmail)(emailData);
}
