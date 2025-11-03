"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishEvent = publishEvent;
const ActivityLog_1 = require("../models/ActivityLog");
const Notification_1 = require("../models/Notification");
const User_1 = require("../models/User");
const Domain_1 = require("../models/Domain");
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
    var _a;
    const { actorUserId, domain, action, resourceType, resourceId, title, metadata, notifyUserIds, notifyWorkspace, notifyAdminsOnly } = evt;
    // Get domainId from domain name
    let domainId;
    try {
        const domainRecord = await Domain_1.Domain.findOne({ domainName: domain, status: "active" });
        if (domainRecord) {
            domainId = domainRecord.domainId;
        }
        else {
            // Fallback: try to find by domain string if domainName doesn't match exactly
            const domainRecordByDomain = await Domain_1.Domain.findOne({ domainName: { $regex: new RegExp(domain.replace(/\./g, "\\."), "i") }, status: "active" });
            if (domainRecordByDomain) {
                domainId = domainRecordByDomain.domainId;
            }
        }
    }
    catch (error) {
        console.error("Error fetching domainId for event:", error);
    }
    // If domainId is still not found, try to get it from the first user with this domain
    if (!domainId) {
        try {
            const userWithDomain = await User_1.User.findOne({ domain }).select("domainId").lean();
            if (userWithDomain && userWithDomain.domainId) {
                domainId = userWithDomain.domainId;
            }
        }
        catch (error) {
            console.error("Error fetching domainId from user:", error);
        }
    }
    // If still no domainId, log warning but continue (backward compatibility)
    if (!domainId) {
        console.warn(`Warning: Could not find domainId for domain "${domain}". Notification may fail validation.`);
    }
    // Create activity log
    const logData = {
        id: genId("act"),
        actorUserId,
        domain,
        action,
        resourceType,
        resourceId,
        title: title || action,
        metadata: metadata || {},
    };
    // Add domainId if available
    if (domainId) {
        logData.domainId = domainId;
    }
    const log = new ActivityLog_1.ActivityLog(logData);
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
        const notifs = userIdsToNotify.map((uid) => {
            const notifData = {
                id: genId("ntf"),
                userId: uid,
                domain,
                type: action,
                title: title || action,
                body: (metadata && metadata.message) || undefined,
                resourceType,
                resourceId,
            };
            // Add domainId if available
            if (domainId) {
                notifData.domainId = domainId;
            }
            return new Notification_1.Notification(notifData);
        });
        // Save notifications (validation will fail if domainId is missing, but we tried our best)
        for (const n of notifs) {
            try {
                await n.save();
            }
            catch (error) {
                // If validation fails due to missing domainId, try to get it and retry
                if (((_a = error.errors) === null || _a === void 0 ? void 0 : _a.domainId) && !domainId) {
                    console.error(`Failed to save notification due to missing domainId for domain "${domain}"`);
                    // Skip this notification - we can't proceed without domainId
                }
                else {
                    throw error; // Re-throw other errors
                }
            }
        }
    }
}
