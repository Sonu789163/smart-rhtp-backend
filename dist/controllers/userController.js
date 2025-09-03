"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const User_1 = require("../models/User");
exports.userController = {
    // Admin: Get all users with pagination, search, and filters
    async getAllUsers(req, res) {
        try {
            const { page = 1, limit = 20, search = "", role = "", status = "", } = req.query;
            const query = {};
            // Search by email or name
            if (search) {
                query.$or = [
                    { email: { $regex: search, $options: "i" } },
                    { name: { $regex: search, $options: "i" } },
                ];
            }
            // Filter by role
            if (role && role !== "all") {
                query.role = role;
            }
            // Filter by status
            if (status && status !== "all") {
                query.status = status;
            }
            const skip = (Number(page) - 1) * Number(limit);
            const users = await User_1.User.find(query)
                .select("-password -refreshTokens -resetPasswordToken -resetPasswordExpires")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit));
            const total = await User_1.User.countDocuments(query);
            res.json({
                users,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit)),
                },
            });
        }
        catch (error) {
            console.error("Error fetching users:", error);
            res.status(500).json({ message: "Failed to fetch users" });
        }
    },
    // Admin: Get single user by ID
    async getUserById(req, res) {
        try {
            const user = await User_1.User.findById(req.params.id).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpires");
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json(user);
        }
        catch (error) {
            console.error("Error fetching user:", error);
            res.status(500).json({ message: "Failed to fetch user" });
        }
    },
    // Admin: Create new user
    async createUser(req, res) {
        try {
            const { email, name, password, role = "user" } = req.body;
            // Check if user already exists
            const existingUser = await User_1.User.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: "User already exists" });
            }
            // Hash password if provided
            let hashedPassword;
            if (password) {
                hashedPassword = await bcryptjs_1.default.hash(password, 10);
            }
            const user = new User_1.User({
                email,
                name,
                password: hashedPassword,
                role,
                status: "active",
            });
            await user.save();
            // Return user without sensitive data
            const userResponse = user.toObject();
            const { password: _, refreshTokens: __, resetPasswordToken: ___, resetPasswordExpires: ____, ...safeUserData } = userResponse;
            res.status(201).json(safeUserData);
        }
        catch (error) {
            console.error("Error creating user:", error);
            res.status(500).json({ message: "Failed to create user" });
        }
    },
    // Admin: Update user
    async updateUser(req, res) {
        try {
            const { name, role, status } = req.body;
            const updateData = {};
            if (name !== undefined)
                updateData.name = name;
            if (role !== undefined)
                updateData.role = role;
            if (status !== undefined)
                updateData.status = status;
            const user = await User_1.User.findByIdAndUpdate(req.params.id, updateData, {
                new: true,
            }).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpires");
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json(user);
        }
        catch (error) {
            console.error("Error updating user:", error);
            res.status(500).json({ message: "Failed to update user" });
        }
    },
    // Admin: Delete user (soft delete by setting status to suspended)
    async deleteUser(req, res) {
        try {
            const user = await User_1.User.findById(req.params.id);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            // Soft delete by setting status to suspended
            user.status = "suspended";
            await user.save();
            res.json({ message: "User deactivated successfully" });
        }
        catch (error) {
            console.error("Error deleting user:", error);
            res.status(500).json({ message: "Failed to delete user" });
        }
    },
    // Admin: Activate/Reactivate user
    async activateUser(req, res) {
        try {
            const user = await User_1.User.findByIdAndUpdate(req.params.id, { status: "active" }, { new: true }).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpires");
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json({ message: "User activated successfully", user });
        }
        catch (error) {
            console.error("Error activating user:", error);
            res.status(500).json({ message: "Failed to activate user" });
        }
    },
    // User: Get own profile
    async getMyProfile(req, res) {
        try {
            console.log("getMyProfile called, user:", req.user);
            const user = await User_1.User.findById(req.user._id).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpires");
            console.log("Found user:", user);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json(user);
        }
        catch (error) {
            console.error("Error fetching profile:", error);
            res.status(500).json({ message: "Failed to fetch profile" });
        }
    },
    // User: Update own profile
    async updateMyProfile(req, res) {
        try {
            console.log("updateMyProfile called");
            console.log("Request body:", req.body);
            console.log("Request user:", req.user);
            const { name, phoneNumber, gender } = req.body;
            const updateData = {};
            if (name !== undefined)
                updateData.name = name;
            if (phoneNumber !== undefined)
                updateData.phoneNumber = phoneNumber;
            if (gender !== undefined)
                updateData.gender = gender;
            console.log("Update data:", updateData);
            const user = await User_1.User.findByIdAndUpdate(req.user._id, updateData, {
                new: true,
            }).select("-password -refreshTokens -resetPasswordToken -resetPasswordExpires");
            console.log("Updated user:", user);
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json(user);
        }
        catch (error) {
            console.error("Error updating profile:", error);
            res.status(500).json({ message: "Failed to update profile" });
        }
    },
    // User: Change own password
    async changeMyPassword(req, res) {
        try {
            const { oldPassword, newPassword } = req.body;
            if (!oldPassword || !newPassword) {
                return res.status(400).json({
                    message: "Old password and new password are required",
                });
            }
            const user = await User_1.User.findById(req.user._id);
            if (!user || !user.password) {
                return res
                    .status(400)
                    .json({ message: "User not found or no password set" });
            }
            // Verify old password
            const isMatch = await bcryptjs_1.default.compare(oldPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: "Invalid old password" });
            }
            // Hash new password
            const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
            user.password = hashedPassword;
            await user.save();
            res.json({ message: "Password changed successfully" });
        }
        catch (error) {
            console.error("Error changing password:", error);
            res.status(500).json({ message: "Failed to change password" });
        }
    },
    // Admin: Get user statistics
    async getUserStats(req, res) {
        try {
            const totalUsers = await User_1.User.countDocuments();
            const activeUsers = await User_1.User.countDocuments({ status: "active" });
            const suspendedUsers = await User_1.User.countDocuments({ status: "suspended" });
            const adminUsers = await User_1.User.countDocuments({ role: "admin" });
            const regularUsers = await User_1.User.countDocuments({ role: "user" });
            res.json({
                total: totalUsers,
                active: activeUsers,
                suspended: suspendedUsers,
                admins: adminUsers,
                users: regularUsers,
            });
        }
        catch (error) {
            console.error("Error fetching user stats:", error);
            res.status(500).json({ message: "Failed to fetch user statistics" });
        }
    },
};
