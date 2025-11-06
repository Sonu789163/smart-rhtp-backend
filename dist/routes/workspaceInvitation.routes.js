"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const workspaceInvitationController_1 = require("../controllers/workspaceInvitationController");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const rateLimitByUser_1 = require("../middleware/rateLimitByUser");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Apply domain middleware to all routes
router.use(domainAuth_1.domainAuthMiddleware);
// Send workspace invitation (admin only)
router.post("/send", (0, rateLimitByUser_1.rateLimitByUser)("workspace:invite", 10, 24 * 60 * 60 * 1000), // 10 invitations per day
workspaceInvitationController_1.workspaceInvitationController.sendInvitation);
// Get all invitations for current workspace (admin only)
router.get("/workspace", workspaceInvitationController_1.workspaceInvitationController.getWorkspaceInvitations);
// Get invitations sent to a specific email
router.get("/email/:email", workspaceInvitationController_1.workspaceInvitationController.getInvitationsByEmail);
// Accept invitation
router.post("/:invitationId/accept", workspaceInvitationController_1.workspaceInvitationController.acceptInvitation);
// Decline invitation
router.post("/:invitationId/decline", workspaceInvitationController_1.workspaceInvitationController.declineInvitation);
// Cancel invitation (admin only)
router.delete("/:invitationId/cancel", workspaceInvitationController_1.workspaceInvitationController.cancelInvitation);
// Delete invitation record (admin only)
router.delete("/:invitationId", workspaceInvitationController_1.workspaceInvitationController.deleteInvitation);
// Get user's accessible workspaces
router.get("/user/workspaces", workspaceInvitationController_1.workspaceInvitationController.getUserWorkspaces);
// Switch workspace
router.post("/user/switch-workspace", workspaceInvitationController_1.workspaceInvitationController.switchWorkspace);
// Update friendly workspace name for current user
router.post("/user/update-workspace-name", workspaceInvitationController_1.workspaceInvitationController.updateWorkspaceName);
// Admin: update user's time-bucket permissions for current workspace
router.post("/workspace/update-user-buckets", workspaceInvitationController_1.workspaceInvitationController.updateUserTimeBuckets);
// Admin: revoke user's access to current workspace
router.post("/workspace/revoke-user-access", workspaceInvitationController_1.workspaceInvitationController.revokeUserAccess);
// Admin: grant directory access to a user
router.post("/workspace/users/directories/grant", workspaceInvitationController_1.workspaceInvitationController.grantDirectoryAccess);
// Admin: revoke directory access from a user
router.post("/workspace/users/directories/revoke", workspaceInvitationController_1.workspaceInvitationController.revokeDirectoryAccess);
// Admin: get all directories a user has access to
router.get("/workspace/users/:userEmail/directories", workspaceInvitationController_1.workspaceInvitationController.getUserDirectories);
// Admin: retroactively grant directory access from accepted invitation
router.post("/workspace/retroactively-grant-access", workspaceInvitationController_1.workspaceInvitationController.retroactivelyGrantDirectoryAccess);
exports.default = router;
