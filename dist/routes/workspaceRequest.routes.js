"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const workspaceRequestController_1 = require("../controllers/workspaceRequestController");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_1.authMiddleware);
router.use(domainAuth_1.domainAuthMiddleware);
// User requests access to a workspace
router.post("/request", workspaceRequestController_1.workspaceRequestController.requestAccess);
// Get available workspaces user can request (workspaces they don't have access to)
router.get("/available", workspaceRequestController_1.workspaceRequestController.getAvailableWorkspaces);
// Get user's own requests
router.get("/my-requests", workspaceRequestController_1.workspaceRequestController.getMyRequests);
// Admin: Get pending requests for a workspace
router.get("/workspace/:workspaceId/pending", workspaceRequestController_1.workspaceRequestController.getPendingRequests);
// Admin: Approve or reject a request
router.post("/:requestId/review", workspaceRequestController_1.workspaceRequestController.reviewRequest);
exports.default = router;
