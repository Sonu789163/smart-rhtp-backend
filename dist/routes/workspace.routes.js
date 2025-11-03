"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const workspaceController_1 = require("../controllers/workspaceController");
const router = (0, express_1.Router)();
// Public check endpoint (no domain auth needed for first login check)
router.get("/check-first-login", auth_1.authMiddleware, workspaceController_1.workspaceController.checkFirstLogin);
// Admin-only workspace management under current domain
router.use(auth_1.authMiddleware);
router.use(domainAuth_1.domainAuthMiddleware);
router.post("/", workspaceController_1.workspaceController.create);
router.get("/", workspaceController_1.workspaceController.list);
router.patch("/:workspaceId", workspaceController_1.workspaceController.update);
router.delete("/:workspaceId", workspaceController_1.workspaceController.archive);
// Members management
router.get("/:workspaceId/members", workspaceController_1.workspaceController.listMembers);
router.post("/:workspaceId/members", workspaceController_1.workspaceController.addMember);
router.delete("/:workspaceId/members/:memberId", workspaceController_1.workspaceController.removeMember);
// Document management
router.post("/:workspaceId/move-document", workspaceController_1.workspaceController.moveDocument);
// User's workspaces (via membership)
router.get("/my-workspaces", workspaceController_1.workspaceController.getMyWorkspaces);
// Migration endpoint (admin only) - migrates legacy accessibleWorkspaces to WorkspaceMembership
router.post("/migrate-legacy-workspaces", workspaceController_1.workspaceController.migrateLegacyWorkspaces);
exports.default = router;
