"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
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
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: [
            "https://rhp-document-summarizer.vercel.app",
            "http://localhost:8080",
        ],
        credentials: true,
    },
});
exports.io = io;
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)({
    origin: [
        "https://rhp-document-summarizer.vercel.app",
        "http://localhost:8080",
    ],
    credentials: true,
}));
app.use(express_1.default.json());
app.use(passport_1.default.initialize());
// Security middleware
app.use((0, helmet_1.default)());
// Rate limiting middleware
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 15 minutes
    max: 500, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);
// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
}
mongoose_1.default
    .connect(MONGODB_URI)
    .then(() => {
    console.log("Connected to MongoDB");
})
    .catch((error) => {
    console.error("MongoDB connection error:", error);
});
// Routes
app.use("/api/auth", auth_routes_1.default);
app.use("/api/documents", document_routes_1.default);
app.use("/api/chats", chat_routes_1.default);
app.use("/api/summaries", summary_routes_1.default);
app.use("/api/reports", report_routes_1.default);
app.use("/api/users", user_routes_1.default);
app.use("/api/workspace-invitations", workspaceInvitation_routes_1.default);
app.use("/api/invitation", publicInvitation_routes_1.default);
app.use("/api/directories", directory_routes_1.default);
// app.use("/api/trash", trashRoutes); // disabled for now
app.use("/api/shares", share_routes_1.default);
app.use("/api/notifications", notification_routes_1.default);
app.use("/api/workspaces", workspace_routes_1.default);
// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// Allow only your frontend domain
