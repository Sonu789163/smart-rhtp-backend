import { ActivityLog } from "../models/ActivityLog";
import { Notification } from "../models/Notification";
import { User } from "../models/User";

type EventPayload = {
  actorUserId?: string;
  domain: string;
  action: string;
  resourceType: string;
  resourceId: string;
  title?: string;
  metadata?: Record<string, any>;
  notifyUserIds?: string[];
  notifyWorkspace?: boolean; // If true, notify all users in the workspace
};

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getWorkspaceUserIds(domain: string, actorUserId?: string): Promise<string[]> {
  try {
    // Get users who have access to this workspace
    const users = await User.find({
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
  } catch (error) {
    console.error('Error getting workspace users:', error);
    return [];
  }
}

export async function publishEvent(evt: EventPayload) {
  const { actorUserId, domain, action, resourceType, resourceId, title, metadata, notifyUserIds, notifyWorkspace } = evt;
  
  // Create activity log
  const log = new ActivityLog({
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
  let userIdsToNotify: string[] = [];
  
  if (notifyUserIds && notifyUserIds.length) {
    userIdsToNotify = notifyUserIds;
  } else if (notifyWorkspace) {
    userIdsToNotify = await getWorkspaceUserIds(domain, actorUserId);
  }

  // Create notifications for all users
  if (userIdsToNotify.length > 0) {
    const notifs = userIdsToNotify.map((uid) =>
      new Notification({
        id: genId("ntf"),
        userId: uid,
        domain,
        type: action,
        title: title || action,
        body: (metadata && metadata.message) || undefined,
        resourceType,
        resourceId,
      })
    );
    for (const n of notifs) await n.save();
  }
}



