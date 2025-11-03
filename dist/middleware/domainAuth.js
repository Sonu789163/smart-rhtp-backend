"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminDomainAccess = exports.ensureDomainAccess = exports.domainAuthMiddleware = void 0;
const User_1 = require("../models/User");
const Workspace_1 = require("../models/Workspace");
const WorkspaceMembership_1 = require("../models/WorkspaceMembership");
// Resolves the effective workspace for the request using `x-workspace` header
// or the user's saved `currentWorkspace`, and verifies access via WorkspaceMembership.
// No auto-creation - workspaces must be explicitly created.
const domainAuthMiddleware = async (req, res, next) => {
    var _a;
    try {
        // Check for link access first
        const linkAccess = req.linkAccess;
        if (linkAccess) {
            // Set domain from link access
            req.userDomain = linkAccess.domain;
            req.currentWorkspace = linkAccess.domain;
            return next();
        }
        if (!req.user) {
            return res.status(401).json({ message: "Authentication required" });
        }
        // Get user's current workspace from the request header or user's saved currentWorkspace
        // Handle null/undefined properly
        const headerWorkspace = req.headers["x-workspace"];
        const savedWorkspace = (_a = req.user) === null || _a === void 0 ? void 0 : _a.currentWorkspace;
        const requestedWorkspaceId = headerWorkspace || savedWorkspace || undefined;
        // Get user with domain information and accessibleWorkspaces (for backward compatibility)
        const user = await User_1.User.findById(req.user._id).select("domain domainId currentWorkspace accessibleWorkspaces role");
        if (!user) {
            return res.status(400).json({
                message: "User not found. Please contact administrator.",
            });
        }
        // If no workspace is requested and user has no currentWorkspace,
        // we need to check if they have any workspaces at all (via membership or accessibleWorkspaces)
        if (!requestedWorkspaceId) {
            const memberships = await WorkspaceMembership_1.WorkspaceMembership.find({
                userId: user._id,
                status: "active",
            });
            // Also check legacy accessibleWorkspaces for backward compatibility
            const legacyWorkspaces = (user.accessibleWorkspaces || []).filter((ws) => ws.isActive !== false);
            if (memberships.length === 0 && legacyWorkspaces.length === 0) {
                // User has no workspace access - this is OK for certain endpoints (like check-first-login)
                // For other endpoints, they'll get a 403 from the specific controller
                req.userDomain = user.domain;
                req.currentWorkspace = undefined;
                return next();
            }
            // Prefer membership-based workspace, fallback to legacy
            let firstWorkspaceId;
            if (memberships.length > 0) {
                const firstWorkspace = await Workspace_1.Workspace.findOne({
                    workspaceId: memberships[0].workspaceId,
                    status: "active",
                });
                if (firstWorkspace) {
                    firstWorkspaceId = firstWorkspace.workspaceId;
                }
            }
            // Fallback to legacy accessibleWorkspaces
            if (!firstWorkspaceId && legacyWorkspaces.length > 0) {
                // Try to find workspace by slug (legacy system used slug as workspaceDomain)
                const legacySlug = legacyWorkspaces[0].workspaceDomain;
                // Check if legacySlug is actually a domain (legacy behavior)
                if (legacySlug === user.domain) {
                    firstWorkspaceId = user.domain; // Use domain as workspaceId for legacy compatibility
                }
                else {
                    // Try to find workspace by slug
                    const legacyWorkspace = await Workspace_1.Workspace.findOne({
                        domain: user.domain,
                        slug: legacySlug,
                        status: "active",
                    });
                    if (legacyWorkspace) {
                        firstWorkspaceId = legacyWorkspace.workspaceId;
                    }
                    else {
                        // If no workspace found in DB, use the slug as workspaceId (for backward compatibility)
                        // This handles legacy cases where workspaceDomain was just a slug
                        firstWorkspaceId = legacySlug;
                    }
                }
            }
            if (firstWorkspaceId) {
                user.currentWorkspace = firstWorkspaceId;
                await user.save();
                req.userDomain = user.domain;
                req.currentWorkspace = firstWorkspaceId;
                return next();
            }
            // If still no workspace but user is admin, allow access (they might be creating workspace)
            if (user.role === "admin") {
                req.userDomain = user.domain;
                // Try to find any workspace for the domain
                const domainWorkspace = await Workspace_1.Workspace.findOne({
                    domain: user.domain,
                    status: "active",
                });
                req.currentWorkspace = (domainWorkspace === null || domainWorkspace === void 0 ? void 0 : domainWorkspace.workspaceId) || user.domain; // Use workspaceId if found, domain as fallback
                return next();
            }
            // For non-admin users without workspace access, set currentWorkspace to help with debugging
            // But this will cause 400 error in controllers, which is expected
            req.userDomain = user.domain;
            req.currentWorkspace = undefined;
            return next();
        }
        // Verify workspace exists - handle both workspaceId and legacy slug
        let workspace = await Workspace_1.Workspace.findOne({
            workspaceId: requestedWorkspaceId,
            status: "active",
        });
        // If not found by workspaceId, try legacy slug lookup
        if (!workspace) {
            workspace = await Workspace_1.Workspace.findOne({
                domain: user.domain,
                slug: requestedWorkspaceId,
                status: "active",
            });
        }
        // If still not found, check for legacy support
        if (!workspace) {
            // Legacy behavior: if requestedWorkspaceId matches domain, find the actual workspace
            if (requestedWorkspaceId === user.domain) {
                // Try to find the first active workspace for this user via membership
                const memberships = await WorkspaceMembership_1.WorkspaceMembership.find({
                    userId: user._id,
                    status: "active",
                });
                if (memberships.length > 0) {
                    const firstWorkspace = await Workspace_1.Workspace.findOne({
                        workspaceId: memberships[0].workspaceId,
                        domain: user.domain,
                        status: "active",
                    });
                    if (firstWorkspace) {
                        req.userDomain = user.domain;
                        req.currentWorkspace = firstWorkspace.workspaceId;
                        // Update user's currentWorkspace
                        if (user.currentWorkspace !== firstWorkspace.workspaceId) {
                            user.currentWorkspace = firstWorkspace.workspaceId;
                            await user.save();
                        }
                        return next();
                    }
                }
                // Fallback: use domain as workspace (for backward compatibility)
                req.userDomain = user.domain;
                req.currentWorkspace = user.domain;
                return next();
            }
            // Check if user has legacy accessibleWorkspaces entry for this workspace
            const hasLegacyAccess = (user.accessibleWorkspaces || []).some((ws) => {
                const wsDomain = (ws.workspaceDomain || "").toLowerCase();
                const requested = (requestedWorkspaceId || "").toLowerCase();
                return wsDomain === requested && ws.isActive !== false;
            });
            // If user has legacy access, allow it (for backward compatibility)
            if (hasLegacyAccess) {
                req.userDomain = user.domain;
                req.currentWorkspace = requestedWorkspaceId; // Keep as-is for legacy compatibility
                return next();
            }
            // If admin, allow access even without explicit workspace (they might be creating one)
            if (user.role === "admin") {
                req.userDomain = user.domain;
                req.currentWorkspace = requestedWorkspaceId || user.domain;
                return next();
            }
            // Only reject if user truly has no access
            return res.status(403).json({
                message: "Workspace not found or you don't have access to it",
            });
        }
        // Verify workspace belongs to user's domain
        if (workspace.domain !== user.domain) {
            return res.status(403).json({
                message: "Access denied. Workspace does not belong to your domain.",
            });
        }
        // Check if user has membership in this workspace
        const membership = await WorkspaceMembership_1.WorkspaceMembership.findOne({
            userId: user._id,
            workspaceId: workspace.workspaceId,
            status: "active",
        });
        // Also check legacy accessibleWorkspaces for backward compatibility
        const hasLegacyAccess = !membership && (user.accessibleWorkspaces || []).some((ws) => {
            const wsDomain = (ws.workspaceDomain || "").toLowerCase();
            const workspaceSlug = workspace.slug.toLowerCase();
            const workspaceIdMatch = wsDomain === workspace.workspaceId.toLowerCase();
            const slugMatch = wsDomain === workspaceSlug;
            return (workspaceIdMatch || slugMatch) && ws.isActive !== false;
        });
        // Also check if user is domain admin (admins have access to all workspaces in their domain)
        const isDomainAdmin = user.role === "admin";
        if (!membership && !hasLegacyAccess && !isDomainAdmin) {
            return res.status(403).json({
                message: "Access denied. You do not have access to this workspace.",
            });
        }
        // Use workspace.workspaceId (not the requested ID which might be a slug)
        const effectiveWorkspaceId = workspace.workspaceId;
        // Update user's currentWorkspace if different (use workspaceId, not slug)
        if (user.currentWorkspace !== effectiveWorkspaceId) {
            user.currentWorkspace = effectiveWorkspaceId;
            await user.save();
        }
        // Set workspace context for controllers
        req.userDomain = user.domain; // Always use actual domain
        req.currentWorkspace = effectiveWorkspaceId; // Use actual workspaceId
        next();
    }
    catch (error) {
        console.error("Domain authentication error:", error);
        res.status(500).json({ message: "Domain authentication failed" });
    }
};
exports.domainAuthMiddleware = domainAuthMiddleware;
// Middleware to ensure user can only access data from their domain
const ensureDomainAccess = (req, res, next) => {
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
    }
    catch (error) {
        console.error("Domain access check error:", error);
        res.status(500).json({ message: "Domain access check failed" });
    }
};
exports.ensureDomainAccess = ensureDomainAccess;
// Middleware for admin users to access all domains (optional)
const adminDomainAccess = (req, res, next) => {
    try {
        if (req.user.role === "admin") {
            // Admins can access all domains
            return next();
        }
        // For non-admin users, use regular domain access check
        return (0, exports.ensureDomainAccess)(req, res, next);
    }
    catch (error) {
        console.error("Admin domain access check error:", error);
        res.status(500).json({ message: "Admin domain access check failed" });
    }
};
exports.adminDomainAccess = adminDomainAccess;
