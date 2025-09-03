"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiUsage = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const openAiUsageSchema = new mongoose_1.default.Schema({
    timestamp: { type: Date, default: Date.now, index: true },
    userId: { type: String, index: true },
    domain: { type: String, index: true },
    route: { type: String },
    model: { type: String, index: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    status: { type: String, enum: ["success", "error"], default: "success" },
    error: { type: String },
}, { versionKey: false });
openAiUsageSchema.index({ timestamp: 1 });
exports.OpenAiUsage = mongoose_1.default.model("OpenAiUsage", openAiUsageSchema);
