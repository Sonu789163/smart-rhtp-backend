"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitByWorkspace = rateLimitByWorkspace;
const mongoose_1 = __importDefault(require("mongoose"));
const workspaceRateLimitSchema = new mongoose_1.default.Schema({
    workspaceDomain: { type: String, index: true, required: true },
    action: { type: String, index: true, required: true },
    windowStart: { type: Date, index: true, required: true },
    count: { type: Number, default: 0 },
}, { versionKey: false });
workspaceRateLimitSchema.index({ workspaceDomain: 1, action: 1, windowStart: 1 }, { unique: true });
const WorkspaceRateLimitModel = mongoose_1.default.model("WorkspaceRateLimit", workspaceRateLimitSchema);
function rateLimitByWorkspace(action, limit, windowMs) {
    return async (req, res, next) => {
        try {
            const workspaceDomain = req.currentWorkspace || req.userDomain || "global";
            const now = Date.now();
            const windowStart = new Date(now - (now % windowMs));
            const updated = await WorkspaceRateLimitModel.findOneAndUpdate({ workspaceDomain, action, windowStart }, { $inc: { count: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            if (((updated === null || updated === void 0 ? void 0 : updated.count) || 0) > limit) {
                const retryAfterSec = Math.ceil((windowStart.getTime() + windowMs - now) / 1000);
                res.setHeader("Retry-After", String(retryAfterSec));
                return res.status(429).json({
                    message: "Workspace rate limit exceeded",
                    action,
                    limit,
                    windowMs,
                    retryAfterSec,
                    workspaceDomain,
                });
            }
            next();
        }
        catch (error) {
            return res.status(500).json({ message: "Rate limit error" });
        }
    };
}
