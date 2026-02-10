"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogger = void 0;
exports.logActivity = logActivity;
const ActivityLog_1 = require("../models/ActivityLog");
const User_1 = require("../models/User");
async function logActivity(params) {
    try {
        // Get performer's email
        const performer = await User_1.User.findById(params.performedBy);
        const performedByEmail = (performer === null || performer === void 0 ? void 0 : performer.email) || "unknown";
        // Create activity log
        const activityLog = new ActivityLog_1.ActivityLog({
            performedBy: params.performedBy,
            performedByEmail,
            targetUserId: params.targetUserId,
            targetUserEmail: params.targetUserEmail,
            action: params.action,
            resourceType: params.resourceType,
            resourceId: params.resourceId,
            resourceName: params.resourceName,
            workspaceId: params.workspaceId,
            workspaceName: params.workspaceName,
            domain: params.domain,
            oldRole: params.oldRole,
            newRole: params.newRole,
            oldPermission: params.oldPermission,
            newPermission: params.newPermission,
            metadata: params.metadata,
            timestamp: new Date(),
        });
        await activityLog.save();
    }
    catch (error) {
        // Don't throw - audit logging should not break the main flow
        console.error("Error logging activity:", error);
    }
}
// Helper functions for common actions
exports.auditLogger = {
    async logRoleChange(performedBy, targetUserId, workspaceId, workspaceName, domain, oldRole, newRole) {
        const targetUser = await User_1.User.findById(targetUserId);
        await logActivity({
            performedBy,
            action: "role_changed",
            resourceType: "workspace",
            resourceId: workspaceId,
            resourceName: workspaceName,
            workspaceId,
            workspaceName,
            domain,
            targetUserId,
            targetUserEmail: targetUser === null || targetUser === void 0 ? void 0 : targetUser.email,
            oldRole,
            newRole,
        });
    },
    async logMemberAdded(performedBy, targetUserId, workspaceId, workspaceName, domain, role) {
        const targetUser = await User_1.User.findById(targetUserId);
        await logActivity({
            performedBy,
            action: "member_added",
            resourceType: "workspace",
            resourceId: workspaceId,
            resourceName: workspaceName,
            workspaceId,
            workspaceName,
            domain,
            targetUserId,
            targetUserEmail: targetUser === null || targetUser === void 0 ? void 0 : targetUser.email,
            newRole: role,
        });
    },
    async logMemberRemoved(performedBy, targetUserId, workspaceId, workspaceName, domain) {
        const targetUser = await User_1.User.findById(targetUserId);
        await logActivity({
            performedBy,
            action: "member_removed",
            resourceType: "workspace",
            resourceId: workspaceId,
            resourceName: workspaceName,
            workspaceId,
            workspaceName,
            domain,
            targetUserId,
            targetUserEmail: targetUser === null || targetUser === void 0 ? void 0 : targetUser.email,
        });
    },
    async logDirectoryAccessGranted(performedBy, targetUserId, directoryId, directoryName, workspaceId, workspaceName, domain, role) {
        const targetUser = await User_1.User.findById(targetUserId);
        await logActivity({
            performedBy,
            action: "directory_access_granted",
            resourceType: "directory",
            resourceId: directoryId,
            resourceName: directoryName,
            workspaceId,
            workspaceName,
            domain,
            targetUserId,
            targetUserEmail: targetUser === null || targetUser === void 0 ? void 0 : targetUser.email,
            newPermission: role,
        });
    },
    async logDirectoryAccessRevoked(performedBy, targetUserId, directoryId, directoryName, workspaceId, workspaceName, domain) {
        const targetUser = await User_1.User.findById(targetUserId);
        await logActivity({
            performedBy,
            action: "directory_access_revoked",
            resourceType: "directory",
            resourceId: directoryId,
            resourceName: directoryName,
            workspaceId,
            workspaceName,
            domain,
            targetUserId,
            targetUserEmail: targetUser === null || targetUser === void 0 ? void 0 : targetUser.email,
        });
    },
    async logInvitationSent(performedBy, invitationId, inviteeEmail, workspaceId, workspaceName, domain, invitedRole) {
        await logActivity({
            performedBy,
            action: "invitation_sent",
            resourceType: "invitation",
            resourceId: invitationId,
            workspaceId,
            workspaceName,
            domain,
            targetUserEmail: inviteeEmail,
            newRole: invitedRole,
        });
    },
    async logInvitationAccepted(performedBy, invitationId, workspaceId, workspaceName, domain) {
        await logActivity({
            performedBy,
            action: "invitation_accepted",
            resourceType: "invitation",
            resourceId: invitationId,
            workspaceId,
            workspaceName,
            domain,
        });
    },
};
