import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

// Helper to generate tokens
const generateTokens = async (user: any) => {
  const accessToken = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: "24h" }
  );
  const refreshToken = jwt.sign(
    { userId: user._id, email: user.email },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "7d" }
  );

  // Store refresh token
  if (!user.refreshTokens) {
    user.refreshTokens = [];
  }
  user.refreshTokens.push(refreshToken);
  await user.save();

  return { accessToken, refreshToken };
};

export const authController = {
  // Register a new user
  async register(req: Request, res: Response) {
    const { email, password } = req.body;
    try {
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      user = new User({ email, password: hashedPassword });
      await user.save();

      const tokens = await generateTokens(user);
      res.status(201).json(tokens);
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  },

  // Login a user
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user || !user.password) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      user.lastLogin = new Date();
      const tokens = await generateTokens(user);
      res.json(tokens);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  // Refresh access token
  async refreshToken(req: Request, res: Response) {
    const { token } = req.body;
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as any;
      const user = await User.findById(decoded.userId);

      if (!user || !user.refreshTokens.includes(token)) {
        return res.status(403).json({ message: "Invalid refresh token" });
      }

      const accessToken = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET!,
        { expiresIn: "24h" }
      );

      res.json({ accessToken });
    } catch (error) {
      res.status(403).json({ message: "Invalid refresh token" });
    }
  },

  // Logout
  async logout(req: Request, res: Response) {
    const { refreshToken } = req.body;
    try {
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!
      ) as any;
      const user = await User.findById(decoded.userId);
      if (user) {
        user.refreshTokens = user.refreshTokens.filter(
          (t) => t !== refreshToken
        );
        await user.save();
      }
      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(400).json({ message: "Invalid refresh token" });
    }
  },
};
