"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityLog = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const activityLogSchema = new mongoose_1.default.Schema({
    // Who performed the action
    performedBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    performedByEmail: {
        type: String,
        required: true,
    },
    // Who the action was performed on (if applicable)
    targetUserId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        index: true,
    },
    targetUserEmail: {
        type: String,
    },
    // Action type
    action: {
        type: String,
        enum: [
            "role_changed",
            "access_granted",
            "access_revoked",
            "invitation_sent",
            "invitation_accepted",
            "invitation_declined",
            "invitation_cancelled",
            "member_added",
            "member_removed",
            "directory_access_granted",
            "directory_access_revoked",
            "document_access_granted",
            "document_access_revoked",
        ],
        required: true,
        index: true,
    },
    // Resource details
    resourceType: {
        type: String,
        enum: ["workspace", "directory", "document", "invitation"],
        required: true,
    },
    resourceId: {
        type: String,
        required: true,
    },
    resourceName: {
        type: String,
    },
    // Workspace context
    workspaceId: {
        type: String,
        index: true,
    },
    workspaceName: {
        type: String,
    },
    // Domain context
    domain: {
        type: String,
        required: true,
        index: true,
    },
    // Role/permission changes
    oldRole: {
        type: String,
    },
    newRole: {
        type: String,
    },
    oldPermission: {
        type: String,
    },
    newPermission: {
        type: String,
    },
    // Additional metadata
    metadata: {
        type: mongoose_1.default.Schema.Types.Mixed,
    },
    // Timestamp
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, { timestamps: true });
// Indexes for efficient queries
activityLogSchema.index({ workspaceId: 1, timestamp: -1 });
activityLogSchema.index({ targetUserId: 1, timestamp: -1 });
activityLogSchema.index({ performedBy: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ domain: 1, timestamp: -1 });
exports.ActivityLog = mongoose_1.default.model("ActivityLog", activityLogSchema);
