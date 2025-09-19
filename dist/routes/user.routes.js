"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const userController_1 = require("../controllers/userController");
const auth_1 = require("../middleware/auth");
const domainAuth_1 = require("../middleware/domainAuth");
const rateLimitByWorkspace_1 = require("../middleware/rateLimitByWorkspace");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.authMiddleware);
// Apply domain middleware to all routes
router.use(domainAuth_1.domainAuthMiddleware);
// Admin-only routes
router.get("/", (0, auth_1.authorize)(["admin"]), userController_1.userController.getAllUsers);
router.get("/stats", (0, auth_1.authorize)(["admin"]), userController_1.userController.getUserStats);
router.get("/:id", (0, auth_1.authorize)(["admin"]), userController_1.userController.getUserById);
router.post("/", (0, auth_1.authorize)(["admin"]), userController_1.userController.createUser);
router.put("/:id", (0, auth_1.authorize)(["admin"]), userController_1.userController.updateUser);
router.delete("/:id", (0, auth_1.authorize)(["admin"]), userController_1.userController.deleteUser);
router.patch("/:id/activate", (0, auth_1.authorize)(["admin"]), userController_1.userController.activateUser);
// User profile routes (accessible to all authenticated users)
router.get("/me/profile", userController_1.userController.getMyProfile);
router.put("/me/profile", userController_1.userController.updateMyProfile);
router.post("/me/profile/otp-initiate", (0, rateLimitByWorkspace_1.rateLimitByWorkspace)("workspace:invite", 10, 24 * 60 * 60 * 1000), userController_1.userController.initiateProfileUpdateOtp);
router.post("/me/profile/otp-verify", userController_1.userController.verifyProfileUpdateOtp);
router.put("/me/password", userController_1.userController.changeMyPassword);
router.post("/me/password/otp-verify", userController_1.userController.verifyPasswordChangeOtp);
exports.default = router;
