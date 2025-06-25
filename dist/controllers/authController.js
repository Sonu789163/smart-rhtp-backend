"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
// Helper to generate tokens
const generateTokens = async (user) => {
    const accessToken = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "24h" });
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
            const accessToken = jsonwebtoken_1.default.sign({ userId: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "24h" });
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
};
