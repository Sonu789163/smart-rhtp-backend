"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharePermission = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const sharePermissionSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    resourceType: { type: String, enum: ["directory", "document"], required: true },
    resourceId: { type: String, required: true },
    domain: { type: String, required: true, index: true },
    scope: { type: String, enum: ["user", "workspace", "link"], required: true },
    principalId: { type: String },
    role: { type: String, enum: ["owner", "editor", "viewer"], required: true },
    invitedEmail: { type: String },
    linkToken: { type: String },
    expiresAt: { type: Date, default: null },
    createdBy: { type: String },
}, { timestamps: true });
sharePermissionSchema.index({ domain: 1, resourceType: 1, resourceId: 1 });
sharePermissionSchema.index({ scope: 1, principalId: 1 });
sharePermissionSchema.index({ scope: 1, linkToken: 1 }, { unique: true, sparse: true });
exports.SharePermission = mongoose_1.default.model("SharePermission", sharePermissionSchema);
