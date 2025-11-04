import { Request, Response } from "express";
import { User } from "../models/User";
import { WorkspaceInvitation } from "../models/WorkspaceInvitation";
import { SharePermission } from "../models/SharePermission";
import { Directory } from "../models/Directory";
import { Workspace } from "../models/Workspace";
import { WorkspaceMembership } from "../models/WorkspaceMembership";
import { sendEmail } from "../services/emailService";
import { v4 as uuidv4 } from "uuid";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

export const workspaceInvitationController = {
  // Send workspace invitation
  async sendInvitation(req: AuthRequest, res: Response) {
    try {
      const {
        inviteeEmail,
        inviteeName,
        invitedRole = "user",
        message,
        allowedTimeBuckets,
        grantedDirectories,
      } = req.body as {
        inviteeEmail: string;
        inviteeName?: string;
        invitedRole?: "user" | "viewer" | "editor";
        message?: string;
        allowedTimeBuckets?: string[];
        grantedDirectories?: Array<{
          directoryId: string;
          role: "viewer" | "editor";
        }>;
      };
      const inviterId = req.user._id;
      const workspaceId = req.currentWorkspace; // Use workspaceId from current workspace
      const userDomain = req.userDomain || req.user?.domain;

      // Validate required fields
      if (!inviteeEmail) {
        return res.status(400).json({ message: "Invitee email is required" });
      }

      if (!workspaceId) {
        return res.status(400).json({ message: "Workspace is required. Please select a workspace." });
      }

      // Get workspace to verify it exists and get name
      const workspace = await Workspace.findOne({ workspaceId, domain: userDomain });
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      // Check if inviter is admin (domain admin or workspace admin via membership)
      const isDomainAdmin = req.user.role === "admin";
      const membership = await WorkspaceMembership.findOne({
        userId: req.user._id,
        workspaceId,
        role: "admin",
        status: "active",
      });

      if (!isDomainAdmin && !membership) {
        return res.status(403).json({
          message: "Only workspace admins can send invitations",
        });
      }

      // Check if user is trying to invite themselves
      if (inviteeEmail === req.user.email) {
        return res.status(400).json({
          message: "You cannot invite yourself",
        });
      }

      // Check if user already exists and has access to this workspace via membership
      const existingUser = await User.findOne({ email: inviteeEmail });
      if (existingUser) {
        const existingMembership = await WorkspaceMembership.findOne({
          userId: existingUser._id,
          workspaceId,
          status: "active",
        });
        if (existingMembership) {
          return res.status(400).json({
            message: "User already has access to this workspace",
          });
        }
      }

      // Check for existing pending invitation
      const existingInvitation = await WorkspaceInvitation.findOne({
        inviteeEmail: inviteeEmail.toLowerCase(),
        workspaceId,
        status: "pending",
      });

      if (existingInvitation) {
        return res.status(400).json({
          message: "A pending invitation already exists for this email",
        });
      }

      // Create invitation
      const invitationId = `inv_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const invitation = new WorkspaceInvitation({
        invitationId,
        inviterId,
        inviterEmail: req.user.email,
        inviterName: req.user.name,
        inviteeEmail: inviteeEmail.toLowerCase(),
        inviteeName: inviteeName || inviteeEmail.split("@")[0],
        workspaceId, // Use workspaceId
        workspaceDomain: userDomain, // Store actual domain for backward compatibility
        workspaceName: workspace.name, // Use actual workspace name
        invitedRole: invitedRole, // Use invitedRole as-is (user/viewer/editor)
        message,
        expiresAt,
        // Persist desired time-bucket permissions on invitation (deprecated but kept for compatibility)
        allowedTimeBuckets:
          Array.isArray(allowedTimeBuckets) && allowedTimeBuckets.length
            ? allowedTimeBuckets
            : ["all"],
        // Store directory access granted with this invitation
        grantedDirectories: Array.isArray(grantedDirectories)
          ? grantedDirectories
          : [],
      });

      await invitation.save();

      // Send invitation email
      try {
        await sendInvitationEmail(invitation);
        invitation.emailSent = true;
        invitation.emailSentAt = new Date();
        await invitation.save();
      } catch (emailError) {
        console.error("Failed to send invitation email:", emailError);
        // Don't fail the request if email fails
      }

      res.status(201).json({
        message: "Invitation sent successfully",
        invitation: {
          id: invitation._id,
          invitationId: invitation.invitationId,
          inviteeEmail: invitation.inviteeEmail,
          invitedRole: invitation.invitedRole,
          expiresAt: invitation.expiresAt,
        },
      });
    } catch (error) {
      console.error("Error sending invitation:", error);
      res.status(500).json({ message: "Failed to send invitation" });
    }
  },

  // Get all invitations for a workspace (admin only)
  async getWorkspaceInvitations(req: AuthRequest, res: Response) {
    try {
      const workspaceDomain = req.userDomain;

      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only workspace admins can view invitations",
        });
      }

      const invitations = await WorkspaceInvitation.find({
        workspaceDomain,
        inviterId: req.user._id,
      })
        .sort({ createdAt: -1 })
        .populate("inviterId", "name email");

      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  },

  // Get invitations sent to a specific email
  async getInvitationsByEmail(req: AuthRequest, res: Response) {
    try {
      const { email } = req.params;

      const invitations = await WorkspaceInvitation.find({
        inviteeEmail: email.toLowerCase(),
        status: "pending",
        expiresAt: { $gt: new Date() },
      })
        .populate("inviterId", "name email")
        .sort({ createdAt: -1 });

      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations by email:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  },

  // Accept invitation
  async acceptInvitation(req: AuthRequest, res: Response) {
    try {
      const { invitationId } = req.params;
      const userId = req.user._id;

      // Look up invitation by id (check all statuses first to provide better error messages)
      const invitation = await WorkspaceInvitation.findOne({
        invitationId,
      });

      if (!invitation) {
        return res.status(404).json({
          message: "Invitation not found",
        });
      }

      // Check if invitation is already accepted
      if (invitation.status === "accepted") {
        return res.status(400).json({
          message: "This invitation has already been accepted",
          invitation: {
            invitationId: invitation.invitationId,
            status: invitation.status,
            acceptedAt: invitation.acceptedAt,
          },
        });
      }

      // Check if invitation is pending
      if (invitation.status !== "pending") {
        return res.status(400).json({
          message: `This invitation has been ${invitation.status}`,
        });
      }

      // Ensure the signed-in user matches the invitee
      if (
        !req.user?.email ||
        req.user.email.toLowerCase() !== invitation.inviteeEmail.toLowerCase()
      ) {
        return res.status(403).json({
          message:
            "This invitation was sent to a different email. Please sign in with the invited email to accept.",
          invitedEmail: invitation.inviteeEmail,
        });
      }

      if (new Date() > invitation.expiresAt) {
        invitation.status = "expired";
        await invitation.save();
        return res.status(400).json({
          message: "Invitation has expired",
        });
      }

      // Add workspace access via WorkspaceMembership
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user already has membership
      const existingMembership = await WorkspaceMembership.findOne({
        userId: user._id,
        workspaceId: invitation.workspaceId,
        status: "active",
      });

      if (existingMembership) {
        // If membership exists but invitation is still pending, update invitation status
        if (invitation.status === "pending") {
          invitation.status = "accepted";
          invitation.acceptedAt = new Date();
          await invitation.save();
        }
        return res.status(400).json({
          message: "You already have access to this workspace",
          alreadyAccepted: true,
        });
      }

      // Create workspace membership
      // Map invitation role to membership role (invitedRole is user/viewer/editor, membership uses member/viewer/admin)
      let membershipRole: "admin" | "member" | "viewer" = "member";
      if (invitation.invitedRole === "viewer") {
        membershipRole = "viewer";
      } else if (invitation.invitedRole === "editor") {
        membershipRole = "member"; // Editor maps to member in membership
      }
      
      const membership = new WorkspaceMembership({
        userId: user._id,
        workspaceId: invitation.workspaceId,
        role: membershipRole,
        invitedBy: invitation.inviterId,
        joinedAt: new Date(),
        status: "active",
      });
      await membership.save();

      // Set as current workspace if user doesn't have one
      if (!user.currentWorkspace) {
        user.currentWorkspace = invitation.workspaceId;
        await user.save();
      }

      // Auto-grant directory access if directories were specified in invitation
      if (
        invitation.grantedDirectories &&
        Array.isArray(invitation.grantedDirectories) &&
        invitation.grantedDirectories.length > 0
      ) {
        // Get the inviter's actual domain (not workspace slug)
        const inviter = await User.findById(invitation.inviterId);
        if (!inviter) {
          console.error("Inviter not found for invitation:", invitation.invitationId);
          // Continue without directory access if inviter not found
        } else {
          const actualDomain = inviter.domain; // Use inviter's actual domain (e.g., "excollo.com")
          const userIdString = userId.toString();

          for (const dirAccess of invitation.grantedDirectories) {
            // Check if directory exists - directories use actual domain, not workspace slug
            const directory = await Directory.findOne({
              id: dirAccess.directoryId,
              domain: actualDomain,
            });

            if (directory) {
              // Check if share already exists to avoid duplicates
              const existingShare = await SharePermission.findOne({
                domain: actualDomain,
                resourceType: "directory",
                resourceId: dirAccess.directoryId,
                scope: "user",
                principalId: userIdString,
              });

              if (!existingShare) {
                // Generate share ID
                const shareId = `shr_${Date.now()}_${Math.random()
                  .toString(36)
                  .substr(2, 9)}`;

                // Create user-scoped share permission
                // Use actual domain, not workspace slug
                const share = new SharePermission({
                  id: shareId,
                  resourceType: "directory",
                  resourceId: dirAccess.directoryId,
                  domain: actualDomain, // Use actual domain (e.g., "excollo.com"), not workspace slug
                  scope: "user",
                  principalId: userIdString,
                  role: dirAccess.role,
                  invitedEmail: invitation.inviteeEmail,
                  createdBy: invitation.inviterId.toString(),
                });

                await share.save();
              }
            }
          }
        }
      }

      // Update invitation status to accepted
      invitation.status = "accepted";
      invitation.acceptedAt = new Date();
      
      // Save invitation with error handling
      try {
        await invitation.save();
        console.log(`Invitation ${invitationId} status updated to accepted`);
      } catch (saveError: any) {
        console.error("Error saving invitation status:", saveError);
        // Continue even if save fails, but log it
      }

      // Verify the status was saved
      const savedInvitation = await WorkspaceInvitation.findOne({
        invitationId,
      });
      
      if (savedInvitation?.status !== "accepted") {
        console.error(`Warning: Invitation ${invitationId} status may not have been saved correctly. Expected: accepted, Got: ${savedInvitation?.status}`);
        // Try to update again
        await WorkspaceInvitation.updateOne(
          { invitationId },
          { status: "accepted", acceptedAt: new Date() }
        );
      }

      res.json({
        message: "Invitation accepted successfully",
        workspace: {
          workspaceId: invitation.workspaceId,
          name: invitation.workspaceName,
          role: membership.role,
        },
        invitation: {
          invitationId: invitation.invitationId,
          status: "accepted",
        },
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  },

  // Decline invitation
  async declineInvitation(req: AuthRequest, res: Response) {
    try {
      const { invitationId } = req.params;

      const invitation = await WorkspaceInvitation.findOne({
        invitationId,
        inviteeEmail: req.user.email.toLowerCase(),
        status: "pending",
      });

      if (!invitation) {
        return res.status(404).json({
          message: "Invitation not found or already processed",
        });
      }

      invitation.status = "declined";
      invitation.declinedAt = new Date();
      await invitation.save();

      res.json({ message: "Invitation declined successfully" });
    } catch (error) {
      console.error("Error declining invitation:", error);
      res.status(500).json({ message: "Failed to decline invitation" });
    }
  },

  // Cancel invitation (admin only)
  async cancelInvitation(req: AuthRequest, res: Response) {
    try {
      const { invitationId } = req.params;
      const workspaceDomain = req.userDomain;

      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only workspace admins can cancel invitations",
        });
      }

      const invitation = await WorkspaceInvitation.findOne({
        invitationId,
        workspaceDomain,
        inviterId: req.user._id,
        status: "pending",
      });

      if (!invitation) {
        return res.status(404).json({
          message: "Invitation not found",
        });
      }

      invitation.status = "cancelled";
      await invitation.save();

      res.json({ message: "Invitation cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling invitation:", error);
      res.status(500).json({ message: "Failed to cancel invitation" });
    }
  },

  // Delete invitation record (admin only)
  async deleteInvitation(req: AuthRequest, res: Response) {
    try {
      const { invitationId } = req.params;
      const workspaceDomain = req.userDomain;

      if (req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only workspace admins can delete invitations",
        });
      }

      const invitation = await WorkspaceInvitation.findOne({
        invitationId,
        workspaceDomain,
        inviterId: req.user._id,
      });

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      await WorkspaceInvitation.deleteOne({ _id: invitation._id });
      res.json({ message: "Invitation deleted" });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ message: "Failed to delete invitation" });
    }
  },

  // Get user's accessible workspaces
  async getUserWorkspaces(req: AuthRequest, res: Response) {
    try {
      const user = await User.findById(req.user._id).select("currentWorkspace");

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get workspaces via membership
      const memberships = await WorkspaceMembership.find({
        userId: user._id,
        status: "active",
      });

      const workspaceIds = memberships.map((m) => m.workspaceId);
      const workspaces = await Workspace.find({
        workspaceId: { $in: workspaceIds },
        status: "active",
      });

      // Also get legacy accessibleWorkspaces for backward compatibility
      const legacyWorkspaces = (user.accessibleWorkspaces || []).filter((ws: any) => ws.isActive !== false);
      
      // Get workspaces from legacy system that aren't in membership yet
      const legacyWorkspaceSlugs = legacyWorkspaces.map((ws: any) => ws.workspaceDomain);
      const legacyWorkspacesFromDB = await Workspace.find({
        domain: user.domain,
        slug: { $in: legacyWorkspaceSlugs },
        status: "active",
      });

      // Combine membership-based and legacy workspaces, deduplicate
      const allWorkspacesMap = new Map<string, any>();
      
      // Add membership-based workspaces
      workspaces.forEach((ws) => {
        const membership = memberships.find((m) => m.workspaceId === ws.workspaceId);
        allWorkspacesMap.set(ws.workspaceId, {
          workspaceDomain: ws.workspaceId,
          workspaceName: ws.name,
          role: membership?.role || "member",
          isActive: true,
        });
      });
      
      // Add legacy workspaces not yet in membership
      legacyWorkspaces.forEach((legacyWs: any) => {
        const legacyWsFromDB = legacyWorkspacesFromDB.find(
          (ws) => ws.slug.toLowerCase() === (legacyWs.workspaceDomain || "").toLowerCase()
        );
        
        // If found in DB, use workspaceId; otherwise use legacy slug (for backward compatibility)
        const wsId = legacyWsFromDB?.workspaceId || legacyWs.workspaceDomain;
        
        if (!allWorkspacesMap.has(wsId)) {
          allWorkspacesMap.set(wsId, {
            workspaceDomain: wsId,
            workspaceName: legacyWs.workspaceName || legacyWs.workspaceDomain,
            role: legacyWs.role || "member",
            isActive: true,
          });
        }
      });

      const workspacesWithRole = Array.from(allWorkspacesMap.values());

      res.json({
        workspaces: workspacesWithRole,
        currentWorkspace: user.currentWorkspace,
      });
    } catch (error) {
      console.error("Error fetching user workspaces:", error);
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  },

  // Switch workspace
  async switchWorkspace(req: AuthRequest, res: Response) {
    try {
      const { workspaceDomain } = req.body; // This is actually workspaceId now
      const userId = req.user._id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user has membership in this workspace
      const membership = await WorkspaceMembership.findOne({
        userId: user._id,
        workspaceId: workspaceDomain, // workspaceDomain is actually workspaceId
        status: "active",
      });

      if (!membership) {
        return res.status(403).json({
          message: "You don't have access to this workspace",
        });
      }

      // Verify workspace exists
      const workspace = await Workspace.findOne({
        workspaceId: workspaceDomain,
        status: "active",
      });

      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }

      user.currentWorkspace = workspaceDomain;
      await user.save();

      res.json({
        message: "Workspace switched successfully",
        currentWorkspace: workspaceDomain,
      });
    } catch (error) {
      console.error("Error switching workspace:", error);
      res.status(500).json({ message: "Failed to switch workspace" });
    }
  },

  // Update friendly workspace name for the current user
  async updateWorkspaceName(req: AuthRequest, res: Response) {
    try {
      const { workspaceDomain, workspaceName } = req.body as {
        workspaceDomain: string;
        workspaceName: string;
      };

      if (!workspaceDomain || !workspaceName) {
        return res
          .status(400)
          .json({ message: "workspaceDomain and workspaceName are required" });
      }

      const trimmed = (workspaceName || "").trim();
      if (trimmed.length < 2 || trimmed.length > 64) {
        return res
          .status(400)
          .json({ message: "Workspace name must be 2-64 characters" });
      }

      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const idx = (user.accessibleWorkspaces || []).findIndex(
        (ws: any) =>
          (ws.workspaceDomain || "").toLowerCase() ===
          (workspaceDomain || "").toLowerCase()
      );
      if (idx === -1) {
        return res
          .status(404)
          .json({ message: "Workspace not found for this user" });
      }

      (user.accessibleWorkspaces[idx] as any).workspaceName = trimmed;
      await user.save();

      res.json({ message: "Workspace name updated", workspaceName: trimmed });
    } catch (error) {
      console.error("Error updating workspace name:", error);
      res.status(500).json({ message: "Failed to update workspace name" });
    }
  },

  // Admin: update a user's allowed time buckets for this workspace
  async updateUserTimeBuckets(req: AuthRequest, res: Response) {
    try {
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Only admins can update permissions" });
      }

      const { userEmail, allowedTimeBuckets } = req.body as {
        userEmail: string;
        allowedTimeBuckets: (
          | "today"
          | "last7"
          | "last15"
          | "last30"
          | "last90"
          | "all"
        )[];
      };

      if (
        !userEmail ||
        !Array.isArray(allowedTimeBuckets) ||
        allowedTimeBuckets.length === 0
      ) {
        return res
          .status(400)
          .json({ message: "userEmail and allowedTimeBuckets are required" });
      }

      const user = await User.findOne({ email: userEmail.toLowerCase() });
      if (!user) return res.status(404).json({ message: "User not found" });

      const idx = (user.accessibleWorkspaces || []).findIndex(
        (ws: any) =>
          (ws.workspaceDomain || "").toLowerCase() ===
          (req.userDomain || "").toLowerCase()
      );
      if (idx === -1) {
        return res
          .status(404)
          .json({ message: "User does not have access to this workspace" });
      }

      (user.accessibleWorkspaces[idx] as any).allowedTimeBuckets =
        allowedTimeBuckets;
      await user.save();

      return res.json({ message: "Permissions updated", allowedTimeBuckets });
    } catch (error) {
      console.error("Error updating user time buckets:", error);
      return res.status(500).json({ message: "Failed to update permissions" });
    }
  },

  // Admin: revoke a user's access to this workspace
  async revokeUserAccess(req: AuthRequest, res: Response) {
    try {
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Only admins can revoke access" });
      }

      const { userEmail } = req.body as { userEmail: string };
      if (!userEmail) {
        return res.status(400).json({ message: "userEmail is required" });
      }

      const user = await User.findOne({ email: userEmail.toLowerCase() });
      if (!user) return res.status(404).json({ message: "User not found" });

      const before = (user.accessibleWorkspaces || []).length;
      user.accessibleWorkspaces = (user.accessibleWorkspaces || []).filter(
        (ws: any) =>
          (ws.workspaceDomain || "").toLowerCase() !==
          (req.userDomain || "").toLowerCase()
      );

      // If currentWorkspace was this domain, switch to primary domain if still present
      if (
        (user.currentWorkspace || "").toLowerCase() ===
        (req.userDomain || "").toLowerCase()
      ) {
        const primary = (user.domain || "").toLowerCase();
        const hasPrimary = (user.accessibleWorkspaces || []).some(
          (w: any) => (w.workspaceDomain || "").toLowerCase() === primary
        );
        user.currentWorkspace = hasPrimary
          ? user.domain
          : user.accessibleWorkspaces?.[0]?.workspaceDomain || "";
      }

      if ((user.accessibleWorkspaces || []).length === before) {
        return res
          .status(404)
          .json({ message: "User did not have access to this workspace" });
      }

      await user.save();
      return res.json({ message: "Access revoked" });
    } catch (error) {
      console.error("Error revoking user access:", error);
      return res.status(500).json({ message: "Failed to revoke access" });
    }
  },

  // Admin: grant directory access to a user
  async grantDirectoryAccess(req: AuthRequest, res: Response) {
    try {
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Only admins can grant directory access" });
      }

      const { userEmail, directoryIds, role } = req.body as {
        userEmail: string;
        directoryIds: string[];
        role: "viewer" | "editor";
      };

      if (!userEmail || !Array.isArray(directoryIds) || directoryIds.length === 0 || !role) {
        return res.status(400).json({
          message: "userEmail, directoryIds array, and role are required",
        });
      }

      const user = await User.findOne({ email: userEmail.toLowerCase() });
      if (!user) return res.status(404).json({ message: "User not found" });

      // Verify user is in the workspace
      const workspaceDomain = req.userDomain;
      const hasWorkspaceAccess = user.accessibleWorkspaces.some(
        (ws: any) =>
          (ws.workspaceDomain || "").toLowerCase() ===
            (workspaceDomain || "").toLowerCase() && ws.isActive
      );

      if (!hasWorkspaceAccess) {
        return res
          .status(400)
          .json({ message: "User does not have access to this workspace" });
      }

      // Use actual user domain (not workspace slug)
      // workspaceDomain might be slug, but SharePermission uses actual domain
      const domain = req.user?.domain || workspaceDomain;
      const userIdString = user._id.toString();
      const granted: string[] = [];
      const errors: string[] = [];

      for (const directoryId of directoryIds) {
        try {
          // Verify directory exists
          const directory = await Directory.findOne({
            id: directoryId,
            domain,
          });

          if (!directory) {
            errors.push(`Directory ${directoryId} not found`);
            continue;
          }

          // Check if share already exists
          const existingShare = await SharePermission.findOne({
            domain,
            resourceType: "directory",
            resourceId: directoryId,
            scope: "user",
            principalId: userIdString,
          });

          if (existingShare) {
            // Update existing share role
            existingShare.role = role;
            await existingShare.save();
            granted.push(directoryId);
          } else {
            // Create new share
            const shareId = `shr_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`;

            const share = new SharePermission({
              id: shareId,
              resourceType: "directory",
              resourceId: directoryId,
              domain,
              scope: "user",
              principalId: userIdString,
              role,
              invitedEmail: userEmail.toLowerCase(),
              createdBy: req.user._id.toString(),
            });

            await share.save();
            granted.push(directoryId);
          }
        } catch (error: any) {
          errors.push(`Failed to grant access to ${directoryId}: ${error.message}`);
        }
      }

      return res.json({
        message: "Directory access granted",
        granted,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      console.error("Error granting directory access:", error);
      return res
        .status(500)
        .json({ message: "Failed to grant directory access" });
    }
  },

  // Admin: revoke directory access from a user
  async revokeDirectoryAccess(req: AuthRequest, res: Response) {
    try {
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Only admins can revoke directory access" });
      }

      const { userEmail, directoryId } = req.body as {
        userEmail: string;
        directoryId: string;
      };

      if (!userEmail || !directoryId) {
        return res
          .status(400)
          .json({ message: "userEmail and directoryId are required" });
      }

      const user = await User.findOne({ email: userEmail.toLowerCase() });
      if (!user) return res.status(404).json({ message: "User not found" });

      // Use actual user domain (not workspace slug)
      // req.userDomain might be workspace slug, but SharePermission uses actual domain
      const domain = req.user?.domain || req.userDomain;
      const userIdString = user._id.toString();

      const share = await SharePermission.findOne({
        domain,
        resourceType: "directory",
        resourceId: directoryId,
        scope: "user",
        principalId: userIdString,
      });

      if (!share) {
        return res.status(404).json({
          message: "Directory access not found",
        });
      }

      await SharePermission.deleteOne({ _id: share._id });

      return res.json({ message: "Directory access revoked" });
    } catch (error) {
      console.error("Error revoking directory access:", error);
      return res
        .status(500)
        .json({ message: "Failed to revoke directory access" });
    }
  },

  // Admin: get all directories a user has access to
  async getUserDirectories(req: AuthRequest, res: Response) {
    try {
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Only admins can view user directory access" });
      }

      const { userEmail } = req.params as { userEmail: string };
      if (!userEmail) {
        return res.status(400).json({ message: "userEmail is required" });
      }

      const user = await User.findOne({ email: userEmail.toLowerCase() });
      if (!user) return res.status(404).json({ message: "User not found" });

      // Use actual user domain (not workspace slug)
      // req.userDomain might be workspace slug, but SharePermission uses actual domain
      const domain = req.user?.domain || req.userDomain;
      const userIdString = user._id.toString();

      // Get all user-scoped shares for this user in this workspace
      const shares = await SharePermission.find({
        domain,
        resourceType: "directory",
        scope: "user",
        principalId: userIdString,
      });

      // Get directory details for each share
      const directoriesWithAccess = await Promise.all(
        shares.map(async (share) => {
          const directory = await Directory.findOne({
            id: share.resourceId,
            domain,
          });
          return {
            directoryId: share.resourceId,
            directoryName: directory?.name || "Unknown",
            role: share.role,
            shareId: share.id,
            createdAt: share.createdAt,
          };
        })
      );

      return res.json({ directories: directoriesWithAccess });
    } catch (error) {
      console.error("Error fetching user directories:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch user directories" });
    }
  },
};

// Helper function to send invitation email
async function sendInvitationEmail(invitation: any) {
  const invitationUrl = `${process.env.FRONTEND_URL}/invitation/${invitation.invitationId}`;

  const emailData = {
    to: invitation.inviteeEmail,
    subject: `Invitation to join ${invitation.workspaceName}`,
    template: "workspace-invitation",
    data: {
      inviterName: invitation.inviterName,
      workspaceName: invitation.workspaceName,
      workspaceDomain: invitation.workspaceDomain,
      invitedRole: invitation.invitedRole,
      message: invitation.message,
      invitationUrl,
      expiresAt: invitation.expiresAt.toLocaleDateString(),
    },
  };

  await sendEmail(emailData);
}
