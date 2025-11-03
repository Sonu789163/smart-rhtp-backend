"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceMembership = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
// Many-to-many relationship between Users and Workspaces
const workspaceMembershipSchema = new mongoose_1.default.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    workspaceId: {
        type: String, // References Workspace.workspaceId
        required: true,
        index: true,
    },
    role: {
        type: String,
        enum: ["admin", "member", "viewer"],
        default: "member",
        required: true,
    },
    invitedBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
    },
    invitedAt: {
        type: Date,
        default: Date.now,
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ["pending", "active", "suspended"],
        default: "active",
        index: true,
    },
});
// Compound index for efficient queries
workspaceMembershipSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });
workspaceMembershipSchema.index({ workspaceId: 1, status: 1 });
workspaceMembershipSchema.index({ userId: 1, status: 1 });
exports.WorkspaceMembership = mongoose_1.default.model("WorkspaceMembership", workspaceMembershipSchema);
