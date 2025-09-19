"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const notificationSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    domain: { type: String, required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String },
    resourceType: { type: String },
    resourceId: { type: String },
    isRead: { type: Boolean, default: false },
}, { timestamps: true });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
exports.Notification = mongoose_1.default.model("Notification", notificationSchema);
