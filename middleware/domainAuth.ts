import { Request, Response, NextFunction } from "express";
import { User } from "../models/User";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
}

export const domainAuthMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Get user's domain from the authenticated user
    const userDomain = req.user.domain;

    if (!userDomain) {
      return res.status(400).json({
        message: "User domain not found. Please contact administrator.",
      });
    }

    // Add user's domain to request for use in controllers
    req.userDomain = userDomain;
    next();
  } catch (error) {
    console.error("Domain authentication error:", error);
    res.status(500).json({ message: "Domain authentication failed" });
  }
};

// Middleware to ensure user can only access data from their domain
export const ensureDomainAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userDomain = req.userDomain;
    const requestedDomain = req.params.domain || req.query.domain;

    // If no specific domain is requested, allow access to user's own domain
    if (!requestedDomain) {
      return next();
    }

    // Check if user is trying to access data from their own domain
    if (requestedDomain !== userDomain) {
      return res.status(403).json({
        message: "Access denied. You can only access data from your domain.",
      });
    }

    next();
  } catch (error) {
    console.error("Domain access check error:", error);
    res.status(500).json({ message: "Domain access check failed" });
  }
};

// Middleware for admin users to access all domains (optional)
export const adminDomainAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.user.role === "admin") {
      // Admins can access all domains
      return next();
    }

    // For non-admin users, use regular domain access check
    return ensureDomainAccess(req, res, next);
  } catch (error) {
    console.error("Admin domain access check error:", error);
    res.status(500).json({ message: "Admin domain access check failed" });
  }
};
