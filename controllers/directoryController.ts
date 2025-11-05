import { Request, Response } from "express";
import { Directory } from "../models/Directory";
import { User } from "../models/User";
import { Document } from "../models/Document";
import { SharePermission } from "../models/SharePermission";
import { Workspace } from "../models/Workspace";
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
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

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
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }
      
      // Always use user's actual domain (not workspace slug)
      // req.userDomain might be workspace slug, but we need the actual user domain
      const actualDomain = req.user?.domain || req.userDomain;

      // Get user's domainId
      const userWithDomain = await User.findById(req.user?._id).select("domainId");
      if (!userWithDomain?.domainId) {
        return res.status(400).json({ error: "User domainId not found. Please contact administrator." });
      }

      const payload: any = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: String(name).trim(),
        parentId: parentId === "root" || !parentId ? null : parentId,
        domain: actualDomain, // Use actual user domain, not workspace slug - backward compatibility
        domainId: userWithDomain.domainId, // Link to Domain schema
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
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

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
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

      // Get the workspace to determine the correct domain
      // For cross-domain users, we need the workspace's domain, not the user's domain
      const workspace = await Workspace.findOne({ workspaceId: currentWorkspace });
      const workspaceDomain = workspace?.domain || req.userDomain || req.user?.domain;

      // Use workspace domain when querying directories (not user's domain)
      // Directories are stored with workspace's domain
      const actualDomain = workspaceDomain;

      const filter: any = {
        domain: actualDomain, // Use workspace domain, not user domain
        workspaceId: currentWorkspace,
        parentId,
      };
      const allDirs = await Directory.find(filter).sort({ name: 1 });

      // Filter directories by user permissions (only show directories user has access to)
      const userId = req.user?._id?.toString();
      // Use workspace domain for SharePermission lookups (not user domain)
      const domain = workspaceDomain;
      
      // Check if user is a cross-domain user (invited from another domain)
      const userDomain = req.user?.domain;
      const isCrossDomainUser = userDomain && userDomain !== workspaceDomain;
      const isSameDomainAdmin = req.user?.role === "admin" && userDomain === workspaceDomain;

      console.log(`[listChildren] User: ${req.user?.email}, UserDomain: ${userDomain}, WorkspaceDomain: ${workspaceDomain}, IsCrossDomain: ${isCrossDomainUser}, IsSameDomainAdmin: ${isSameDomainAdmin}`);
      console.log(`[listChildren] Total directories found: ${allDirs.length}`);
      
      // Debug: Check all SharePermissions for this user
      if (userId && isCrossDomainUser) {
        const allUserShares = await SharePermission.find({
          domain,
          scope: "user",
          principalId: userId,
          resourceType: "directory",
        });
        console.log(`[listChildren] SharePermissions for user ${userId} in domain ${domain}:`, allUserShares.map(s => ({ dirId: s.resourceId, role: s.role })));
      }

      const visibleDirs = await Promise.all(
        allDirs.map(async (dir) => {
          // Same-domain admins can see all directories
          if (isSameDomainAdmin) {
            console.log(`[listChildren] Same-domain admin - showing directory: ${dir.name} (${dir.id})`);
            return dir;
          }

          // For cross-domain users (both admin and regular), they can only see directories they have explicit access to
          // Cross-domain users won't own directories in other domains, so skip owner check
          
          // Check user-scoped share permission (this is the key for cross-domain users)
          if (userId) {
            const userShare = await SharePermission.findOne({
              domain,
              resourceType: "directory",
              resourceId: dir.id,
              scope: "user",
              principalId: userId,
            });
            if (userShare) {
              console.log(`[listChildren] Found SharePermission for directory: ${dir.name} (${dir.id})`);
              return dir;
            }
          }

          // For same-domain non-admin users, check if they own the directory
          if (!isCrossDomainUser && dir.ownerUserId === userId) {
            console.log(`[listChildren] User owns directory: ${dir.name} (${dir.id})`);
            return dir;
          }

          // Check workspace-scoped share permission
          const wsShare = await SharePermission.findOne({
            domain,
            resourceType: "directory",
            resourceId: dir.id,
            scope: "workspace",
            principalId: currentWorkspace,
          });
          if (wsShare) {
            console.log(`[listChildren] Found workspace SharePermission for directory: ${dir.name} (${dir.id})`);
            return dir;
          }

          // No permission - don't show this directory
          if (isCrossDomainUser) {
            console.log(`[listChildren] Cross-domain user - NO access to directory: ${dir.name} (${dir.id})`);
          }
          return null;
        })
      );

      // Filter out null values (directories without permission)
      const dirs = visibleDirs.filter((d): d is typeof allDirs[0] => d !== null);

      // Documents under this directory
      // Use workspace domain when querying documents (not user domain)
      const actualDomainForDocs = workspaceDomain;
      const docFilter: any = {
        domain: actualDomainForDocs, // Use workspace domain, not user domain
        workspaceId: currentWorkspace,
      };
      docFilter.directoryId = parentId;

      // Sorting
      const sortKey = sort === "uploadedAt" ? "uploadedAt" : "name";
      const sortDir = (order || "asc").toLowerCase() === "desc" ? -1 : 1;

      const allDocs = await Document.find(docFilter).sort({ [sortKey]: sortDir });

      // Filter documents based on directory access permissions
      // Only show documents from directories the user has access to
      // Cross-domain users (both admin and regular) should only see documents in directories they have access to
      let docs = allDocs;
      const shouldFilterDocs = isCrossDomainUser || req.user?.role !== "admin" || (req.user?.role === "admin" && !isSameDomainAdmin);
      console.log(`[listChildren] Should filter documents: ${shouldFilterDocs}, Total docs: ${allDocs.length}, Visible dirs: ${dirs.length}`);
      
      if (shouldFilterDocs) {
        // Check access for each document's directory
        const accessibleDocs = await Promise.all(
          allDocs.map(async (doc) => {
            const docDirId = doc.directoryId || null;

            // For cross-domain users, root directory documents should also be restricted
            // They should only see documents in directories they have explicit access to
            if (isCrossDomainUser && !docDirId) {
              // Cross-domain users don't have access to root documents unless explicitly granted
              console.log(`[listChildren] Cross-domain user - blocking root document: ${doc.name}`);
              return null;
            }

            // For same-domain users, root directory documents are accessible
            if (!isCrossDomainUser && !docDirId) {
              console.log(`[listChildren] Same-domain user - allowing root document: ${doc.name}`);
              return doc;
            }

            // Check if directory is in the visible directories list (already filtered)
            // This is the most reliable check - if directory is visible, documents in it are accessible
            const hasDirAccess = dirs.some((d) => d.id === docDirId);
            if (hasDirAccess) {
              console.log(`[listChildren] Document in accessible directory: ${doc.name} (dir: ${docDirId})`);
              return doc;
            }

            // For same-domain non-admin users, check if they own the directory
            if (!isCrossDomainUser && userId) {
              const directory = await Directory.findOne({
                id: docDirId,
                domain: workspaceDomain,
              });
              if (directory?.ownerUserId === userId) return doc;
            }

            // Use workspace domain when checking SharePermission (not user domain)
            const actualDomain = workspaceDomain;
            
            if (userId) {
              const userShare = await SharePermission.findOne({
                domain: actualDomain,
                resourceType: "directory",
                resourceId: docDirId,
                scope: "user",
                principalId: userId,
              });
              if (userShare) return doc;
            }

            const wsShare = await SharePermission.findOne({
              domain: actualDomain,
              resourceType: "directory",
              resourceId: docDirId,
              scope: "workspace",
              principalId: currentWorkspace,
            });
            if (wsShare) return doc;

            // No access
            return null;
          })
        );

        docs = accessibleDocs.filter((d): d is typeof allDocs[0] => d !== null);
      }

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
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

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
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

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
