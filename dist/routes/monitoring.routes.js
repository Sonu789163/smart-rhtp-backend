"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const OpenAiUsage_1 = require("../models/OpenAiUsage");
const router = express_1.default.Router();
function rangeQuery(range) {
    if (!range || range === "7")
        return {};
    const days = range === "7" ? 7 : 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { timestamp: { $gte: from } };
}
// POST endpoint for n8n to log OpenAI usage (no auth required for webhook)
router.post("/openai/log", async (req, res) => {
    try {
        const { userId, domain, route, model, promptTokens, completionTokens, totalTokens, status, error } = req.body;
        // Validate required fields
        if (!model || !totalTokens) {
            return res.status(400).json({
                message: "Missing required fields: model and totalTokens"
            });
        }
        // Create usage record
        const usageRecord = new OpenAiUsage_1.OpenAiUsage({
            timestamp: new Date(),
            userId: userId || 'n8n-workflow',
            domain: domain || 'system',
            route: route || 'n8n-workflow',
            model,
            promptTokens: promptTokens || 0,
            completionTokens: completionTokens || 0,
            totalTokens,
            status: status || 'success',
            error: error || undefined
        });
        await usageRecord.save();
        res.status(201).json({
            message: "Usage logged successfully",
            id: usageRecord._id
        });
    }
    catch (error) {
        console.error("Error logging OpenAI usage:", error);
        res.status(500).json({ message: "Failed to log usage" });
    }
});
// Apply auth middleware to monitoring endpoints (admin only)
router.use(auth_1.authMiddleware, (0, auth_1.authorize)(["admin"]));
router.get("/openai", async (req, res) => {
    try {
        const range = String(req.query.range || "7");
        const match = rangeQuery(range);
        const totals = await OpenAiUsage_1.OpenAiUsage.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    requests: { $sum: 1 },
                    promptTokens: { $sum: "$promptTokens" },
                    completionTokens: { $sum: "$completionTokens" },
                    totalTokens: { $sum: "$totalTokens" },
                },
            },
        ]);
        const byModel = await OpenAiUsage_1.OpenAiUsage.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$model",
                    requests: { $sum: 1 },
                    totalTokens: { $sum: "$totalTokens" },
                },
            },
            { $sort: { totalTokens: -1 } },
            { $limit: 10 },
        ]);
        const byDay = await OpenAiUsage_1.OpenAiUsage.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        y: { $year: "$timestamp" },
                        m: { $month: "$timestamp" },
                        d: { $dayOfMonth: "$timestamp" },
                    },
                    requests: { $sum: 1 },
                    totalTokens: { $sum: "$totalTokens" },
                },
            },
            { $sort: { "_id.y": 1, "_id.m": 1, "_id.d": 1 } },
        ]);
        res.json({
            totals: totals[0] || {
                requests: 0,
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
            },
            byModel,
            byDay,
        });
    }
    catch (e) {
        res.status(500).json({ message: "Failed to load OpenAI metrics" });
    }
});
router.get("/openai/top-users", async (req, res) => {
    try {
        const range = String(req.query.range || "30");
        const match = rangeQuery(range);
        const topUsers = await OpenAiUsage_1.OpenAiUsage.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { userId: "$userId", domain: "$domain" },
                    requests: { $sum: 1 },
                    totalTokens: { $sum: "$totalTokens" },
                },
            },
            { $sort: { totalTokens: -1 } },
            { $limit: 10 },
        ]);
        res.json({ topUsers });
    }
    catch (e) {
        res.status(500).json({ message: "Failed to load OpenAI top users" });
    }
});
exports.default = router;
