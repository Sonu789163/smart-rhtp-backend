"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishEvent = publishEvent;
const ActivityLog_1 = require("../models/ActivityLog");
const Notification_1 = require("../models/Notification");
const User_1 = require("../models/User");
function genId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
// Resolve which users should be notified for a workspace-scoped event.
// Includes primary domain users and (optionally) invited users with access.
async function getWorkspaceUserIds(domain, actorUserId) {
    try {
        // Get users who have access to this workspace
        const users = await User_1.User.find({
            $or: [
                { domain }, // Primary domain users
                { "accessibleWorkspaces.workspaceDomain": domain, "accessibleWorkspaces.isActive": true } // Cross-workspace users
            ]
        }).select('_id role domain');
        // Filter based on user type and actor
        return users
            .filter(user => {
            const userId = user._id.toString();
            // If this is the actor themselves, always include them
            if (actorUserId && userId === actorUserId) {
                return true;
            }
            // Primary domain users (workspace owners) see all notifications
            if (user.domain === domain) {
                return true;
            }
            // Invited users only see their own notifications
            if (user.role === 'admin' || user.domain === domain) {
                return true;
            }
            return false;
        })
            .map(user => user._id.toString());
    }
    catch (error) {
        console.error('Error getting workspace users:', error);
        return [];
    }
}
async function publishEvent(evt) {
    const { actorUserId, domain, action, resourceType, resourceId, title, metadata, notifyUserIds, notifyWorkspace, notifyAdminsOnly } = evt;
    // Create activity log
    const log = new ActivityLog_1.ActivityLog({
        id: genId("act"),
        actorUserId,
        domain,
        action,
        resourceType,
        resourceId,
        title: title || action,
        metadata: metadata || {},
    });
    await log.save();
    // Determine who to notify
    let userIdsToNotify = [];
    if (notifyUserIds && notifyUserIds.length) {
        userIdsToNotify = notifyUserIds;
    }
    else if (notifyAdminsOnly) {
        const admins = await User_1.User.find({ domain, role: 'admin' }).select('_id');
        userIdsToNotify = admins.map(a => a._id.toString());
    }
    else if (notifyWorkspace) {
        userIdsToNotify = await getWorkspaceUserIds(domain, actorUserId);
    }
    // Create notifications for all users
    if (userIdsToNotify.length > 0) {
        const notifs = userIdsToNotify.map((uid) => new Notification_1.Notification({
            id: genId("ntf"),
            userId: uid,
            domain,
            type: action,
            title: title || action,
            body: (metadata && metadata.message) || undefined,
            resourceType,
            resourceId,
        }));
        for (const n of notifs)
            await n.save();
    }
}
