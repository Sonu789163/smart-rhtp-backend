import { Request, Response, NextFunction } from "express";
import { User } from "../models/User";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

// Resolves the effective workspace/domain for the request using `x-workspace`,
// link access, or the user's saved `currentWorkspace`, and stores it on req.
export const domainAuthMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check for link access first
    const linkAccess = (req as any).linkAccess;
    if (linkAccess) {
      // Set domain from link access
      req.userDomain = linkAccess.domain;
      req.currentWorkspace = linkAccess.domain;
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Get user's current workspace from the request or user's currentWorkspace
    const requestedWorkspace =
      (req.headers["x-workspace"] as string) || req.user.currentWorkspace;

    // Get user with workspace access information
    const user = await User.findById(req.user._id).select(
      "domain accessibleWorkspaces currentWorkspace"
    );

    if (!user) {
      return res.status(400).json({
        message: "User not found. Please contact administrator.",
      });
    }

    // Initialize accessibleWorkspaces if it doesn't exist (for existing users)
    if (!user.accessibleWorkspaces) {
      user.accessibleWorkspaces = [];
    }

    // Initialize currentWorkspace if it doesn't exist (for existing users)
    if (!user.currentWorkspace) {
      user.currentWorkspace = user.domain;
    }

    // First, ensure no duplicates exist (keep first occurrence)
    const seenDomains: Record<string, boolean> = {};
    const originalLength = user.accessibleWorkspaces.length;
    user.accessibleWorkspaces = user.accessibleWorkspaces.filter((ws: any) => {
      const key = (ws.workspaceDomain || "").toLowerCase();
      if (seenDomains[key]) return false;
      seenDomains[key] = true;
      return true;
    });

    // Add user's primary domain to accessible workspaces if not already present
    const hasPrimaryDomainAccess = user.accessibleWorkspaces.some(
      (ws: any) =>
        (ws.workspaceDomain || "").toLowerCase() ===
          (user.domain || "").toLowerCase() && ws.isActive
    );

    if (!hasPrimaryDomainAccess) {
      user.accessibleWorkspaces.push({
        workspaceDomain: user.domain,
        workspaceName: `${user.domain} Workspace`,
        role: "user", // All users get "user" role in accessibleWorkspaces, admin status is separate
        // Primary domain members should see all documents by default
        allowedTimeBuckets: ["all"],
        extraDocumentIds: [],
        blockedDocumentIds: [],
        invitedBy: user._id,
        joinedAt: new Date(),
        isActive: true,
      });
    }

    // Save user if we made any changes
    const hasChanges =
      !user.currentWorkspace ||
      !hasPrimaryDomainAccess ||
      user.accessibleWorkspaces.length !== originalLength;

    if (hasChanges) {
      await user.save();
    }

    // Determine which workspace to use
    let workspaceDomain = user.domain; // Default to user's primary domain

    if (requestedWorkspace) {
      // Check if user has access to the requested workspace
      const hasAccess = user.accessibleWorkspaces.some(
        (ws: any) => ws.workspaceDomain === requestedWorkspace && ws.isActive
      );

      if (hasAccess) {
        workspaceDomain = requestedWorkspace;
      } else {
        return res.status(403).json({
          message: "You don't have access to this workspace",
        });
      }
    } else {
      // Use user's current workspace or primary domain
      workspaceDomain = user.currentWorkspace || user.domain;
    }

    // Add workspace domain to request for use in controllers
    req.userDomain = workspaceDomain;
    req.currentWorkspace = workspaceDomain;
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
