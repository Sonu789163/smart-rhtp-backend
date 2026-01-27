"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const SharePermission_1 = require("../models/SharePermission");
const nodemailer_1 = __importDefault(require("nodemailer"));
const crypto_1 = __importDefault(require("crypto"));
const domainConfig_1 = require("../config/domainConfig");
const events_1 = require("../lib/events");
const emailService_1 = require("../services/emailService");
// Helper to generate tokens
// Creates an access token and a refresh token, stores the refresh
// token in the user's document for later revocation, and returns both.
const generateTokens = async (user) => {
    // Get domainId from user if available
    const userWithDomain = await User_1.User.findById(user._id).select("domainId").lean();
    const domainId = (userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId) || (user.domainId);
    const accessToken = jsonwebtoken_1.default.sign({
        userId: user._id,
        email: user.email,
        role: user.role,
        domain: user.domain,
        domainId: domainId, // Add domainId to JWT
    }, process.env.JWT_SECRET, { expiresIn: "1d" });
    const refreshToken = jsonwebtoken_1.default.sign({
        userId: user._id,
        email: user.email,
        role: user.role,
        domain: user.domain,
        domainId: domainId, // Add domainId to JWT
    }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
    // Store refresh token
    if (!user.refreshTokens) {
        user.refreshTokens = [];
    }
    user.refreshTokens.push(refreshToken);
    await user.save();
    return { accessToken, refreshToken };
};
// Helper to link SharePermissions by email to user ID when user logs in
const linkSharePermissionsToUser = async (user) => {
    var _a;
    try {
        const userEmail = (_a = user.email) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        const userId = user._id.toString();
        if (!userEmail)
            return;
        // Find all SharePermissions that have this email but no principalId
        const sharesToUpdate = await SharePermission_1.SharePermission.find({
            invitedEmail: userEmail,
            scope: "user",
            $or: [
                { principalId: null },
                { principalId: { $exists: false } },
                { principalId: "" }
            ]
        });
        if (sharesToUpdate.length > 0) {
            console.log(`[linkSharePermissionsToUser] Found ${sharesToUpdate.length} SharePermissions to link for user ${userEmail}`);
            // Update each SharePermission to include the user ID
            for (const share of sharesToUpdate) {
                try {
                    // Use updateOne to avoid duplicate key errors
                    await SharePermission_1.SharePermission.updateOne({ id: share.id }, {
                        $set: {
                            principalId: userId,
                            // Keep the invitedEmail for backward compatibility
                        }
                    });
                    console.log(`[linkSharePermissionsToUser] ✓ Linked SharePermission ${share.id} to user ${userId}`);
                    // If this is a directory share, create directory in recipient's workspace
                    if (share.resourceType === "directory") {
                        await createSharedDirectoryForUser(user, share);
                    }
                }
                catch (updateError) {
                    // If update fails due to duplicate key, try to find and update existing
                    console.error(`[linkSharePermissionsToUser] Error updating share ${share.id}:`, updateError.message);
                }
            }
        }
        // Also check for existing SharePermissions with principalId and create directories if needed
        const existingShares = await SharePermission_1.SharePermission.find({
            principalId: userId,
            resourceType: "directory",
            scope: "user"
        });
        for (const share of existingShares) {
            await createSharedDirectoryForUser(user, share);
        }
    }
    catch (error) {
        console.error("[linkSharePermissionsToUser] Error linking SharePermissions:", error);
        // Don't throw - this is a background task
    }
};
// Helper to create shared directory in recipient's workspace
const createSharedDirectoryForUser = async (user, share) => {
    try {
        const { Directory } = await Promise.resolve().then(() => __importStar(require("../models/Directory")));
        const { Workspace } = await Promise.resolve().then(() => __importStar(require("../models/Workspace")));
        const { WorkspaceMembership } = await Promise.resolve().then(() => __importStar(require("../models/WorkspaceMembership")));
        // Get recipient's workspace
        let recipientWorkspaceId = user.currentWorkspace;
        if (!recipientWorkspaceId) {
            const firstMembership = await WorkspaceMembership.findOne({
                userId: user._id,
                status: "active"
            }).sort({ joinedAt: 1 });
            if (firstMembership) {
                recipientWorkspaceId = firstMembership.workspaceId;
            }
            else {
                const defaultWorkspace = await Workspace.findOne({
                    domain: user.domain,
                    status: "active"
                }).sort({ createdAt: 1 });
                if (defaultWorkspace) {
                    recipientWorkspaceId = defaultWorkspace.workspaceId;
                }
            }
        }
        if (!recipientWorkspaceId) {
            console.log(`[createSharedDirectoryForUser] No workspace found for user ${user.email}, skipping directory creation`);
            return;
        }
        // Check if shared directory already exists
        const existingSharedDir = await Directory.findOne({
            sharedFromDirectoryId: share.resourceId,
            sharedWithUserId: user._id.toString(),
            workspaceId: recipientWorkspaceId,
        });
        if (existingSharedDir) {
            return; // Already exists
        }
        // Get original directory
        const originalDirectory = await Directory.findOne({
            id: share.resourceId,
            domain: share.domain
        });
        if (!originalDirectory) {
            console.log(`[createSharedDirectoryForUser] Original directory ${share.resourceId} not found`);
            return;
        }
        // Create shared directory in recipient's workspace
        const sharedDirectoryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const sharedDirectory = new Directory({
            id: sharedDirectoryId,
            name: originalDirectory.name,
            normalizedName: originalDirectory.normalizedName || originalDirectory.name.toLowerCase().trim(),
            parentId: null,
            domain: user.domain,
            domainId: user.domainId,
            workspaceId: recipientWorkspaceId,
            ownerUserId: user._id.toString(),
            documentCount: 0,
            drhpCount: 0,
            rhpCount: 0,
            sharedFromDirectoryId: share.resourceId,
            sharedFromDomain: share.domain,
            sharedFromWorkspaceId: originalDirectory.workspaceId,
            sharedWithUserId: user._id.toString(),
            isShared: true,
        });
        await sharedDirectory.save();
        console.log(`✅ Created shared directory ${sharedDirectoryId} in workspace ${recipientWorkspaceId} for user ${user.email}`);
    }
    catch (error) {
        console.error("[createSharedDirectoryForUser] Error creating shared directory:", error);
    }
};
exports.authController = {
    // Register a new user (with email OTP verification)
    async register(req, res) {
        const { email, password, name } = req.body;
        try {
            // Validate email format and domain
            const emailValidation = (0, domainConfig_1.validateEmail)(email);
            if (!emailValidation.isValid) {
                return res.status(400).json({ message: emailValidation.error });
            }
            // Check if user already exists
            let user = await User_1.User.findOne({ email });
            if (user) {
                return res.status(400).json({ message: "User already exists" });
            }
            // Get the primary domain from email
            const domainName = (0, domainConfig_1.getPrimaryDomain)(email);
            if (!domainName) {
                return res.status(400).json({ message: "Invalid domain" });
            }
            // Create or get Domain record
            const { Domain } = await Promise.resolve().then(() => __importStar(require("../models/Domain")));
            let domain = await Domain.findOne({ domainName, status: "active" });
            if (!domain) {
                // New domain - create it automatically
                const domainId = `domain_${domainName.toLowerCase().replace(/[^a-z0-9]/g, "-")}_${Date.now()}`;
                domain = new Domain({
                    domainId,
                    domainName,
                    status: "active",
                });
                await domain.save();
                console.log(`✅ Created new domain: ${domainName} (${domainId})`);
            }
            // Check if this is the first user in the domain (will become admin)
            const isFirstUserInDomain = (await User_1.User.countDocuments({ domainId: domain.domainId })) === 0;
            const role = isFirstUserInDomain ? "admin" : "user";
            const hashedPassword = await bcryptjs_1.default.hash(password, 10);
            user = new User_1.User({
                email,
                domain: domainName, // Keep for backward compatibility
                domainId: domain.domainId, // Link to Domain schema
                password: hashedPassword,
                name: name || email.split("@")[0], // Use email prefix as name if not provided
                role: role, // Make sure role is set
            });
            // Require email OTP verification before activating account
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expires = new Date(Date.now() + 10 * 60 * 1000);
            user.registrationOTP = otp;
            user.registrationOTPExpires = expires;
            await user.save();
            await (0, emailService_1.sendEmail)({
                to: email,
                subject: "Verify your email",
                template: "registration-otp",
                data: { otp, expiresMinutes: 10 },
            });
            res.status(201).json({ message: "OTP sent to your email to verify registration" });
        }
        catch (error) {
            console.error("Registration error:", error);
            res.status(500).json({ message: "Server error" });
        }
    },
    // Verify registration OTP and issue tokens
    async verifyRegistrationOtp(req, res) {
        const { email, otp } = req.body;
        try {
            if (!email || !otp)
                return res.status(400).json({ message: "Email and OTP are required" });
            const user = await User_1.User.findOne({ email });
            if (!user)
                return res.status(404).json({ message: "User not found" });
            if (!user.registrationOTP || !user.registrationOTPExpires) {
                return res.status(400).json({ message: "No registration verification in progress" });
            }
            if (String(otp) !== String(user.registrationOTP)) {
                return res.status(400).json({ message: "Invalid OTP" });
            }
            if (new Date() > new Date(user.registrationOTPExpires)) {
                return res.status(400).json({ message: "OTP expired" });
            }
            // Clear registration OTP fields
            user.registrationOTP = undefined;
            user.registrationOTPExpires = undefined;
            await user.save();
            // Link SharePermissions by email to user ID (for cross-domain shares)
            await linkSharePermissionsToUser(user);
            // Publish event for workspace notification
            await (0, events_1.publishEvent)({
                actorUserId: user._id.toString(),
                domain: user.domain,
                action: "user.registered",
                resourceType: "user",
                resourceId: user._id.toString(),
                title: `New user registered: ${user.name || user.email}`,
                notifyAdminsOnly: true,
            });
            const tokens = await generateTokens(user);
            res.status(200).json({
                ...tokens,
                user: {
                    userId: user._id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                },
            });
        }
        catch (error) {
            console.error("Verify registration OTP error:", error);
            res.status(500).json({ message: "Server error" });
        }
    },
    // Login a user
    async login(req, res) {
        const { email, password } = req.body;
        try {
            const user = await User_1.User.findOne({ email });
            if (!user || !user.password) {
                return res.status(400).json({ message: "Invalid credentials" });
            }
            const isMatch = await bcryptjs_1.default.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: "Invalid credentials" });
            }
            user.lastLogin = new Date();
            await user.save();
            // Link SharePermissions by email to user ID (for cross-domain shares)
            await linkSharePermissionsToUser(user);
            const tokens = await generateTokens(user);
            res.json(tokens);
        }
        catch (error) {
            console.error("Login error:", error);
            res.status(500).json({ message: "Server error" });
        }
    },
    // Refresh access token
    async refreshToken(req, res) {
        const { token } = req.body;
        if (!token) {
            return res.status(401).json({ message: "No token provided" });
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_REFRESH_SECRET);
            const user = await User_1.User.findById(decoded.userId);
            if (!user || !user.refreshTokens.includes(token)) {
                return res.status(403).json({ message: "Invalid refresh token" });
            }
            // Get domainId from user if available
            const userWithDomain = await User_1.User.findById(user._id).select("domainId").lean();
            const domainId = (userWithDomain === null || userWithDomain === void 0 ? void 0 : userWithDomain.domainId) || (user.domainId);
            const accessToken = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email, role: user.role, domain: user.domain, domainId: domainId }, process.env.JWT_SECRET, { expiresIn: "1d" });
            res.json({ accessToken });
        }
        catch (error) {
            res.status(403).json({ message: "Invalid refresh token" });
        }
    },
    // Logout
    async logout(req, res) {
        const { refreshToken } = req.body;
        try {
            const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const user = await User_1.User.findById(decoded.userId);
            if (user) {
                user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
                await user.save();
            }
            res.status(200).json({ message: "Logged out successfully" });
        }
        catch (error) {
            res.status(400).json({ message: "Invalid refresh token" });
        }
    },
    // Forgot Password
    async forgotPassword(req, res) {
        const { email } = req.body;
        try {
            const user = await User_1.User.findOne({ email });
            if (!user || !user.password) {
                // Don't reveal if user exists or not
                return res.status(200).json({
                    message: "If that email is registered, a reset link has been sent.",
                });
            }
            // Generate token
            const token = crypto_1.default.randomBytes(32).toString("hex");
            user.resetPasswordToken = token;
            user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
            await user.save();
            // Send email
            const transporter = nodemailer_1.default.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
            const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:8080"}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
            await transporter.sendMail({
                to: email,
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                subject: "Password Reset Request",
                html: `<p>You requested a password reset.</p><p>Click <a href="${resetUrl}">here</a> to reset your password. This link is valid for 1 hour.</p>`,
            });
            return res.status(200).json({
                message: "If that email is registered, a reset link has been sent.",
            });
        }
        catch (error) {
            console.error("Forgot password error:", error);
            res.status(500).json({ message: "Server error" });
        }
    },
    // Reset Password
    async resetPassword(req, res) {
        const { email, token, password } = req.body;
        try {
            const user = await User_1.User.findOne({
                email,
                resetPasswordToken: token,
                resetPasswordExpires: { $gt: Date.now() },
            });
            if (!user || !user.password) {
                return res.status(400).json({ message: "Invalid or expired token" });
            }
            user.password = await bcryptjs_1.default.hash(password, 10);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            res.status(200).json({ message: "Password has been reset successfully" });
        }
        catch (error) {
            console.error("Reset password error:", error);
            res.status(500).json({ message: "Server error" });
        }
    },
};
