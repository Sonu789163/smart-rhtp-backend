import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { validateEmail, getPrimaryDomain } from "../config/domainConfig";

// Helper to generate tokens
const generateTokens = async (user: any) => {
  const accessToken = jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      domain: user.domain,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "1d" }
  );
  const refreshToken = jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      domain: user.domain,
    },
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
    const { email, password, name } = req.body;
    try {
      // Validate email format and domain
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        return res.status(400).json({ message: emailValidation.error });
      }

      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Get the primary domain from email
      const domain = getPrimaryDomain(email);
      if (!domain) {
        return res.status(400).json({ message: "Invalid domain" });
      }

      // Check if this is the first user in the domain (will become admin)
      const isFirstUserInDomain = (await User.countDocuments({ domain })) === 0;
      const role = isFirstUserInDomain ? "admin" : "user";

      const hashedPassword = await bcrypt.hash(password, 10);
      user = new User({
        email,
        domain,
        password: hashedPassword,
        name: name || email.split("@")[0], // Use email prefix as name if not provided
        role: role, // Make sure role is set
      });

      await user.save();

      const tokens = await generateTokens(user);
      res.status(201).json({
        ...tokens,
        user: {
          userId: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
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
        { userId: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: "1d" }
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

  // Forgot Password
  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user || !user.password) {
        // Don't reveal if user exists or not
        return res.status(200).json({
          message: "If that email is registered, a reset link has been sent.",
        });
      }
      // Generate token
      const token = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = token;
      user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
      await user.save();

      // Send email
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      const resetUrl = `${
        process.env.FRONTEND_URL || "http://localhost:8080"
      }/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
      await transporter.sendMail({
        to: email,
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        subject: "Password Reset Request",
        html: `<p>You requested a password reset.</p><p>Click <a href="${resetUrl}">here</a> to reset your password. This link is valid for 1 hour.</p>`,
      });
      return res.status(200).json({
        message: "If that email is registered, a reset link has been sent.",
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  // Reset Password
  async resetPassword(req: Request, res: Response) {
    const { email, token, password } = req.body;
    try {
      const user = await User.findOne({
        email,
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });
      if (!user || !user.password) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
      user.password = await bcrypt.hash(password, 10);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      res.status(200).json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Server error" });
    }
  },
};
