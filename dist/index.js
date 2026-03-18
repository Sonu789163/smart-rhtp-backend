"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const passport_1 = __importDefault(require("passport"));
const document_routes_1 = __importDefault(require("./routes/document.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const summary_routes_1 = __importDefault(require("./routes/summary.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const workspaceInvitation_routes_1 = __importDefault(require("./routes/workspaceInvitation.routes"));
const publicInvitation_routes_1 = __importDefault(require("./routes/publicInvitation.routes"));
const directory_routes_1 = __importDefault(require("./routes/directory.routes"));
// import trashRoutes from "./routes/trash.routes";
const share_routes_1 = __importDefault(require("./routes/share.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const workspace_routes_1 = __importDefault(require("./routes/workspace.routes"));
const workspaceRequest_routes_1 = __importDefault(require("./routes/workspaceRequest.routes"));
const newsCrawl_routes_1 = __importDefault(require("./routes/newsCrawl.routes"));
const newsArticle_routes_1 = __importDefault(require("./routes/newsArticle.routes"));
const domain_routes_1 = __importDefault(require("./routes/domain.routes"));
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const emailService_1 = require("./services/emailService");
const healthService_1 = require("./services/healthService");
dotenv_1.default.config();
exports.app = (0, express_1.default)();
// Trust proxy for Render deployment
exports.app.set('trust proxy', 1);
const server = http_1.default.createServer(exports.app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: function (origin, callback) {
            // Allow requests with no origin
            if (!origin)
                return callback(null, true);
            const allowedOrigins = [
                "https://rhp-document-summarizer.vercel.app",
                "http://localhost:8080",
                "http://localhost:3000",
            ];
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            }
            else if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                callback(null, true);
            }
            else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST'],
    },
});
exports.io = io;
const PORT = process.env.PORT || 5000;
// CORS configuration - must be before other middleware
const allowedOrigins = [
    "https://rhp-document-summarizer.vercel.app",
    "http://localhost:8080",
    "http://localhost:3000",
];
exports.app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            // For development, allow any localhost origin
            if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
                callback(null, true);
            }
            else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-workspace', 'x-link-token'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
}));
// Handle preflight requests explicitly
exports.app.options('*', (0, cors_1.default)());
exports.app.use(express_1.default.json());
exports.app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
exports.app.use(passport_1.default.initialize());
// Security middleware - configure helmet to work with CORS
exports.app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
}));
// Rate limiting middleware
// More lenient rate limiter for GET requests (read operations)
// This allows bulk data fetching without hitting rate limits
const readLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute window
    max: 500, // Allow 500 GET requests per minute per IP (for bulk operations like fetching all reports/summaries)
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many read requests, please try again later',
    skip: (req) => {
        // Skip rate limiting for non-GET requests (they'll use writeLimiter)
        return req.method !== 'GET';
    },
    // Use IP-based rate limiting (user auth happens after rate limiting)
    keyGenerator: (req) => {
        return req.ip || req.socket.remoteAddress || 'unknown';
    },
});
// Stricter rate limiter for write operations (POST, PUT, DELETE, PATCH)
const writeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute window
    max: 500, // Allow 500 write requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many write requests, please try again later',
    skip: (req) => {
        // Skip rate limiting for GET requests (they use readLimiter)
        return req.method === 'GET';
    },
    // Use IP-based rate limiting (user auth happens after rate limiting)
    keyGenerator: (req) => {
        return req.ip || req.socket.remoteAddress || 'unknown';
    },
});
// Apply read limiter to all routes
exports.app.use(readLimiter);
// Apply write limiter to all routes
exports.app.use(writeLimiter);
// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
}
if (process.env.NODE_ENV !== 'test') {
    mongoose_1.default
        .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        connectTimeoutMS: 10000, // Give up initial connection after 10s
        retryWrites: true,
        retryReads: true,
    })
        .then(async () => {
        console.log("Connected to MongoDB");
        // Test SMTP connection on startup (non-blocking)
        (0, emailService_1.testSmtpConnection)().catch((err) => {
            console.error("SMTP test error:", err);
        });
        // Initial System Health Check (non-blocking)
        healthService_1.HealthService.generateFullReport().then(report => {
            console.log(`System Startup Health: ${report.overall_status.toUpperCase()}`);
        }).catch(err => {
            console.error("Startup Health Check Error:", err);
        });
    })
        .catch((error) => {
        console.error("MongoDB connection error:", error);
    });
}
// Handle MongoDB connection errors after initial connect
mongoose_1.default.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});
mongoose_1.default.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
});
mongoose_1.default.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
});
// Routes
exports.app.use("/api/auth", auth_routes_1.default);
exports.app.use("/api/documents", document_routes_1.default);
exports.app.use("/api/chats", chat_routes_1.default);
exports.app.use("/api/summaries", summary_routes_1.default);
exports.app.use("/api/reports", report_routes_1.default);
exports.app.use("/api/users", user_routes_1.default);
exports.app.use("/api/workspace-invitations", workspaceInvitation_routes_1.default);
exports.app.use("/api/invitation", publicInvitation_routes_1.default);
exports.app.use("/api/directories", directory_routes_1.default);
// app.use("/api/trash", trashRoutes); // disabled for now
exports.app.use("/api/shares", share_routes_1.default);
exports.app.use("/api/notifications", notification_routes_1.default);
exports.app.use("/api/workspaces", workspace_routes_1.default);
exports.app.use("/api/workspace-requests", workspaceRequest_routes_1.default);
exports.app.use("/api/news-crawl", newsCrawl_routes_1.default);
exports.app.use("/api/news-articles", newsArticle_routes_1.default);
exports.app.use("/api/domain", domain_routes_1.default);
exports.app.use("/api/health", health_routes_1.default);
// Health check endpoint
exports.app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});
// Global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process, just log the error
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});
// Handle EPIPE errors specifically
process.on('SIGPIPE', () => {
    console.log('SIGPIPE received, ignoring...');
});
if (process.env.NODE_ENV !== 'test') {
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}
// Allow only your frontend domain
