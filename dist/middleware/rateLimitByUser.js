"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitByUser = rateLimitByUser;
const mongoose_1 = __importDefault(require("mongoose"));
const rateLimitSchema = new mongoose_1.default.Schema({
    userId: { type: String, index: true, required: true },
    action: { type: String, index: true, required: true },
    windowStart: { type: Date, index: true, required: true },
    count: { type: Number, default: 0 },
}, { versionKey: false });
rateLimitSchema.index({ userId: 1, action: 1, windowStart: 1 }, { unique: true });
const RateLimitModel = mongoose_1.default.model("RateLimit", rateLimitSchema);
function rateLimitByUser(action, limit, windowMs) {
    return async (req, res, next) => {
        var _a;
        try {
            const user = req.user;
            const userId = ((_a = user === null || user === void 0 ? void 0 : user._id) === null || _a === void 0 ? void 0 : _a.toString()) || (user === null || user === void 0 ? void 0 : user.microsoftId) || "anonymous";
            const now = Date.now();
            const windowStart = new Date(now - (now % windowMs));
            // Upsert the counter for this user/action/window
            const updated = await RateLimitModel.findOneAndUpdate({ userId, action, windowStart }, { $inc: { count: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
            if (((updated === null || updated === void 0 ? void 0 : updated.count) || 0) > limit) {
                const retryAfterSec = Math.ceil((windowStart.getTime() + windowMs - now) / 1000);
                res.setHeader("Retry-After", String(retryAfterSec));
                return res.status(429).json({
                    message: "Rate limit exceeded",
                    action,
                    limit,
                    windowMs,
                    retryAfterSec,
                });
            }
            next();
        }
        catch (error) {
            return res.status(500).json({ message: "Rate limit error" });
        }
    };
}
