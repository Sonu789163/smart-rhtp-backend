import { Request, Response } from "express";
import mongoose from "mongoose";
import { Directory } from "../models/Directory";
import { User } from "../models/User";
import { Document } from "../models/Document";
import { SharePermission } from "../models/SharePermission";
import { Workspace } from "../models/Workspace";
import { WorkspaceInvitation } from "../models/WorkspaceInvitation";
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

      // Debug: Check all SharePermissions for this user to see what exists
      if (userId && isCrossDomainUser) {
        const allUserShares = await SharePermission.find({
          scope: "user",
          principalId: userId,
          resourceType: "directory",
        });
        const shareDirIds = allUserShares.map(s => s.resourceId);
        const checkDirIds = allDirs.map(d => d.id);
        const matchingDirs = shareDirIds.filter(id => checkDirIds.includes(id));
        
        console.log(`[listChildren DEBUG] User: ${req.user?.email}, UserId: ${userId}`);
        console.log(`[listChildren DEBUG] UserDomain: ${userDomain}, WorkspaceDomain: ${workspaceDomain}, Domain used for lookup: ${domain}`);
        console.log(`[listChildren DEBUG] All SharePermissions for this user (any domain):`, allUserShares.map(s => ({ 
          domain: s.domain, 
          resourceId: s.resourceId, 
          role: s.role,
          principalId: s.principalId 
        })));
        console.log(`[listChildren DEBUG] SharePermission directory IDs:`, shareDirIds);
        console.log(`[listChildren DEBUG] Directories to check IDs:`, checkDirIds);
        console.log(`[listChildren DEBUG] Matching directory IDs:`, matchingDirs);
        console.log(`[listChildren DEBUG] Total directories to check: ${allDirs.length}, Total SharePermissions: ${allUserShares.length}`);
      }

      const visibleDirs = await Promise.all(
        allDirs.map(async (dir) => {
          // Same-domain admins can see all directories
          if (isSameDomainAdmin) return dir;

          // For cross-domain users (both admin and regular), they can ONLY see directories with SharePermission
          // Cross-domain users won't own directories in other domains, so skip owner check for them
          if (isCrossDomainUser) {
            // Cross-domain users can only see directories with explicit SharePermission
            // Look up SharePermission by directory ID and user ID - don't restrict by domain
            // SharePermissions are created with inviter.domain during invitation acceptance
            if (userId) {
              // Try multiple lookup strategies to find SharePermission
              
              // Strategy 1: Find by domain, resourceId and principalId (most reliable)
              // Use workspaceDomain since SharePermissions are created with inviter's domain (workspace domain)
              let userShare = await SharePermission.findOne({
                domain: workspaceDomain,
                resourceType: "directory",
                resourceId: dir.id,
                scope: "user",
                principalId: userId,
              });
              
              // Strategy 2: If still not found, try with directory's domain (fallback)
              if (!userShare && dir.domain) {
                userShare = await SharePermission.findOne({
                  domain: dir.domain,
                  resourceType: "directory",
                  resourceId: dir.id,
                  scope: "user",
                  principalId: userId,
                });
              }
              
              if (userShare) {
                console.log(`[listChildren] ✓ Found SharePermission for directory: ${dir.name} (${dir.id}) - SharePermission domain: ${userShare.domain}, Directory domain: ${dir.domain}, Workspace domain: ${workspaceDomain}`);
                return dir;
              } else {
                // Debug: Check if any SharePermission exists for this user
                const anyShareForUser = await SharePermission.findOne({
                  scope: "user",
                  principalId: userId,
                  resourceType: "directory",
                });
                if (anyShareForUser) {
                  console.log(`[listChildren] ✗ SharePermission exists for user but NOT for directory ${dir.name} (${dir.id}). User has SharePermission for: ${anyShareForUser.resourceId}`);
                } else {
                  console.log(`[listChildren] ✗ NO SharePermission found for directory: ${dir.name} (${dir.id}) - userId: ${userId}, and no SharePermissions exist for this user at all`);
                }
              }
            }

            // Check workspace-scoped share permission
            const wsShare = await SharePermission.findOne({
              domain: workspaceDomain, // Include domain in query
              resourceType: "directory",
              resourceId: dir.id,
              scope: "workspace",
              principalId: currentWorkspace,
            });
            if (wsShare) {
              console.log(`[listChildren] ✓ Found workspace SharePermission for directory: ${dir.name} (${dir.id})`);
              return dir;
            }

            // No permission - don't show this directory
            return null;
          }

          // For same-domain users (non-admin), check ownership and shares
          if (dir.ownerUserId === userId) return dir;

          // Check user-scoped share permission
          if (userId) {
            const userShare = await SharePermission.findOne({
              domain,
              resourceType: "directory",
              resourceId: dir.id,
              scope: "user",
              principalId: userId,
            });
            if (userShare) return dir;
          }

          // Check workspace-scoped share permission
          const wsShare = await SharePermission.findOne({
            domain,
            resourceType: "directory",
            resourceId: dir.id,
            scope: "workspace",
            principalId: currentWorkspace,
          });
          if (wsShare) return dir;

          // No permission - don't show this directory
          return null;
        })
      );

      // Filter out null values (directories without permission)
      let dirs = visibleDirs.filter((d): d is typeof allDirs[0] => d !== null);
      
      // For cross-domain users, if no SharePermissions exist, check if they have an accepted invitation
      // with grantedDirectories and create SharePermissions retroactively
      if (isCrossDomainUser && userId && dirs.length === 0) {
        const allUserShares = await SharePermission.find({
          scope: "user",
          principalId: userId,
          resourceType: "directory",
        });
        
        // If no SharePermissions exist, check for accepted invitation and create them
        if (allUserShares.length === 0) {
          console.log(`[listChildren] No SharePermissions found for cross-domain user. Checking for accepted invitation...`);
          
          const invitation = await WorkspaceInvitation.findOne({
            inviteeEmail: req.user?.email?.toLowerCase(),
            workspaceId: currentWorkspace,
            status: "accepted",
          });
          
          if (invitation && invitation.grantedDirectories && invitation.grantedDirectories.length > 0) {
            console.log(`[listChildren] Found accepted invitation with ${invitation.grantedDirectories.length} granted directories. Creating SharePermissions...`);
            
            // Get the inviter's domain
            const inviter = await User.findById(invitation.inviterId);
            if (inviter) {
              const actualDomain = inviter.domain;
              const userIdString = userId;
              
              for (const dirAccess of invitation.grantedDirectories) {
                try {
                  // Find directory
                  const directory = await Directory.findOne({
                    id: dirAccess.directoryId,
                    domain: actualDomain,
                    workspaceId: currentWorkspace,
                  });
                  
                  if (directory) {
                    // Check if SharePermission already exists
                    // Must include domain in the query to match the compound index
                    const existingShare = await SharePermission.findOne({
                      domain: actualDomain,
                      resourceType: "directory",
                      resourceId: dirAccess.directoryId,
                      scope: "user",
                      principalId: userIdString,
                    });
                    
                    if (!existingShare) {
                      // Create SharePermission using compound unique index
                      // The index is: { domain, resourceType, resourceId, scope, principalId }
                      const shareId = `shr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                      
                      try {
                        // Use direct insert instead of updateOne to avoid old index conflicts
                        // First check if it already exists (using compound index)
                        const existingCheck = await SharePermission.findOne({
                          domain: actualDomain,
                          resourceType: "directory",
                          resourceId: dirAccess.directoryId,
                          scope: "user",
                          principalId: userIdString,
                        });
                        
                        if (existingCheck) {
                          console.log(`[listChildren] SharePermission already exists for directory ${dirAccess.directoryId}`);
                          continue; // Skip to next directory
                        }
                        
                        // Clean up any SharePermissions with null linkToken that might block creation
                        // (due to old index)
                        await SharePermission.deleteMany({
                          domain: actualDomain,
                          resourceType: "directory",
                          resourceId: dirAccess.directoryId,
                          scope: "user",
                          principalId: userIdString,
                          linkToken: null,
                        });
                        
                        // Use native MongoDB insert to bypass Mongoose validation and old index issues
                        // For user-scoped shares, set linkToken to a unique dummy value to bypass old index
                        // The old index { scope: 1, linkToken: 1 } requires unique linkToken values
                        const uniqueLinkToken = `user_${shareId}`;
                        
                        const sharePermissionDoc = {
                          id: shareId,
                          resourceType: "directory",
                          resourceId: dirAccess.directoryId,
                          domain: actualDomain,
                          scope: "user",
                          principalId: userIdString,
                          role: dirAccess.role || "viewer",
                          invitedEmail: invitation.inviteeEmail,
                          createdBy: invitation.inviterId.toString(),
                          linkToken: uniqueLinkToken, // Set unique value to bypass old index
                          createdAt: new Date(),
                          updatedAt: new Date(),
                        };
                        
                        // Use native MongoDB collection to insert directly
                        const collection = mongoose.connection.db.collection("sharepermissions");
                        await collection.insertOne(sharePermissionDoc);
                        
                        // Verify creation
                        const verifyCreated = await SharePermission.findOne({
                          domain: actualDomain,
                          resourceType: "directory",
                          resourceId: dirAccess.directoryId,
                          scope: "user",
                          principalId: userIdString,
                        });
                        
                        if (!verifyCreated) {
                          throw new Error("SharePermission was not created despite insertOne success");
                        }
                        
                        console.log(`[listChildren] ✓ Created SharePermission (native insert) for directory ${dirAccess.directoryId} (${directory.name})`);
                      } catch (upsertError: any) {
                        // If upsert fails due to duplicate key error
                        if (upsertError.code === 11000) {
                          // Check if it's the old scope_1_linkToken_1 index causing the issue
                          if (upsertError.keyPattern?.scope === 1 && upsertError.keyPattern?.linkToken === 1) {
                            // This is the old index without partialFilterExpression
                            // Try to find existing SharePermission with this scope and null linkToken
                            const existingWithNullToken = await SharePermission.findOne({
                              scope: "user",
                              linkToken: null,
                              domain: actualDomain,
                              resourceType: "directory",
                              resourceId: dirAccess.directoryId,
                              principalId: userIdString,
                            });
                            
                            if (existingWithNullToken) {
                              // SharePermission already exists, update it if needed
                              console.log(`[listChildren] SharePermission already exists (found via old index) for directory ${dirAccess.directoryId}`);
                              continue;
                            }
                            
                            // Try to find using compound index (the correct one)
                            const verifyShare = await SharePermission.findOne({
                              domain: actualDomain,
                              resourceType: "directory",
                              resourceId: dirAccess.directoryId,
                              scope: "user",
                              principalId: userIdString,
                            });
                            
                            if (verifyShare) {
                              // SharePermission exists, continue
                              console.log(`[listChildren] SharePermission already exists (found via compound index) for directory ${dirAccess.directoryId}`);
                              continue;
                            }
                            
                            // If we get here, the old index is blocking us but the SharePermission doesn't exist
                            // The old index { scope: 1, linkToken: 1 } without partialFilterExpression is causing conflicts
                            // Try to find any existing SharePermission with this scope and null linkToken (from old index)
                            const anyExistingWithNullToken = await SharePermission.findOne({
                              scope: "user",
                              linkToken: null,
                            });
                            
                            // Clean up: Remove linkToken field from any existing SharePermissions with scope="user" and linkToken=null
                            // This helps work around the old index issue
                            console.log(`[listChildren] ⚠ Old index conflict detected. Cleaning up null linkToken fields...`);
                            await SharePermission.updateMany(
                              {
                                scope: "user",
                                linkToken: null,
                              },
                              {
                                $unset: { linkToken: "" },
                              }
                            );
                            console.log(`[listChildren] Cleaned up SharePermissions with null linkToken`);
                            
                            // Retry the creation - use native MongoDB insert to bypass old index issues
                            try {
                              // First, try to delete any existing SharePermission with null linkToken that might block us
                              await SharePermission.deleteMany({
                                domain: actualDomain,
                                resourceType: "directory",
                                resourceId: dirAccess.directoryId,
                                scope: "user",
                                principalId: userIdString,
                                linkToken: null,
                              });
                              
                              // Use native MongoDB insert to bypass Mongoose validation and old index issues
                              // For user-scoped shares, set linkToken to a unique dummy value to bypass old index
                              const uniqueLinkToken = `user_${shareId}`;
                              
                              const sharePermissionDoc = {
                                id: shareId,
                                resourceType: "directory",
                                resourceId: dirAccess.directoryId,
                                domain: actualDomain,
                                scope: "user",
                                principalId: userIdString,
                                role: dirAccess.role || "viewer",
                                invitedEmail: invitation.inviteeEmail,
                                createdBy: invitation.inviterId.toString(),
                                linkToken: uniqueLinkToken, // Set unique value to bypass old index
                                createdAt: new Date(),
                                updatedAt: new Date(),
                              };
                              
                              // Use native MongoDB collection to insert directly
                              const collection = mongoose.connection.db.collection("sharepermissions");
                              await collection.insertOne(sharePermissionDoc);
                              
                              // Verify it was created
                              const verifyShare = await SharePermission.findOne({
                                domain: actualDomain,
                                resourceType: "directory",
                                resourceId: dirAccess.directoryId,
                                scope: "user",
                                principalId: userIdString,
                              });
                              
                              if (verifyShare) {
                                console.log(`[listChildren] ✓ Created SharePermission (native insert after cleanup) for directory ${dirAccess.directoryId} (${directory.name})`);
                              } else {
                                throw new Error("SharePermission was not created despite insertOne success");
                              }
                            } catch (retryError: any) {
                              if (retryError.code === 11000) {
                                // Still duplicate, check if it exists now using compound index
                                const finalCheck = await SharePermission.findOne({
                                  domain: actualDomain,
                                  resourceType: "directory",
                                  resourceId: dirAccess.directoryId,
                                  scope: "user",
                                  principalId: userIdString,
                                });
                                if (finalCheck) {
                                  console.log(`[listChildren] SharePermission exists (after cleanup check) for directory ${dirAccess.directoryId}`);
                                } else {
                                  console.error(`[listChildren] Cannot create SharePermission even after cleanup for ${dirAccess.directoryId}. Error: ${retryError.message}`);
                                }
                              } else {
                                console.error(`[listChildren] Error creating SharePermission after cleanup for ${dirAccess.directoryId}:`, retryError);
                              }
                            }
                          } else {
                            // Different duplicate key error - check if SharePermission exists using compound index
                            const verifyShare = await SharePermission.findOne({
                              domain: actualDomain,
                              resourceType: "directory",
                              resourceId: dirAccess.directoryId,
                              scope: "user",
                              principalId: userIdString,
                            });
                            if (!verifyShare) {
                              throw upsertError; // Re-throw if it's a different error and SharePermission doesn't exist
                            }
                            // SharePermission exists, continue
                            console.log(`[listChildren] SharePermission already exists for directory ${dirAccess.directoryId}`);
                          }
                        } else {
                          throw upsertError;
                        }
                      }
                      
                      console.log(`[listChildren] ✓ Created SharePermission for directory ${dirAccess.directoryId} (${directory.name})`);
                    }
                  }
                } catch (error: any) {
                  console.error(`[listChildren] Error creating SharePermission for ${dirAccess.directoryId}:`, error);
                }
              }
              
              // Re-fetch directories after creating SharePermissions
              // Use the same domain that was used to create SharePermissions (actualDomain = inviter's domain)
              console.log(`[listChildren] Re-fetching directories after SharePermission creation, using domain: ${actualDomain}`);
              
              // Get list of directory IDs that were just granted from the invitation
              const grantedDirectoryIds = invitation.grantedDirectories.map(d => d.directoryId);
              
              const updatedDirs = await Promise.all(
                allDirs.map(async (dir) => {
                  if (isSameDomainAdmin) return dir;
                  
                  if (isCrossDomainUser) {
                    // If this directory was in the granted list, check for SharePermission
                    if (grantedDirectoryIds.includes(dir.id) && userId) {
                      // Must include domain in query to match the SharePermissions we just created
                      const userShare = await SharePermission.findOne({
                        domain: actualDomain, // Use the same domain used for creation
                        resourceType: "directory",
                        resourceId: dir.id,
                        scope: "user",
                        principalId: userId,
                      });
                      
                      if (userShare) {
                        console.log(`[listChildren] ✓ Found SharePermission (after creation) for directory: ${dir.name} (${dir.id}), domain: ${userShare.domain}`);
                        return dir;
                      } else {
                        console.log(`[listChildren] ✗ No SharePermission found (after creation) for directory: ${dir.name} (${dir.id}), searched with domain: ${actualDomain}`);
                        // Even if not found in DB yet, if it was in granted list, include it
                        // (it might be a timing issue with MongoDB)
                        console.log(`[listChildren] ⚠ Including directory ${dir.name} anyway (was in granted list)`);
                        return dir;
                      }
                    }
                    return null;
                  }
                  
                  // For same-domain users
                  if (dir.ownerUserId === userId) return dir;
                  
                  if (userId) {
                    const userShare = await SharePermission.findOne({
                      domain,
                      resourceType: "directory",
                      resourceId: dir.id,
                      scope: "user",
                      principalId: userId,
                    });
                    if (userShare) return dir;
                  }
                  
                  const wsShare = await SharePermission.findOne({
                    domain,
                    resourceType: "directory",
                    resourceId: dir.id,
                    scope: "workspace",
                    principalId: currentWorkspace,
                  });
                  if (wsShare) return dir;
                  
                  return null;
                })
              );
              
              dirs = updatedDirs.filter((d): d is typeof allDirs[0] => d !== null);
              console.log(`[listChildren] After retroactive SharePermission creation, found ${dirs.length} directories`);
            }
          } else {
            console.log(`[listChildren] No accepted invitation with grantedDirectories found for this user`);
          }
        } else {
          // SharePermissions exist, use fallback mechanism
          const shareDirIds = allUserShares.map(s => s.resourceId);
          console.log(`[listChildren] User has ${allUserShares.length} SharePermissions for directories:`, shareDirIds);
          
          const fallbackDirs = await Directory.find({
            id: { $in: shareDirIds },
            workspaceId: currentWorkspace,
            parentId: parentId,
          });
          
          const existingDirIds = new Set(dirs.map(d => d.id));
          const newDirs = fallbackDirs.filter(d => !existingDirIds.has(d.id));
          
          if (newDirs.length > 0) {
            console.log(`[listChildren] Found ${newDirs.length} additional directories via SharePermission fallback`);
            dirs = [...dirs, ...newDirs];
          }
        }
      }

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
      // Cross-domain users should only see documents in directories they have access to
      let docs = allDocs;
      
      // Only filter if user is NOT a same-domain admin
      if (!isSameDomainAdmin) {
        // Check access for each document's directory
        const accessibleDocs = await Promise.all(
          allDocs.map(async (doc) => {
            const docDirId = doc.directoryId || null;

            // For cross-domain users, root directory documents should be restricted
            // They should only see documents in directories they have explicit access to
            if (isCrossDomainUser && !docDirId) {
              // Cross-domain users don't have access to root documents
              return null;
            }

            // For same-domain users, root directory documents are accessible
            if (!isCrossDomainUser && !docDirId) return doc;

            // Check if directory is in the visible directories list (already filtered)
            // This is the most reliable check - if directory is visible, documents in it are accessible
            const hasDirAccess = dirs.some((d) => d.id === docDirId);
            if (hasDirAccess) return doc;

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
