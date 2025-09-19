import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { domainAuthMiddleware } from "../middleware/domainAuth";
import { workspaceController } from "../controllers/workspaceController";

const router = Router();

// Admin-only workspace management under current domain
router.use(authMiddleware);
router.use(domainAuthMiddleware);

router.post("/", workspaceController.create);
router.get("/", workspaceController.list);
router.patch("/:workspaceId", workspaceController.update);
router.delete("/:workspaceId", workspaceController.archive);

// Members management
router.get("/:workspaceId/members", workspaceController.listMembers);
router.post("/:workspaceId/members", workspaceController.addMember);
router.delete("/:workspaceId/members/:memberId", workspaceController.removeMember);

export default router;


