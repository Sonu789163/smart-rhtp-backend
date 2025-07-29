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
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
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
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://Sonu7891:Sonu1234@cluster0.qfv4x.mongodb.net/pdf-summarizer";

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/summaries", summaryRoutes);
app.use("/api/reports", reportRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Allow only your frontend domain
