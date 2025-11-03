"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceRequest = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
// Workspace access request from users (non-admin)
const workspaceRequestSchema = new mongoose_1.default.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    workspaceId: {
        type: String,
        required: true,
        index: true,
    },
    domainId: {
        type: String,
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
        index: true,
    },
    requestedAt: {
        type: Date,
        default: Date.now,
    },
    reviewedBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: "User",
    },
    reviewedAt: {
        type: Date,
    },
    message: {
        type: String, // Optional message from user
    },
    rejectionReason: {
        type: String, // Optional reason if rejected
    },
});
// Compound index to prevent duplicate requests
workspaceRequestSchema.index({ userId: 1, workspaceId: 1 }, { unique: true });
workspaceRequestSchema.index({ workspaceId: 1, status: 1 });
exports.WorkspaceRequest = mongoose_1.default.model("WorkspaceRequest", workspaceRequestSchema);
