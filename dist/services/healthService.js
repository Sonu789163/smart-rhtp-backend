"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const axios_1 = __importDefault(require("axios"));
const r2_1 = require("../config/r2");
const emailService_1 = require("./emailService");
const emailService_2 = __importDefault(require("./emailService"));
class HealthService {
    static async checkMongoDB() {
        const start = Date.now();
        const state = mongoose_1.default.connection.readyState;
        // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
        if (state === 1) {
            return {
                status: "operational",
                message: "Connected to MongoDB",
                latency: Date.now() - start,
            };
        }
        return {
            status: "error",
            message: `MongoDB connection state: ${state}`,
            error_code: "DB_CONNECTION_ERROR",
        };
    }
    static async checkBrevo() {
        const isReady = await (0, emailService_1.testSmtpConnection)();
        return {
            status: isReady ? "operational" : "error",
            message: isReady ? "Brevo (SMTP) is ready" : "Brevo configuration is incomplete or failing",
        };
    }
    static async checkCloudflareR2() {
        const start = Date.now();
        try {
            // Use HeadBucket or ListObjects instead of ListBuckets (which often requires account-level permissions)
            const { ListObjectsV2Command } = await Promise.resolve().then(() => __importStar(require("@aws-sdk/client-s3")));
            await r2_1.r2Client.send(new ListObjectsV2Command({ Bucket: r2_1.R2_BUCKET, MaxKeys: 1 }));
            return {
                status: "operational",
                message: `Successfully connected to Cloudflare R2 (Bucket: ${r2_1.R2_BUCKET})`,
                latency: Date.now() - start,
            };
        }
        catch (error) {
            console.error("R2 Health Check Error:", error);
            return {
                status: "error",
                message: error.name === "AccessDenied" ? "Access Denied (Check token permissions)" : error.message,
                error_code: "R2_ACCESS_ERROR",
            };
        }
    }
    static async checkAzureStorage() {
        // Placeholder for future Azure integration
        if (!process.env.AZURE_STORAGE_CONNECTION_STRING && !process.env.AZURE_STORAGE_ACCOUNT_NAME) {
            return {
                status: "not_configured",
                message: "Azure Storage variables not set. Skipping.",
            };
        }
        return {
            status: "operational",
            message: "Azure Storage check configured (Future)",
        };
    }
    static async checkAIPlatform() {
        const start = Date.now();
        const pythonUrl = process.env.PYTHON_API_URL || "http://localhost:8000";
        try {
            const response = await axios_1.default.get(`${pythonUrl}/health/detailed`, { timeout: 10000 });
            return {
                status: "operational",
                message: "Successfully connected to AI Python Platform",
                latency: Date.now() - start,
                details: response.data,
            };
        }
        catch (error) {
            return {
                status: "error",
                message: `Failed to connect to AI Python Platform: ${error.message}`,
                error_code: "AI_PLATFORM_UNREACHABLE",
            };
        }
    }
    static async generateFullReport() {
        var _a, _b, _c;
        console.log("HealthService: Starting full report generation...");
        let mongodb, brevo, cloudflare_r2, azure_storage, ai_platform;
        try {
            [mongodb, brevo, cloudflare_r2, azure_storage, ai_platform] = await Promise.all([
                this.checkMongoDB().catch(e => ({ status: "error", message: `MongoDB Check Crash: ${e.message}` })),
                this.checkBrevo().catch(e => ({ status: "error", message: `Brevo Check Crash: ${e.message}` })),
                this.checkCloudflareR2().catch(e => ({ status: "error", message: `R2 Check Crash: ${e.message}` })),
                this.checkAzureStorage().catch(e => ({ status: "error", message: `Azure Check Crash: ${e.message}` })),
                this.checkAIPlatform().catch(e => ({ status: "error", message: `AI Platform Check Crash: ${e.message}` })),
            ]);
            console.log("HealthService Results:", {
                mongodb: mongodb.status,
                brevo: brevo.status,
                cloudflare_r2: cloudflare_r2.status,
                ai_platform: ai_platform.status,
                ai_platform_overall: (_a = ai_platform.details) === null || _a === void 0 ? void 0 : _a.overall_status
            });
        }
        catch (e) {
            console.error("HealthService: Promise.all failed critically:", e);
            throw e;
        }
        let overall = "operational";
        if ([mongodb, brevo, cloudflare_r2, ai_platform].some(s => s.status === "error")) {
            overall = "error";
        }
        else if (((_b = ai_platform.details) === null || _b === void 0 ? void 0 : _b.overall_status) === "error") {
            overall = "error";
        }
        else if ([mongodb, brevo, cloudflare_r2, ai_platform].some(s => s.status === "degraded")) {
            overall = "degraded";
        }
        const externalAiServices = ((_c = ai_platform.details) === null || _c === void 0 ? void 0 : _c.services) || {};
        const report = {
            overall_status: overall,
            timestamp: new Date().toISOString(),
            platform: {
                name: "Node.js Backend",
                version: "1.0.0",
                status: "operational",
            },
            services: {
                mongodb,
                brevo,
                cloudflare_r2,
                azure_storage,
                ai_platform,
                external_ai: {
                    openai: externalAiServices.openai || { status: "not_configured", message: "Not checked" },
                    pinecone: externalAiServices.pinecone || { status: "not_configured", message: "Not checked" },
                    cohere: externalAiServices.cohere || { status: "not_configured", message: "Not checked" },
                    perplexity: externalAiServices.perplexity || { status: "not_configured", message: "Not checked" },
                }
            },
        };
        // If critical error, send email alert
        if (overall === "error" && this.shouldSendAlert(report)) {
            console.log("HealthService: Triggering email alert...");
            this.sendEmailAlert(report).catch(err => console.error("HealthService: Async email alert failed:", err));
        }
        this.lastReport = report;
        return report;
    }
    static shouldSendAlert(report) {
        // Basic throttle logic: don't spam emails
        // For now, if Status changed to error, send alert.
        if (!this.lastReport || this.lastReport.overall_status !== "error") {
            return true;
        }
        return false;
    }
    static async sendEmailAlert(report) {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.BREVO_FROM_EMAIL;
        if (!adminEmail)
            return;
        try {
            const failingServices = Object.entries(report.services)
                .filter(([_, s]) => { var _a; return s.status === "error" || (((_a = s.details) === null || _a === void 0 ? void 0 : _a.overall_status) === "error"); })
                .map(([name, _]) => name);
            await (0, emailService_2.default)({
                to: adminEmail,
                subject: `[CRITICAL] System Health Alert - ${failingServices.join(", ")}`,
                template: "system-alert",
                data: {
                    timestamp: report.timestamp,
                    overall_status: report.overall_status,
                    services: report.services,
                    failingServices,
                    dashboardUrl: `${process.env.FRONTEND_URL}/admin/dashboard?tab=health`
                }
            });
            console.log("Health alert email sent to admin");
        }
        catch (error) {
            console.error("Failed to send health alert email:", error);
        }
    }
}
exports.HealthService = HealthService;
HealthService.lastReport = null;
