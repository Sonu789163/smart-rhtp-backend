import { Request, Response } from "express";
import { Workspace } from "../models/Workspace";
import { User } from "../models/User";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
}

function generateWorkspaceId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function toSlug(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export const workspaceController = {
  // Create a new workspace under current user's domain (admin only)
  async create(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const domain = req.userDomain || user?.domain;
      const { name, slug: rawSlug } = req.body as { name: string; slug?: string };

      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Only domain admins can create workspaces" });
      }
      if (!name || name.trim().length < 2) {
        return res.status(400).json({ message: "Workspace name is required" });
      }
      const baseSlug = toSlug(rawSlug || name);
      if (!baseSlug) {
        return res.status(400).json({ message: "Invalid workspace slug" });
      }

      // Ensure slug uniqueness within the same domain
      const existing = await Workspace.findOne({ domain, slug: baseSlug });
      if (existing) {
        return res.status(400).json({ message: "A workspace with this URL already exists" });
      }

      const workspaceId = generateWorkspaceId();
      const workspace = new Workspace({
        workspaceId,
        domain,
        name: name.trim(),
        slug: baseSlug,
        ownerId: user._id,
        admins: [user._id]
      });

      await workspace.save();

      // Add to creator's accessibleWorkspaces if not present
      const creator = await User.findById(user._id);
      if (creator) {
        const already = (creator.accessibleWorkspaces || []).some(
          (ws: any) => (ws.workspaceDomain || "").toLowerCase() === baseSlug.toLowerCase()
        );
        if (!already) {
          creator.accessibleWorkspaces = creator.accessibleWorkspaces || [];
          creator.accessibleWorkspaces.push({
            workspaceDomain: baseSlug,
            workspaceName: name.trim(),
            role: "user",
            allowedTimeBuckets: ["all"],
            extraDocumentIds: [],
            blockedDocumentIds: [],
            invitedBy: user._id,
            joinedAt: new Date(),
            isActive: true
          });
          await creator.save();
        }
      }

      return res.status(201).json({ workspace });
    } catch (error) {
      console.error("Create workspace error:", error);
      return res.status(500).json({ message: "Failed to create workspace" });
    }
  },

  // List members of a workspace (by workspaceId within current domain)
  async listMembers(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const domain = req.userDomain || user?.domain;
      const { workspaceId } = req.params as { workspaceId: string };
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin") return res.status(403).json({ message: "Only domain admins can view members" });

      let slug: string;
      if (workspaceId === 'default') {
        slug = String(domain);
      } else {
        const workspace = await Workspace.findOne({ workspaceId, domain });
        if (!workspace) return res.status(404).json({ message: "Workspace not found" });
        slug = workspace.slug;
      }
      const members = await User.find({
        domain,
        accessibleWorkspaces: { $elemMatch: { workspaceDomain: slug, isActive: true } },
      }).select("_id name email status role");

      return res.json({ members });
    } catch (error) {
      console.error("List members error:", error);
      return res.status(500).json({ message: "Failed to list members" });
    }
  },

  // Add a member to workspace (by userId or email)
  async addMember(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const domain = req.userDomain || user?.domain;
      const { workspaceId } = req.params as { workspaceId: string };
      const { userId, email } = req.body as { userId?: string; email?: string };

      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin") return res.status(403).json({ message: "Only domain admins can add members" });

      let slug: string;
      let workspaceName = '';
      if (workspaceId === 'default') {
        slug = String(domain);
        workspaceName = `${domain} Workspace`;
      } else {
        const workspace = await Workspace.findOne({ workspaceId, domain });
        if (!workspace) return res.status(404).json({ message: "Workspace not found" });
        slug = workspace.slug;
        workspaceName = workspace.name;
      }

      const target = await User.findOne(
        userId ? { _id: userId } : { email: email }
      );
      if (!target) return res.status(404).json({ message: "User not found" });
      if ((target as any).domain !== domain) {
        return res.status(400).json({ message: "User does not belong to this domain" });
      }

      (target as any).accessibleWorkspaces = (target as any).accessibleWorkspaces || [];
      const existingIdx = (target as any).accessibleWorkspaces.findIndex(
        (w: any) => (w.workspaceDomain || '').toLowerCase() === slug.toLowerCase()
      );
      if (existingIdx >= 0) {
        (target as any).accessibleWorkspaces[existingIdx].isActive = true;
        (target as any).accessibleWorkspaces[existingIdx].workspaceName = workspaceName;
      } else {
        (target as any).accessibleWorkspaces.push({
          workspaceDomain: slug,
          workspaceName,
          role: "user",
          allowedTimeBuckets: ["all"],
          extraDocumentIds: [],
          blockedDocumentIds: [],
          invitedBy: user._id,
          joinedAt: new Date(),
          isActive: true,
        });
      }
      await (target as any).save();

      return res.json({ message: "User added to workspace" });
    } catch (error) {
      console.error("Add member error:", error);
      return res.status(500).json({ message: "Failed to add member" });
    }
  },

  // Remove a member from workspace (hard-remove entry)
  async removeMember(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const domain = req.userDomain || user?.domain;
      const { workspaceId, memberId } = req.params as { workspaceId: string; memberId: string };
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin") return res.status(403).json({ message: "Only domain admins can remove members" });

      let slug: string;
      if (workspaceId === 'default') {
        slug = String(domain);
      } else {
        const workspace = await Workspace.findOne({ workspaceId, domain });
        if (!workspace) return res.status(404).json({ message: "Workspace not found" });
        slug = workspace.slug;
      }

      const target = await User.findOne({ _id: memberId, domain });
      if (!target) return res.status(404).json({ message: "User not found" });

      (target as any).accessibleWorkspaces = (target as any).accessibleWorkspaces || [];
      (target as any).accessibleWorkspaces = (target as any).accessibleWorkspaces.filter(
        (w: any) => (w.workspaceDomain || '').toLowerCase() !== slug.toLowerCase()
      );

      // If the user was currently in this workspace, switch them back to their default (primary domain)
      if (String((target as any).currentWorkspace || '').toLowerCase() === String(slug).toLowerCase()) {
        (target as any).currentWorkspace = (target as any).domain;
      }

      // Ensure the primary domain is present in accessibleWorkspaces and active
      const primaryDomain = String((target as any).domain || '').toLowerCase();
      const hasPrimary = (target as any).accessibleWorkspaces.some((w: any) => String(w.workspaceDomain || '').toLowerCase() === primaryDomain);
      if (!hasPrimary && primaryDomain) {
        (target as any).accessibleWorkspaces.push({
          workspaceDomain: (target as any).domain,
          workspaceName: `${(target as any).domain} Workspace`,
          role: 'user',
          allowedTimeBuckets: ['all'],
          extraDocumentIds: [],
          blockedDocumentIds: [],
          invitedBy: user._id,
          joinedAt: new Date(),
          isActive: true,
        });
      }
      await (target as any).save();

      return res.json({ message: "User removed from workspace" });
    } catch (error) {
      console.error("Remove member error:", error);
      return res.status(500).json({ message: "Failed to remove member" });
    }
  },

  // List all workspaces for current domain (admin only)
  async list(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const domain = req.userDomain || user?.domain;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Only domain admins can view domain workspaces" });
      }
      const workspaces = await Workspace.find({ domain, status: { $ne: "archived" } }).sort({ createdAt: -1 });
      return res.json({ workspaces });
    } catch (error) {
      console.error("List workspaces error:", error);
      return res.status(500).json({ message: "Failed to list workspaces" });
    }
  },

  // Update workspace (name/settings) - admin of domain
  async update(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const domain = req.userDomain || user?.domain;
      const { workspaceId } = req.params as { workspaceId: string };
      const updates = req.body || {};

      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Only domain admins can update workspaces" });
      }

      const workspace = await Workspace.findOne({ workspaceId, domain });
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });

      if (typeof updates.name === "string" && updates.name.trim().length >= 2) {
        workspace.name = updates.name.trim();
      }
      if (updates.settings && typeof updates.settings === "object") {
        workspace.settings = { ...workspace.settings, ...updates.settings } as any;
      }
      if (typeof updates.status === "string") {
        workspace.status = updates.status;
      }
      await workspace.save();
      return res.json({ workspace });
    } catch (error) {
      console.error("Update workspace error:", error);
      return res.status(500).json({ message: "Failed to update workspace" });
    }
  },

  // Archive a workspace - admin of domain
  async archive(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      const domain = req.userDomain || user?.domain;
      const { workspaceId } = req.params as { workspaceId: string };
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.role !== "admin") {
        return res.status(403).json({ message: "Only domain admins can archive workspaces" });
      }
      const workspace = await Workspace.findOneAndUpdate(
        { workspaceId, domain },
        { status: "archived" },
        { new: true }
      );
      if (!workspace) return res.status(404).json({ message: "Workspace not found" });
      return res.json({ message: "Workspace archived", workspace });
    } catch (error) {
      console.error("Archive workspace error:", error);
      return res.status(500).json({ message: "Failed to archive workspace" });
    }
  }
};


