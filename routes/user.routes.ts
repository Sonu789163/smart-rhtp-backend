import express from "express";
import { userController } from "../controllers/userController";
import { authMiddleware, authorize } from "../middleware/auth";
import { domainAuthMiddleware } from "../middleware/domainAuth";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);
// Apply domain middleware to all routes
router.use(domainAuthMiddleware);

// Admin-only routes
router.get("/", authorize(["admin"]), userController.getAllUsers);
router.get("/stats", authorize(["admin"]), userController.getUserStats);
router.get("/:id", authorize(["admin"]), userController.getUserById);
router.post("/", authorize(["admin"]), userController.createUser);
router.put("/:id", authorize(["admin"]), userController.updateUser);
router.delete("/:id", authorize(["admin"]), userController.deleteUser);
router.patch(
  "/:id/activate",
  authorize(["admin"]),
  userController.activateUser
);

// User profile routes (accessible to all authenticated users)
router.get("/me/profile", userController.getMyProfile);
router.put("/me/profile", userController.updateMyProfile);
router.put("/me/password", userController.changeMyPassword);

export default router;
