import { Request, Response } from "express";
import { SharePermission } from "../models/SharePermission";
import { publishEvent } from "../lib/events";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
}

function generateId(prefix: string = "shr"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

export const shareController = {
  async list(req: AuthRequest, res: Response) {
    try {
      const { resourceType, resourceId } = req.query as any;
      if (!resourceType || !resourceId) {
        return res.status(400).json({ error: "resourceType and resourceId are required" });
      }
      const items = await SharePermission.find({
        domain: req.userDomain,
        resourceType,
        resourceId,
      }).sort({ createdAt: -1 });
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: "Failed to list shares" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const { resourceType, resourceId, scope, principalId, role, expiresAt, invitedEmail } = req.body || {};
      if (!resourceType || !resourceId || !scope || !role) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (scope !== "link" && !principalId) {
        return res.status(400).json({ error: "principalId is required for user/workspace scope" });
      }
      const payload: any = {
        id: generateId(),
        resourceType,
        resourceId,
        domain: req.userDomain,
        scope,
        principalId: principalId || null,
        role,
        invitedEmail: invitedEmail || null,
        createdBy: req.user?._id?.toString?.(),
      };
      if (expiresAt) payload.expiresAt = new Date(expiresAt);
      const share = new SharePermission(payload);
      await share.save();
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "share.granted",
        resourceType: resourceType,
        resourceId: resourceId,
        title: `Share granted: ${role}`,
      });
      res.status(201).json(share);
    } catch (err) {
      res.status(500).json({ error: "Failed to create share" });
    }
  },

  async revoke(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const toDelete = await SharePermission.findOne({ id, domain: req.userDomain });
      const deleted = await SharePermission.deleteOne({ id, domain: req.userDomain });
      if (deleted.deletedCount === 0) {
        return res.status(404).json({ error: "Share not found" });
      }
      if (toDelete) {
        await publishEvent({
          actorUserId: req.user?._id?.toString?.(),
          domain: req.userDomain!,
          action: "share.revoked",
          resourceType: toDelete.resourceType,
          resourceId: toDelete.resourceId,
          title: `Share revoked`,
        });
      }
      res.json({ message: "Share revoked" });
    } catch (err) {
      res.status(500).json({ error: "Failed to revoke share" });
    }
  },

  async linkCreateOrRotate(req: AuthRequest, res: Response) {
    try {
      const { resourceType, resourceId, role, expiresAt } = req.body || {};
      if (!resourceType || !resourceId || !role) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      // Upsert one link per resource/domain
      const token = generateToken();
      const update: any = {
        id: generateId("lnk"),
        resourceType,
        resourceId,
        domain: req.userDomain,
        scope: "link",
        role,
        linkToken: token,
        createdBy: req.user?._id?.toString?.(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      };
      const link = await SharePermission.findOneAndUpdate(
        { domain: req.userDomain, resourceType, resourceId, scope: "link" },
        update,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "share.link.rotated",
        resourceType,
        resourceId,
        title: `Share link created/rotated`,
      });
      res.json({ token: link.linkToken });
    } catch (err) {
      res.status(500).json({ error: "Failed to create link" });
    }
  },

  async linkResolve(req: Request, res: Response) {
    try {
      const { token } = req.params as any;
      // Find any domain link (domain-agnostic resolve by token)
      const link = await SharePermission.findOne({ scope: "link", linkToken: token });
      if (!link) {
        return res.status(404).json({ error: "Invalid link" });
      }
      if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
        return res.status(410).json({ error: "Link expired" });
      }
      res.json({
        resourceType: link.resourceType,
        resourceId: link.resourceId,
        role: link.role,
        domain: link.domain,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve link" });
    }
  },
};


