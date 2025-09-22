"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
// Verifies Bearer JWT, loads the user, checks status, and attaches
// `req.user` and `req.currentWorkspace` for downstream handlers.
const authMiddleware = async (req, res, next) => {
    var _a;
    try {
        // Check for link access first - allow unauthenticated access via link
        const linkToken = req.query.linkToken;
        if (linkToken) {
            // Skip authentication for link access - will be handled by linkAccess middleware
            return next();
        }
        const token = (_a = req.header("Authorization")) === null || _a === void 0 ? void 0 : _a.replace("Bearer ", "");
        if (!token) {
            return res
                .status(401)
                .json({ message: "No token, authorization denied" });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        // Try to find user by microsoftId first, then by _id
        let user = null;
        if (decoded.microsoftId) {
            user = await User_1.User.findOne({ microsoftId: decoded.microsoftId });
        }
        else if (decoded.userId) {
            user = await User_1.User.findById(decoded.userId);
        }
        if (!user) {
            return res.status(401).json({ message: "Token is not valid" });
        }
        if (user.status === "suspended") {
            return res.status(403).json({ message: "Account is suspended" });
        }
        req.user = user;
        // Extract workspace from headers
        const workspaceHeader = req.header("x-workspace");
        if (workspaceHeader) {
            req.currentWorkspace = workspaceHeader;
        }
        else {
            // Fallback to user's domain if no workspace header
            req.currentWorkspace = user.domain;
        }
        next();
    }
    catch (error) {
        res.status(401).json({ message: "Token is not valid" });
    }
};
exports.authMiddleware = authMiddleware;
const authorize = (roles) => {
    return (req, res, next) => {
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if (!roles.includes(currentUser.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
};
exports.authorize = authorize;
