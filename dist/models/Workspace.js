"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Workspace = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const workspaceSchema = new mongoose_1.default.Schema({
    workspaceId: { type: String, required: true, unique: true, index: true },
    // Company domain that owns this workspace (ex: "excollo.com")
    domain: { type: String, required: true, index: true },
    // Human-readable name and URL-friendly slug (unique within the same domain)
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    // Ownership and admins
    ownerId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: "User", required: true },
    admins: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: "User" }],
    // Settings (extensible)
    settings: {
        allowGuestAccess: { type: Boolean, default: false },
        defaultUserRole: { type: String, enum: ["user", "viewer"], default: "user" },
        features: {
            documentSharing: { type: Boolean, default: true },
            chatEnabled: { type: Boolean, default: true },
            reportsEnabled: { type: Boolean, default: true }
        }
    },
    // UI metadata
    avatar: { type: String },
    color: { type: String, default: "#4B2A06" },
    // Lifecycle
    status: { type: String, enum: ["active", "suspended", "archived"], default: "active", index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
});
// Unique per domain: no duplicate slug in same domain
workspaceSchema.index({ domain: 1, slug: 1 }, { unique: true });
// Keep updatedAt current
workspaceSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    next();
});
exports.Workspace = mongoose_1.default.model("Workspace", workspaceSchema);
