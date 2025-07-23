"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
const nodemailer_1 = __importDefault(require("nodemailer"));
const crypto_1 = __importDefault(require("crypto"));
// Helper to generate tokens
const generateTokens = async (user) => {
    const accessToken = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });
    const refreshToken = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
    // Store refresh token
    if (!user.refreshTokens) {
        user.refreshTokens = [];
    }
    user.refreshTokens.push(refreshToken);
    await user.save();
    return { accessToken, refreshToken };
};
exports.authController = {
    // Register a new user
    async register(req, res) {
        const { email, password } = req.body;
        try {
            let user = await User_1.User.findOne({ email });
            if (user) {
                return res.status(400).json({ message: "User already exists" });
            }
            const hashedPassword = await bcryptjs_1.default.hash(password, 10);
            user = new User_1.User({ email, password: hashedPassword });
            await user.save();
            const tokens = await generateTokens(user);
            res.status(201).json(tokens);
        }
        catch (error) {
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
            const accessToken = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });
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
