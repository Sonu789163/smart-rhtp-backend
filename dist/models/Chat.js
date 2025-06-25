"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chat = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const messageSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true },
    content: { type: String, required: true },
    isUser: { type: Boolean, required: true },
    timestamp: { type: Date, required: true },
});
const chatSchema = new mongoose_1.default.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    messages: [messageSchema],
    updatedAt: { type: Date, default: Date.now },
    documentId: { type: String, required: true },
    microsoftId: { type: String },
    userId: { type: String },
});
chatSchema.pre("validate", function (next) {
    if (!this.microsoftId && !this.userId) {
        next(new Error("Either microsoftId or userId must be present."));
    }
    else {
        next();
    }
});
exports.Chat = mongoose_1.default.model("Chat", chatSchema);
