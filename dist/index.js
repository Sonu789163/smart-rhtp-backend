"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const passport_1 = __importDefault(require("passport"));
const document_routes_1 = __importDefault(require("./routes/document.routes"));
const chat_routes_1 = __importDefault(require("./routes/chat.routes"));
const summary_routes_1 = __importDefault(require("./routes/summary.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL, // removed trailing slash
    credentials: true, // if you use cookies/auth
}));
app.use(express_1.default.json());
app.use(passport_1.default.initialize());
// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI ||
    "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";
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
// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
// Allow only your frontend domain
