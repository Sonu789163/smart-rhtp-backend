"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityLog = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const activityLogSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    actorUserId: { type: String },
    domain: { type: String, required: true, index: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    title: { type: String },
    metadata: { type: Object, default: {} },
    requestId: { type: String },
}, { timestamps: true });
activityLogSchema.index({ domain: 1, createdAt: -1 });
exports.ActivityLog = mongoose_1.default.model("ActivityLog", activityLogSchema);
