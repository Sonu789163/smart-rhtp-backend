"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthController = void 0;
const healthService_1 = require("../services/healthService");
exports.healthController = {
    async getSystemHealth(req, res) {
        try {
            // Check if user is admin
            const user = req.user;
            if (!user || user.role !== "admin") {
                return res.status(403).json({ error: "Access denied. Admin only." });
            }
            const report = await healthService_1.HealthService.generateFullReport();
            res.json(report);
        }
        catch (error) {
            console.error("Error in getSystemHealth:", error);
            res.status(500).json({ error: "Failed to generate health report", message: error.message });
        }
    },
    async basicHealth(req, res) {
        res.json({ status: "operational", timestamp: new Date().toISOString() });
    }
};
