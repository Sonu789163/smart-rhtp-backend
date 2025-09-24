import { Request, Response, NextFunction } from "express";
import { Directory } from "../models/Directory";
import { Document } from "../models/Document";
import { Summary } from "../models/Summary";
import { Report } from "../models/Report";
import { SharePermission } from "../models/SharePermission";

type Role = "none" | "viewer" | "editor" | "owner";

function roleRank(role: Role): number {
  switch (role) {
    case "viewer": return 1;
    case "editor": return 2;
    case "owner": return 3;
    default: return 0;
  }
}

async function getUserRoleForDirectory(req: any, directoryId: string | null): Promise<Role> {
  // Root directory: allow editor for authenticated users within domain (can create top-level folders)
  if (!directoryId) return "editor";

  // Admins are owners
  if (req.user?.role === "admin") return "owner";

  const domain = req.userDomain;
  const dir = await Directory.findOne({ id: directoryId, domain });
  if (!dir) return "none";
  if (dir.ownerUserId && req.user?._id && dir.ownerUserId === req.user._id.toString()) {
    return "owner";
  }

  // Link access
  const link = (req as any).linkAccess;
  if (link && link.resourceType === "directory" && link.resourceId === directoryId) {
    return link.role as Role;
  }

  // Direct share for user
  const userId = req.user?._id?.toString?.();
  if (userId) {
    const share = await SharePermission.findOne({ domain, resourceType: "directory", resourceId: directoryId, scope: "user", principalId: userId });
    if (share) return share.role as Role;
  }

  // Workspace share by domain or currentWorkspace
  const workspaceKey = req.currentWorkspace || domain;
  const wsShare = await SharePermission.findOne({ domain, resourceType: "directory", resourceId: directoryId, scope: "workspace", principalId: workspaceKey });
  if (wsShare) return wsShare.role as Role;

  return "none";
}

async function getUserRoleForDocument(req: any, documentId: string): Promise<Role> {
  // Admins are owners
  if (req.user?.role === "admin") return "owner";
  const domain = req.userDomain;
  const doc = await Document.findOne({ id: documentId, domain });
  if (!doc) return "none";

  // All workspace members get editor access to documents in their workspace
  const currentWorkspace = req.currentWorkspace || domain;
  if (doc.workspaceId === currentWorkspace) {
    return "editor";
  }

  // Link access
  const link = (req as any).linkAccess;
  if (link && link.resourceType === "document" && link.resourceId === documentId) {
    return link.role as Role;
  }
  // Extended link access: if link is for related pair (DRHP <-> RHP), allow same role
  if (link && link.resourceType === "document") {
    // If requested doc is RHP and the link was for its DRHP
    if (doc.type === "RHP" && doc.relatedDrhpId === link.resourceId) {
      return link.role as Role;
    }
    // If requested doc is DRHP and the link was for its RHP
    if (doc.type === "DRHP" && doc.relatedRhpId && doc.relatedRhpId === link.resourceId) {
      return link.role as Role;
    }
  }

  // Direct share for user
  const userId = req.user?._id?.toString?.();
  if (userId) {
    const share = await SharePermission.findOne({ domain, resourceType: "document", resourceId: documentId, scope: "user", principalId: userId });
    if (share) return share.role as Role;
  }

  // Workspace share
  const workspaceKey = req.currentWorkspace || domain;
  const wsShare = await SharePermission.findOne({ domain, resourceType: "document", resourceId: documentId, scope: "workspace", principalId: workspaceKey });
  if (wsShare) return wsShare.role as Role;

  return "none";
}

export function requireDirectoryPermission(paramKey: string, needed: Exclude<Role, "none">) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idRaw = (req.params as any)[paramKey] ?? (req.body as any)[paramKey] ?? (req.query as any)[paramKey];
      const directoryId = idRaw === "root" ? null : idRaw;
      const role = await getUserRoleForDirectory(req, directoryId);
      if (roleRank(role) < roleRank(needed)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      next();
    } catch (err) {
      res.status(500).json({ message: "Permission check failed" });
    }
  };
}

// Check permission based on document id provided in request body
export function requireBodyDocumentPermission(bodyKey: string, needed: Exclude<Role, "none">) {
  return async function (req: any, res: any, next: any) {
    try {
      const documentId = req.body?.[bodyKey];
      if (!documentId) return res.status(400).json({ error: `Missing ${bodyKey}` });
      const role = await getUserRoleForDocument(req, documentId);
      if (roleRank(role) < roleRank(needed)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}

// Check permission for a summary by summary id (maps to its document access)
export function requireSummaryPermission(paramKey: string, needed: Exclude<Role, "none">) {
  return async function (req: any, res: any, next: any) {
    try {
      const summaryId = req.params?.[paramKey];
      const summary = await Summary.findOne({ id: summaryId, domain: req.userDomain });
      if (!summary) return res.status(404).json({ error: "Summary not found" });
      const role = await getUserRoleForDocument(req, summary.documentId);
      if (roleRank(role) < roleRank(needed)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}

// Check permission for a report by report id (uses DRHP id for permission)
export function requireReportPermission(paramKey: string, needed: Exclude<Role, "none">) {
  return async function (req: any, res: any, next: any) {
    try {
      const reportId = req.params?.[paramKey];
      const report = await Report.findOne({ id: reportId, domain: req.userDomain });
      if (!report) return res.status(404).json({ error: "Report not found" });
      const role = await getUserRoleForDocument(req, report.drhpId || report.rhpId);
      if (roleRank(role) < roleRank(needed)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}

export function requireDocumentPermission(paramKey: string, needed: Exclude<Role, "none">) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const documentId = (req.params as any)[paramKey] ?? (req.body as any)[paramKey] ?? (req.query as any)[paramKey];
      const role = await getUserRoleForDocument(req, documentId);
      if (roleRank(role) < roleRank(needed)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      next();
    } catch (err) {
      res.status(500).json({ message: "Permission check failed" });
    }
  };
}

export async function requireCreateInDirectory(req: any, res: Response, next: NextFunction) {
  try {
    const idRaw = req.body?.parentId ?? req.body?.directoryId ?? null;
    const directoryId = idRaw === "root" ? null : idRaw;
    const role = await getUserRoleForDirectory(req, directoryId);
    if (roleRank(role) < roleRank("editor")) {
      return res.status(403).json({ message: "Insufficient permissions to create here" });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: "Permission check failed" });
  }
}


