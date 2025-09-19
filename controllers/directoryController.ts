import { Request, Response } from "express";
import { Directory } from "../models/Directory";
import { Document } from "../models/Document";
import { publishEvent } from "../lib/events";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

export const directoryController = {
  async move(req: AuthRequest, res: Response) {
    try {
      const { newParentId } = req.body || {};
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const dir = await Directory.findOne({
        id: req.params.id,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      });
      if (!dir) {
        return res.status(404).json({ error: "Directory not found" });
      }
      if (newParentId === dir.id) {
        return res.status(400).json({ error: "Cannot move into itself" });
      }
      // Validate new parent if provided
      if (newParentId) {
        const parent = await Directory.findOne({
          id: newParentId,
          domain: req.userDomain,
          workspaceId: currentWorkspace,
        });
        if (!parent) {
          return res.status(400).json({ error: "Invalid destination folder" });
        }
      }
      dir.parentId = newParentId || null;
      await dir.save();
      res.json(dir);
    } catch (err: any) {
      if (err?.code === 11000) {
        return res
          .status(409)
          .json({ error: "A folder with this name already exists here" });
      }
      res.status(500).json({ error: "Failed to move directory" });
    }
  },
  async create(req: AuthRequest, res: Response) {
    try {
      const { name, parentId } = req.body || {};
      if (!name || String(name).trim() === "") {
        return res.status(400).json({ error: "Name is required" });
      }
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const payload: any = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: String(name).trim(),
        parentId: parentId === "root" || !parentId ? null : parentId,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        ownerUserId: req.user?._id?.toString?.(),
      };
      const dir = new Directory(payload);
      await dir.save();
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "directory.created",
        resourceType: "directory",
        resourceId: dir.id,
        title: `Folder created: ${dir.name}`,
        notifyWorkspace: true,
      });
      res.status(201).json(dir);
    } catch (err: any) {
      if (err?.code === 11000) {
        return res
          .status(409)
          .json({ error: "A folder with this name already exists here" });
      }
      res.status(500).json({ error: "Failed to create directory" });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const dir = await Directory.findOne({
        id: req.params.id,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      });
      if (!dir) {
        return res.status(404).json({ error: "Directory not found" });
      }
      res.json(dir);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch directory" });
    }
  },

  async listChildren(req: AuthRequest, res: Response) {
    try {
      const parentId = req.params.id === "root" ? null : req.params.id;
      const { includeDeleted, page, pageSize, sort, order } = (req.query ||
        {}) as {
        includeDeleted?: string;
        page?: string;
        pageSize?: string;
        sort?: string;
        order?: string;
      };
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const filter: any = {
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        parentId,
      };
      const dirs = await Directory.find(filter).sort({ name: 1 });

      // Documents under this directory
      const docFilter: any = {
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      };
      docFilter.directoryId = parentId;

      // Sorting
      const sortKey = sort === "uploadedAt" ? "uploadedAt" : "name";
      const sortDir = (order || "asc").toLowerCase() === "desc" ? -1 : 1;

      const docs = await Document.find(docFilter).sort({ [sortKey]: sortDir });

      // Merge and paginate
      const merged = [
        ...dirs.map((d) => ({ kind: "directory", item: d })),
        ...docs.map((d) => ({ kind: "document", item: d })),
      ];
      const p = Math.max(parseInt(page || "1", 10), 1);
      const ps = Math.min(Math.max(parseInt(pageSize || "50", 10), 1), 200);
      const start = (p - 1) * ps;
      const paged = merged.slice(start, start + ps);

      res.json({
        total: merged.length,
        page: p,
        pageSize: ps,
        items: paged,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to list children" });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const { name, parentId } = req.body || {};
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const dir = await Directory.findOne({
        id: req.params.id,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      });
      if (!dir) {
        return res.status(404).json({ error: "Directory not found" });
      }
      if (typeof name === "string" && name.trim() !== "") {
        dir.name = name.trim();
      }
      if (typeof parentId !== "undefined") {
        dir.parentId = parentId || null;
      }
      await dir.save();
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "directory.updated",
        resourceType: "directory",
        resourceId: dir.id,
        title: `Folder updated: ${dir.name}`,
        notifyWorkspace: true,
      });
      res.json(dir);
    } catch (err: any) {
      if (err?.code === 11000) {
        return res
          .status(409)
          .json({ error: "A folder with this name already exists here" });
      }
      res.status(500).json({ error: "Failed to update directory" });
    }
  },

  // Soft delete removed

  // Restore removed

  async delete(req: AuthRequest, res: Response) {
    try {
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const dir = await Directory.findOne({
        id: req.params.id,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      });
      if (!dir) {
        return res.status(404).json({ error: "Directory not found" });
      }

      // Get all descendant directories recursively
      const queue = [dir.id];
      const visited: Set<string> = new Set();
      const dirsToDelete: string[] = [];

      while (queue.length) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        dirsToDelete.push(current);

        const children = await Directory.find({
          domain: req.userDomain,
          workspaceId: currentWorkspace,
          parentId: current,
        });
        for (const child of children) {
          if (!visited.has(child.id)) queue.push(child.id);
        }
      }

      // Delete all documents in all directories
      await Document.deleteMany({
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        directoryId: { $in: dirsToDelete },
      });

      // Delete all directories
      await Directory.deleteMany({
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        id: { $in: dirsToDelete },
      });

      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "directory.deleted",
        resourceType: "directory",
        resourceId: dir.id,
        title: `Folder permanently deleted: ${dir.name}`,
        notifyWorkspace: true,
      });

      res.json({ message: "Directory and all contents permanently deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete directory" });
    }
  },
};
