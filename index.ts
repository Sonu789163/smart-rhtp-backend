import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import passport from "passport";
import documentRoutes from "./routes/document.routes";
import chatRoutes from "./routes/chat.routes";
import summaryRoutes from "./routes/summary.routes";
import authRoutes from "./routes/auth.routes";
import reportRoutes from "./routes/report.routes";
import userRoutes from "./routes/user.routes";
import workspaceInvitationRoutes from "./routes/workspaceInvitation.routes";
import publicInvitationRoutes from "./routes/publicInvitation.routes";
import directoryRoutes from "./routes/directory.routes";
// import trashRoutes from "./routes/trash.routes";
import shareRoutes from "./routes/share.routes";
import notificationRoutes from "./routes/notification.routes";
import workspaceRoutes from "./routes/workspace.routes";
import workspaceRequestRoutes from "./routes/workspaceRequest.routes";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { testSmtpConnection } from "./services/emailService";

dotenv.config();

const app = express();

// Trust proxy for Render deployment
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: [
      "https://rhp-document-summarizer.vercel.app",
      "http://localhost:8080",
    ],
    credentials: true,
  },
});

// Make io accessible elsewhere
export { io };

const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      "https://rhp-document-summarizer.vercel.app",
      "http://localhost:8080",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(passport.initialize());

// Security middleware
app.use(helmet());

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI ;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set");
}

mongoose
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
    testSmtpConnection().catch((err) => {
      console.error("SMTP test error:", err);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

// Handle MongoDB connection errors after initial connect
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/summaries", summaryRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/users", userRoutes);
app.use("/api/workspace-invitations", workspaceInvitationRoutes);
app.use("/api/invitation", publicInvitationRoutes);
app.use("/api/directories", directoryRoutes);
// app.use("/api/trash", trashRoutes); // disabled for now
app.use("/api/shares", shareRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/workspace-requests", workspaceRequestRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
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

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Allow only your frontend domain
