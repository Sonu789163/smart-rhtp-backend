"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const authController_1 = require("../controllers/authController");
const Document_1 = require("../models/Document");
const Chat_1 = require("../models/Chat");
const Summary_1 = require("../models/Summary");
const router = express_1.default.Router();
// --- Email/Password Routes ---
router.post("/register", authController_1.authController.register);
router.post("/login", authController_1.authController.login);
router.post("/forgot-password", authController_1.authController.forgotPassword);
router.post("/reset-password", authController_1.authController.resetPassword);
router.post("/refresh-token", authController_1.authController.refreshToken);
router.post("/logout", authController_1.authController.logout);
// Microsoft OAuth login
router.get("/microsoft", (req, res) => {
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
        `client_id=${process.env.CLIENT_ID}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&` +
        `scope=${encodeURIComponent("openid profile email")}&` +
        `response_mode=query`;
    res.json({ authUrl });
});
// Microsoft OAuth callback
router.get("/callback", async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res
                .status(400)
                .json({ message: "Authorization code not provided" });
        }
        // Exchange code for token
        const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code: code,
                redirect_uri: process.env.REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });
        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            return res.status(400).json({ message: "Failed to get access token" });
        }
        // Get user info
        const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });
        const userData = await userResponse.json();
        // Find or create user
        let user = await User_1.User.findOne({ microsoftId: userData.id });
        if (!user) {
            user = new User_1.User({
                microsoftId: userData.id,
                name: userData.displayName,
                email: userData.userPrincipalName,
                createdAt: new Date(),
                lastLogin: new Date(),
            });
            await user.save();
        }
        else {
            user.lastLogin = new Date();
            user.name = userData.displayName;
            user.email = userData.userPrincipalName;
            await user.save();
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({
            microsoftId: user.microsoftId,
            name: user.name,
            email: user.email,
        }, process.env.JWT_SECRET, { expiresIn: "7d" });
        // Generate refresh token
        const refreshToken = jsonwebtoken_1.default.sign({
            microsoftId: user.microsoftId,
            name: user.name,
            email: user.email,
        }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
        // Save refresh token
        user.refreshTokens.push(refreshToken);
        await user.save();
        // Redirect to frontend with both tokens
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
        res.redirect(`${frontendUrl}/auth-callback?token=${token}&refreshToken=${refreshToken}`);
    }
    catch (error) {
        console.error("Auth callback error:", error);
        res.status(500).json({ message: "Authentication failed" });
    }
});
// Get current user
router.get("/me", auth_1.authMiddleware, async (req, res) => {
    try {
        let user = null;
        if (req.user.microsoftId) {
            user = await User_1.User.findOne({ microsoftId: req.user.microsoftId });
        }
        else if (req.user._id) {
            user = await User_1.User.findById(req.user._id);
        }
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({
            user: {
                email: user.email,
                name: user.name,
                microsoftId: user.microsoftId,
                _id: user._id,
            },
        });
    }
    catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});
// Get user history
router.get("/history", auth_1.authMiddleware, async (req, res) => {
    try {
        const query = {};
        if (req.user.microsoftId) {
            query.microsoftId = req.user.microsoftId;
        }
        else if (req.user._id) {
            query.userId = req.user._id.toString();
        }
        else {
            return res.status(400).json({ error: "No user identifier found" });
        }
        const documents = await Document_1.Document.find(query);
        const summaries = await Summary_1.Summary.find(query);
        const chats = await Chat_1.Chat.find(query);
        res.json({
            documents,
            summaries,
            chats,
        });
    }
    catch (error) {
        console.error("History error:", error);
        res.status(500).json({ message: "Failed to fetch history" });
    }
});
exports.default = router;
