import { Request, Response } from "express";
import { Document } from "../models/Document";
import { SharePermission } from "../models/SharePermission";
import { Directory } from "../models/Directory";
import { User } from "../models/User";
import axios from "axios";
import FormData from "form-data";
import { io } from "../index";
import { r2Client, R2_BUCKET } from "../config/r2";
import { publishEvent } from "../lib/events";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Summary } from "../models/Summary";
import { Report } from "../models/Report";
import { Chat } from "../models/Chat";

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

export const documentController = {
  // Helper to normalize namespace consistently (trim, preserve .pdf extension)
  // Keep case as-is; rely on Mongo collation for case-insensitive uniqueness
  normalizeNamespace(raw?: string) {
    if (!raw) return "";
    let s = String(raw).trim();
    // Keep .pdf extension - don't remove it
    // Standardize separators to spaces
    s = s.replace(/[\-_]+/g, " ");
    // Collapse multiple spaces
    s = s.replace(/\s+/g, " ");
    // Trim again
    s = s.trim();
    return s;
  },

  // Helper to check if user has access to a directory
  async hasDirectoryAccess(
    req: AuthRequest,
    directoryId: string | null
  ): Promise<boolean> {
    try {
      const user = req.user;
      const userId = user?._id?.toString();
      
      // Get the workspace domain - for cross-domain users, req.userDomain is set to workspace domain by middleware
      // For same-domain users, req.userDomain equals user.domain
      const workspaceDomain = req.userDomain || req.user?.domain;
      
      // Domain admins of the workspace domain have access to all directories
      // BUT invited admins from other domains should only see granted directories
      // Check if user is admin of the workspace domain (not just any admin)
      if (user?.role === "admin" && user.domain === workspaceDomain) {
        return true;
      }

      // Root directory (null directoryId) - all workspace members can access
      if (!directoryId) return true;

      // Check if user owns the directory - use workspace domain for directory lookup
      const directory = await Directory.findOne({
        id: directoryId,
        domain: workspaceDomain, // Use workspace domain, not user domain
      });

      if (!directory) return false;

      if (directory.ownerUserId === userId) return true;

      // Check user-scoped share permission
      // SharePermission uses the workspace domain (where the directory exists)
      if (userId) {
        const userShare = await SharePermission.findOne({
          domain: workspaceDomain,
          resourceType: "directory",
          resourceId: directoryId,
          scope: "user",
          principalId: userId,
        });
        if (userShare) return true;
      }

      // Check workspace-scoped share permission
      const workspaceKey = req.currentWorkspace || workspaceDomain;
      const wsShare = await SharePermission.findOne({
        domain: workspaceDomain,
        resourceType: "directory",
        resourceId: directoryId,
        scope: "workspace",
        principalId: workspaceKey,
      });

      return !!wsShare;
    } catch (error) {
      console.error("Error in hasDirectoryAccess:", error);
      // Return false on error to be safe (deny access)
      return false;
    }
  },
  async getAll(req: AuthRequest, res: Response) {
    try {
      const { type, directoryId, includeDeleted } = (req.query || {}) as {
        type?: string;
        directoryId?: string;
        includeDeleted?: string;
      };
      // Get current workspace from request
      // Workspace is required - domainAuth middleware ensures req.currentWorkspace is set
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({
          error: "Workspace is required. Please select a workspace.",
        });
      }

      // For document queries, use the workspace domain (where documents are stored)
      // For cross-domain users, req.userDomain should be set to the workspace domain by middleware
      // But if not, we need to get it from the workspace
      const userHomeDomain = req.user?.domain || req.userDomain;
      
      // Get workspace to find its domain
      const { Workspace } = await import("../models/Workspace");
      const workspace = await Workspace.findOne({ workspaceId: currentWorkspace });
      const workspaceDomain = workspace?.domain || userHomeDomain; // Domain where workspace exists

      const query: any = {
        domain: workspaceDomain, // Use workspace domain (where documents are stored)
        workspaceId: currentWorkspace, // Filter by workspace - required
      };

      // If a type filter is provided, use it
      if (type === "DRHP" || type === "RHP") {
        query.type = type;
      }

      // Enforce time-bucket permissions based on user's accessibleWorkspaces
      const user = (req as any).user;
      const wsEntry = Array.isArray(user?.accessibleWorkspaces)
        ? user.accessibleWorkspaces.find(
            (w: any) => w.workspaceDomain === req.userDomain && w.isActive
          )
        : undefined;

      // Default to all if no entry found (backward compatibility)
      let allowedBuckets: string[] = wsEntry?.allowedTimeBuckets || ["all"];

      // Always allow admins full access
      if (user?.role === "admin") {
        allowedBuckets = ["all"];
      }

      // If this is the user's primary domain, allow all
      if (
        (user?.domain || "").toLowerCase() ===
        (req.userDomain || "").toLowerCase()
      ) {
        allowedBuckets = ["all"];
      }

      // Build date range conditions
      if (!allowedBuckets.includes("all")) {
        const now = new Date();

        // Use the most restrictive time bucket (shortest time range)
        // Priority: today > last7 > last15 > last30 > last90
        let selectedBucket = null;

        if (allowedBuckets.includes("today")) {
          selectedBucket = "today";
        } else if (allowedBuckets.includes("last7")) {
          selectedBucket = "last7";
        } else if (allowedBuckets.includes("last15")) {
          selectedBucket = "last15";
        } else if (allowedBuckets.includes("last30")) {
          selectedBucket = "last30";
        } else if (allowedBuckets.includes("last90")) {
          selectedBucket = "last90";
        }

        if (selectedBucket) {
          let start: Date;

          if (selectedBucket === "today") {
            start = new Date();
            start.setUTCHours(0, 0, 0, 0);
            query.uploadedAt = { $gte: start, $lte: now };
          } else if (selectedBucket === "last7") {
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            query.uploadedAt = { $gte: start, $lte: now };
          } else if (selectedBucket === "last15") {
            start = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
            query.uploadedAt = { $gte: start, $lte: now };
          } else if (selectedBucket === "last30") {
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            query.uploadedAt = { $gte: start, $lte: now };
          } else if (selectedBucket === "last90") {
            start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            query.uploadedAt = { $gte: start, $lte: now };
          }
        }
      }

      // Apply explicit overrides if present
      if (wsEntry?.extraDocumentIds?.length) {
        // If there are extra documents, we need to include them regardless of time filtering
        const extraDocsQuery = { id: { $in: wsEntry.extraDocumentIds } };

        if (query.uploadedAt) {
          // If we have time filtering, use $or to include both time-filtered docs and extra docs
          query.$or = [{ uploadedAt: query.uploadedAt }, extraDocsQuery];
          delete query.uploadedAt; // Remove the direct time filter since we're using $or
        } else {
          // No time filtering, just add extra docs
          query.$or = query.$or || [];
          query.$or.push(extraDocsQuery);
        }
      }

      if (wsEntry?.blockedDocumentIds?.length) {
        query.id = { $nin: wsEntry.blockedDocumentIds };
      }

      if (directoryId === "root") {
        query.directoryId = null;
      } else if (typeof directoryId === "string") {
        query.directoryId = directoryId;
      }

      // no trash filter; return all in directory

      const allDocuments = await Document.find(query).sort({ uploadedAt: -1 });

      // Filter documents based on directory access permissions
      // Only show documents from directories the user has access to
      // Same-domain admins of the workspace domain see all documents
      // BUT cross-domain admins (invited from other domains) should only see documents in granted directories
      const userDomain = user?.domain;
      const isSameDomainAdmin = user?.role === "admin" && userDomain && userDomain === workspaceDomain;
      const isCrossDomainAdmin = user?.role === "admin" && userDomain && userDomain !== workspaceDomain;
      
      if (isSameDomainAdmin) {
        return res.json(allDocuments);
      }

      // Filter documents: only include those whose parent directory user has access to
      const accessibleDocuments = await Promise.all(
        allDocuments.map(async (doc) => {
          // Check if user has access to the document's parent directory
          const hasAccess = await documentController.hasDirectoryAccess(req, doc.directoryId || null);
          return hasAccess ? doc : null;
        })
      );

      // Filter out null values (documents without directory access)
      const filteredDocuments = accessibleDocuments.filter(
        (d): d is typeof allDocuments[0] => d !== null
      );

      res.json(filteredDocuments);
    } catch (error) {
      console.error("Error in getAll documents:", error);
      console.error("Error stack:", (error as Error).stack);
      res.status(500).json({ error: "Failed to fetch documents", details: String(error) });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only access documents from their domain
        workspaceId: currentWorkspace, // Ensure user can only access documents from their workspace
      };

      // Check for link access
      const linkAccess = (req as any).linkAccess;
      if (
        linkAccess &&
        linkAccess.resourceType === "document" &&
        linkAccess.resourceId === req.params.id
      ) {
        // Allow access via link token
        query.domain = linkAccess.domain;
      }

      const document = await Document.findOne(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const docData = { ...req.body };
      // Ensure namespace is always set and preserve original name with .pdf extension
      if (!docData.namespace) {
        docData.namespace = docData.name;
      }
      // Keep original namespace as-is to preserve .pdf extension
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }
      
      // Always use user's actual domain (not workspace slug)
      // req.userDomain might be workspace slug, but we need the actual user domain
      const actualDomain = req.user?.domain || req.userDomain;

      // Add domain and workspace to document data
      docData.domain = actualDomain; // Use actual user domain, not workspace slug
      docData.workspaceId = currentWorkspace;

      // Check duplicate by namespace within workspace
      const existing = await Document.findOne({
        workspaceId: currentWorkspace,
        namespace: docData.namespace,
      }).collation({ locale: "en", strength: 2 });
      if (existing) {
        return res.status(409).json({
          error: "Document with this namespace already exists",
          existingDocument: existing,
        });
      }
      const document = new Document(docData);
      await document.save();
      await publishEvent({
        actorUserId: (req as any).user?._id?.toString?.(),
        domain: (req as any).userDomain,
        action: "document.uploaded",
        resourceType: "document",
        resourceId: document.id,
        title: `Document uploaded: ${document.name}`,
        notifyWorkspace: true,
      });
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only update documents from their domain
        workspaceId: currentWorkspace, // Ensure user can only update documents from their workspace
      };
      const update: any = { ...req.body };
      if (typeof req.body?.directoryId !== "undefined") {
        update.directoryId =
          req.body.directoryId === "root" ? null : req.body.directoryId;
      }
      const document = await Document.findOneAndUpdate(query, update, {
        new: true,
      });
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  },

  // restore disabled while trash functionality is off

  async delete(req: AuthRequest, res: Response) {
    try {
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only delete documents from their domain
        workspaceId: currentWorkspace, // Ensure user can only delete documents from their workspace
      };
      const document = await Document.findOne(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // HARD DELETE: remove file(s) from R2 and Mongo based on type
      if (document.fileKey) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: document.fileKey,
          });
          await r2Client.send(deleteCommand);
        } catch (err) {
          console.error("Failed to delete file from R2:", err);
        }
      }

      // Build list of document ids to cascade delete against (this doc + paired doc if any)
      const docIdsToDelete: string[] = [document.id];

      // If deleting a DRHP, also delete its related RHP document and its file
      if (document.type === "DRHP" && document.relatedRhpId) {
        const rhpDoc = await Document.findOne({ id: document.relatedRhpId, domain: req.userDomain, workspaceId: currentWorkspace });
        if (rhpDoc) {
          if (rhpDoc.fileKey) {
            try {
              const deleteRhpCommand = new DeleteObjectCommand({
                Bucket: R2_BUCKET,
                Key: rhpDoc.fileKey,
              });
              await r2Client.send(deleteRhpCommand);
            } catch (err) {
              console.error("Failed to delete RHP file from R2:", err);
            }
          }
          docIdsToDelete.push(rhpDoc.id);
        }
      }

      // If deleting an RHP, unlink from DRHP (and include for report deletion scope)
      if (document.type === "RHP") {
        const drhpDoc = await Document.findOne({ relatedRhpId: document.id, domain: req.userDomain, workspaceId: currentWorkspace });
        if (drhpDoc) {
          drhpDoc.relatedRhpId = undefined as any;
          await drhpDoc.save();
          // not deleting DRHP here; only unlink
        }
      }

      // Delete summaries for all affected documents
      await Summary.deleteMany({ domain: req.userDomain, workspaceId: currentWorkspace, documentId: { $in: docIdsToDelete } });

      // Delete chats for all affected documents
      await Chat.deleteMany({ domain: req.userDomain, workspaceId: currentWorkspace, documentId: { $in: docIdsToDelete } });

      // Delete reports that reference any of the affected documents as DRHP or RHP
      await Report.deleteMany({ domain: req.userDomain, workspaceId: currentWorkspace, $or: [ { drhpId: { $in: docIdsToDelete } }, { rhpId: { $in: docIdsToDelete } } ] });

      // Finally, delete the documents themselves
      await Document.deleteMany({ id: { $in: docIdsToDelete }, domain: req.userDomain, workspaceId: currentWorkspace });

      // Publish delete event for the primary document
      await publishEvent({
        actorUserId: (req as any).user?._id?.toString?.(),
        domain: (req as any).userDomain,
        action: "document.deleted",
        resourceType: "document",
        resourceId: document.id,
        title: `Document deleted: ${document.name}`,
        notifyWorkspace: true,
      });

      res.json({ message: "Document and related artifacts deleted successfully" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  },

  async uploadDocument(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const originalname = req.file.originalname;
      const fileKey = (req.file as any).key;
      const user = (req as any).user;
      // Use original filename for namespace to preserve .pdf extension
      // Workspace is required for document upload
      const workspaceId = req.currentWorkspace;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace is required. Please select a workspace." });
      }

      // Get user's domainId
      const userWithDomain = await User.findById(user._id).select("domainId");
      if (!userWithDomain?.domainId) {
        return res.status(400).json({ error: "User domainId not found. Please contact administrator." });
      }

      // Determine document type from request body, default to DRHP
      const documentType = req.body.type || "DRHP"; // Accept type from frontend, default to DRHP
      
      const docData: any = {
        id: req.body.id || fileKey, // Use provided id from frontend or fallback to fileKey
        name: originalname,
        fileKey: fileKey,
        namespace: originalname || req.body.namespace, // Use original name directly to preserve .pdf
        type: documentType, // Set type based on request (DRHP or RHP)
        status: "processing", // Set status to processing initially - n8n will update to completed
        domain: user.domain, // Add domain for workspace isolation - backward compatibility
        domainId: userWithDomain.domainId, // Link to Domain schema
        workspaceId, // Workspace required - middleware ensures it's set
        directoryId:
          req.body.directoryId === "root" ? null : req.body.directoryId || null,
      };
      // Pre-check duplicate by namespace within workspace
      const duplicate = await Document.findOne({
        workspaceId: docData.workspaceId,
        namespace: docData.namespace,
      }).collation({ locale: "en", strength: 2 });
      if (duplicate) {
        return res.status(409).json({
          error: "Document with this namespace already exists",
          existingDocument: duplicate,
        });
      }
      if (user?.microsoftId) {
        docData.microsoftId = user.microsoftId;
      } else if (user?._id) {
        docData.userId = user._id.toString();
      }
      const document = new Document(docData);
      await document.save();

      // Publish event for upload
      await publishEvent({
        actorUserId: (req as any).user?._id?.toString?.(),
        domain: (req as any).userDomain,
        action: "document.uploaded",
        resourceType: "document",
        resourceId: document.id,
        title: `Document uploaded: ${document.name}`,
        notifyWorkspace: true,
      });

      // Notify n8n for further processing - choose webhook based on document type
      const n8nWebhookUrl = documentType === "RHP"
        ? "https://n8n-excollo.azurewebsites.net/webhook/upload-rhp"
        : "https://n8n-excollo.azurewebsites.net/webhook/bfda1ff3-99be-4f6e-995f-7728ca5b2f6a";

      // Download file from S3 and send to n8n
      const getObjectCommand = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: fileKey,
      });
      const s3Response = await r2Client.send(getObjectCommand);
      const form = new FormData();
      form.append("file", s3Response.Body as any, {
        filename: document.name,
        contentType: "application/pdf",
      });
      form.append("documentId", document.id);
      form.append("namespace", document.name);
      form.append("name", document.name);
      form.append("domain", document.domain || user.domain);
      form.append("domainId", document.domainId || userWithDomain.domainId);
      form.append("workspaceId", document.workspaceId || workspaceId);
      form.append("type", document.type); // Include document type in n8n request

      // Send to n8n and check response for status
      try {
        const n8nResponse = await axios.post(n8nWebhookUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 300000, // 5 minutes timeout
        });
        
        // Check if n8n returned a status in the response
        if (n8nResponse?.data) {
          const n8nStatus = n8nResponse.data?.status || n8nResponse.data?.documentStatus;
          const normalizedStatus = n8nStatus?.toLowerCase()?.trim();
          
          // If n8n returned a completed/ready status, update the document immediately
          if (normalizedStatus === "completed" || normalizedStatus === "ready" || normalizedStatus === "complete") {
            document.status = "completed";
            await document.save();
            console.log(`✅ Document ${document.id} status updated to "completed" from n8n response`);
          } else if (normalizedStatus === "failed" || normalizedStatus === "error") {
            document.status = "failed";
            await document.save();
            console.log(`❌ Document ${document.id} status updated to "failed" from n8n response`);
          }
          // If status is "processing" or undefined, keep the default "processing" status
        }
      } catch (n8nErr) {
        console.error("Failed to send file to n8n:", n8nErr);
        // Even if n8n call fails, return the document (it's already saved with "processing" status)
      }

      res.status(201).json({ message: "File uploaded successfully", document });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  },

  async downloadDocument(req: AuthRequest, res: Response) {
    try {
      const document = await Document.findOne({ id: req.params.id });
      if (!document || !document.fileKey) {
        return res.status(404).json({ error: "Document not found or no file" });
      }
      const inline = (req.query.inline as string) === "1";
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `${
          inline ? "inline" : "attachment"
        }; filename=\"${document.name}\"`,
        "Cache-Control": "private, max-age=60",
      });
      const getObjectCommand = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: document.fileKey,
      });
      const s3Response = await r2Client.send(getObjectCommand);
      if (s3Response.Body) {
        (s3Response.Body as any).pipe(res).on("error", () => {
          res.status(500).json({ error: "Error downloading file" });
        });
      } else {
        res.status(500).json({ error: "File stream not available" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to download document" });
    }
  },

  async checkExistingByNamespace(req: AuthRequest, res: Response) {
    try {
      const { namespace } = req.query;
      if (!namespace) {
        return res
          .status(400)
          .json({ error: "Namespace parameter is required" });
      }

      // Use namespace as-is to preserve .pdf extension
      const queryNamespace = namespace as string;
      // Workspace is required
      const currentWorkspace = req.currentWorkspace;
      if (!currentWorkspace) {
        return res.status(400).json({ error: "Workspace is required" });
      }

      const query: any = {
        namespace: queryNamespace,
        domain: req.userDomain, // Check within user's domain only
        workspaceId: currentWorkspace, // Check within user's workspace only
      };

      const existingDocument = await Document.findOne(query).collation({
        locale: "en",
        strength: 2,
      });

      if (existingDocument) {
        res.json({
          exists: true,
          document: existingDocument,
          message: "Document with this name already exists",
        });
      } else {
        res.json({
          exists: false,
          message: "Document with this name does not exist",
        });
      }
    } catch (error) {
      console.error("Error checking existing document:", error);
      res.status(500).json({ error: "Failed to check existing document" });
    }
  },

  async uploadStatusUpdate(req: AuthRequest, res: Response) {
    try {
      // Accept both jobId and documentId from n8n (n8n might send either)
      const { jobId, documentId, status, error } = req.body;
      const identifier = jobId || documentId;
      
      if (!identifier || !status) {
        return res.status(400).json({ 
          message: "Missing jobId/documentId or status",
          received: { jobId, documentId, status }
        });
      }
      
      const normalizedStatus = status.trim().toLowerCase();
      console.log(`📥 Received status update for ${identifier}: ${normalizedStatus}`);
      
      // Update document status in MongoDB - try multiple lookup methods
      try {
        let document = await Document.findOne({ id: identifier });
        
        // If not found by id, try by documentId field
        if (!document && documentId) {
          document = await Document.findOne({ id: documentId });
        }
        
        // If still not found, try by fileKey
        if (!document) {
          document = await Document.findOne({ fileKey: identifier });
        }
        
        // If still not found, try by _id (MongoDB ObjectId)
        if (!document && identifier.match(/^[0-9a-fA-F]{24}$/)) {
          document = await Document.findById(identifier);
        }
        
        if (document) {
          // Map n8n status to our document status
          let newStatus = document.status; // Default to current status
          
          if (normalizedStatus === "completed" || normalizedStatus === "ready" || normalizedStatus === "complete") {
            newStatus = "completed";
          } else if (normalizedStatus === "failed" || normalizedStatus === "error") {
            newStatus = "failed";
          } else if (normalizedStatus === "processing") {
            newStatus = "processing";
          }
          
          // Always update if status is "completed" (force update even if already completed)
          const oldStatus = document.status;
          const shouldUpdate = oldStatus !== newStatus || (newStatus === "completed" && oldStatus === "processing");
          
          if (shouldUpdate) {
            document.status = newStatus;
            await document.save();
            console.log(`✅ Updated document ${document.id} (${document.name}) status from "${oldStatus}" to "${newStatus}"`);
            
            // Also try to find and update by MongoDB _id to ensure persistence
            try {
              await Document.updateOne(
                { _id: document._id },
                { $set: { status: newStatus } }
              );
              console.log(`✅ Confirmed MongoDB update for document ${document.id}`);
            } catch (updateError) {
              console.error(`⚠️ Secondary update failed (non-critical):`, updateError);
            }
          } else {
            console.log(`ℹ️ Document ${document.id} status unchanged: "${oldStatus}"`);
          }
          
          // Use the found document's id for socket emission
          const actualJobId = document.id;
          io.emit("upload_status", { jobId: actualJobId, status: normalizedStatus, error });
          
          res.status(200).json({
            message: "Upload status update processed",
            jobId: actualJobId,
            documentId: document.id,
            status: normalizedStatus,
            previousStatus: oldStatus,
            newStatus: newStatus,
            error,
          });
        } else {
          console.warn(`⚠️ Document not found for identifier: ${identifier}`);
          console.warn(`   Tried: id=${identifier}, documentId=${documentId}, fileKey lookup, _id lookup`);
          
          // Still emit socket event even if document not found (for debugging)
          io.emit("upload_status", { jobId: identifier, status: normalizedStatus, error: error || "Document not found" });
          
          res.status(404).json({
            message: "Document not found",
            identifier,
            status: normalizedStatus,
            error: "Document not found in database",
          });
        }
      } catch (dbError: any) {
        console.error("❌ Error updating document status in database:", dbError);
        console.error("   Error details:", {
          message: dbError.message,
          stack: dbError.stack,
          name: dbError.name,
        });
        
        // Still emit socket event for debugging
        io.emit("upload_status", { jobId: identifier, status: normalizedStatus, error: dbError.message });
        
        res.status(500).json({
          message: "Failed to update document status",
          identifier,
          status: normalizedStatus,
          error: dbError.message || "Database error",
        });
      }
    } catch (err: any) {
      console.error("❌ Error in uploadStatusUpdate:", err);
      console.error("   Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
      res.status(500).json({
        message: "Failed to process upload status update",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async uploadRhp(req: AuthRequest, res: Response) {
    try {
      const { drhpId } = req.body;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      if (!drhpId) return res.status(400).json({ error: "Missing DRHP ID" });

      const drhp = await Document.findById(drhpId);
      if (!drhp) return res.status(404).json({ error: "DRHP not found" });

      const fileKey = (req.file as any).key;
      const user = (req as any).user;

      // Workspace is required for document upload
      const workspaceId = req.currentWorkspace;
      if (!workspaceId) {
        return res.status(400).json({ error: "Workspace is required. Please select a workspace." });
      }

      // Create RHP namespace by appending "-rhp" to the DRHP namespace
      const rhpNamespace = req.file.originalname;

      // Get user's domainId
      const userWithDomain = await User.findById(user._id).select("domainId");
      if (!userWithDomain?.domainId) {
        return res.status(400).json({ error: "User domainId not found. Please contact administrator." });
      }

      const rhpDocData: any = {
        id: fileKey,
        fileKey: fileKey,
        name: req.file.originalname, // Use original filename with .pdf extension
        namespace: req.file.originalname, // Use original filename with .pdf extension
        rhpNamespace: rhpNamespace,
        type: "RHP",
        status: "processing", // Set status to processing initially - n8n will update to completed
        relatedDrhpId: drhp.id,
        domain: user.domain, // Add domain for workspace isolation - backward compatibility
        domainId: userWithDomain.domainId, // Link to Domain schema
        workspaceId, // Workspace required - middleware ensures it's set
      };

      // Add user information if available
      if (user?.microsoftId) {
        rhpDocData.microsoftId = user.microsoftId;
      } else if (user?._id) {
        rhpDocData.userId = user._id.toString();
      }

      const rhpDoc = new Document(rhpDocData);
      await rhpDoc.save();

      drhp.relatedRhpId = rhpDoc.id;
      await drhp.save();

      // Send to n8n with RHP namespace
      const n8nWebhookUrl =
        "https://n8n-excollo.azurewebsites.net/webhook/upload-rhp";

      // Download file from S3 and send to n8n
      const getObjectCommand = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: fileKey,
      });
      const s3Response = await r2Client.send(getObjectCommand);
      const form = new FormData();
      form.append("file", s3Response.Body as any, {
        filename: rhpDoc.name,
        contentType: "application/pdf",
      });
      form.append("documentId", rhpDoc.id);
      form.append("namespace", rhpNamespace); // Use RHP namespace for n8n
      form.append("name", drhp.name);
      form.append("domain", rhpDoc.domain || user.domain);
      form.append("domainId", rhpDoc.domainId || userWithDomain.domainId);
      form.append("workspaceId", rhpDoc.workspaceId || workspaceId);

      // Send to n8n and check response for status
      let finalStatus = "processing"; // Default status
      try {
        const n8nResponse = await axios.post(n8nWebhookUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 300000, // 5 minutes timeout
        });
        
        // Check if n8n returned a status in the response
        if (n8nResponse?.data) {
          const n8nStatus = n8nResponse.data?.status || n8nResponse.data?.documentStatus;
          const normalizedStatus = n8nStatus?.toLowerCase()?.trim();
          
          // If n8n returned a completed/ready status, update the document immediately
          if (normalizedStatus === "completed" || normalizedStatus === "ready" || normalizedStatus === "complete") {
            rhpDoc.status = "completed";
            await rhpDoc.save();
            finalStatus = "completed";
            console.log(`✅ RHP Document ${rhpDoc.id} status updated to "completed" from n8n response`);
          } else if (normalizedStatus === "failed" || normalizedStatus === "error") {
            rhpDoc.status = "failed";
            await rhpDoc.save();
            finalStatus = "failed";
            console.log(`❌ RHP Document ${rhpDoc.id} status updated to "failed" from n8n response`);
          }
          // If status is "processing" or undefined, keep the default "processing" status
        }
      } catch (n8nErr) {
        console.error("Failed to send file to n8n:", n8nErr);
        // Even if n8n call fails, return the document (it's already saved with "processing" status)
      }

      // Emit upload status (use the actual status from n8n or default to processing)
      const jobId = rhpDoc.id;
      io.emit("upload_status", { jobId, status: finalStatus });

      res
        .status(201)
        .json({ message: "RHP uploaded and linked", document: rhpDoc });
    } catch (error) {
      console.error("Error uploading RHP:", error);
      res.status(500).json({ error: "Failed to upload RHP" });
    }
  },

  // Admin: Get all documents across all workspaces in domain
  async getAllAdmin(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      console.log("Admin getAllAdmin - User:", user?.role, "Domain:", req.userDomain);
      
      if (!user || user.role !== "admin") {
        console.log("Admin access denied for user:", user?.role);
        return res.status(403).json({ error: "Admin access required" });
      }

      // Admin query: get all documents for the domain (don't filter by workspaceId)
      const query: any = {
        domain: req.user?.domain || req.userDomain, // Use user's actual domain for admin
      };

      // Also check domainId if available
      const userWithDomain = await User.findById(req.user._id).select("domainId");
      if (userWithDomain?.domainId) {
        query.$or = [
          { domain: req.user?.domain || req.userDomain },
          { domainId: userWithDomain.domainId }
        ];
      }

      console.log("Admin query:", JSON.stringify(query, null, 2));
      const documents = await Document.find(query).sort({ uploadedAt: -1 });
      console.log("Found documents:", documents.length);
      
      // Get all workspaces to map workspaceId to workspace name
      const { Workspace } = await import("../models/Workspace");
      const workspaces = await Workspace.find({ domain: req.user?.domain || req.userDomain });
      console.log("Found workspaces:", workspaces.length);
      const workspaceMap = new Map(workspaces.map(ws => [ws.workspaceId, { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug }]));

      // Add workspace information to each document
      const documentsWithWorkspace = documents.map(doc => ({
        ...doc.toObject(),
        workspaceId: workspaceMap.get(doc.workspaceId) || { workspaceId: doc.workspaceId, name: workspaceMap.get(doc.workspaceId)?.name ? workspaceMap.get(doc.workspaceId)?.name : 'Excollo', slug: 'unknown' }
      }));

      console.log("Returning documents with workspace info:", documentsWithWorkspace.length);
      res.json(documentsWithWorkspace);
    } catch (error) {
      console.error("Error fetching admin documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  },

  async getAvailableForCompare(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      // Get the document to compare with
      const document = await Document.findOne({
        id,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      });

      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Determine the opposite document type
      const oppositeType = document.type === "DRHP" ? "RHP" : "DRHP";

      // Get all documents of the opposite type that are not already linked
      const availableDocuments = await Document.find({
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        type: oppositeType,
        // Exclude documents that are already linked to this document
        $and: [
          { id: { $ne: document.id } },
          { relatedDrhpId: { $ne: document.id } },
          { relatedRhpId: { $ne: document.id } }
        ]
      }).select('id name type uploadedAt namespace').sort({ uploadedAt: -1 });

      res.json({
        selectedDocument: {
          id: document.id,
          name: document.name,
          type: document.type,
          uploadedAt: document.uploadedAt
        },
        availableDocuments
      });
    } catch (error) {
      console.error("Error fetching available documents for compare:", error);
      res.status(500).json({ error: "Failed to fetch available documents" });
    }
  },

  async linkForCompare(req: AuthRequest, res: Response) {
    try {
      const { drhpId, rhpId } = req.body;
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      if (!drhpId || !rhpId) {
        return res.status(400).json({ error: "Both DRHP and RHP IDs are required" });
      }

      // Verify both documents exist and belong to the user
      const drhpDoc = await Document.findOne({
        id: drhpId,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        type: "DRHP"
      });

      const rhpDoc = await Document.findOne({
        id: rhpId,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        type: "RHP"
      });

      if (!drhpDoc || !rhpDoc) {
        return res.status(404).json({ error: "One or both documents not found" });
      }

      // Check if documents are already linked
      if (drhpDoc.relatedRhpId === rhpId || rhpDoc.relatedDrhpId === drhpId) {
        return res.status(400).json({ error: "Documents are already linked" });
      }

      // Link the documents
      drhpDoc.relatedRhpId = rhpId;
      rhpDoc.relatedDrhpId = drhpId;

      await drhpDoc.save();
      await rhpDoc.save();

      // Publish event for the linking
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "documents.linked",
        resourceType: "document",
        resourceId: drhpId,
        title: `Documents linked for comparison: ${drhpDoc.name} ↔ ${rhpDoc.name}`,
        notifyWorkspace: true,
      });

      res.json({
        message: "Documents linked successfully for comparison",
        drhpDocument: {
          id: drhpDoc.id,
          name: drhpDoc.name,
          type: drhpDoc.type
        },
        rhpDocument: {
          id: rhpDoc.id,
          name: rhpDoc.name,
          type: rhpDoc.type
        }
      });
    } catch (error) {
      console.error("Error linking documents for compare:", error);
      res.status(500).json({ error: "Failed to link documents" });
    }
  },

  async unlinkForCompare(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const document = await Document.findOne({
        id,
        domain: req.userDomain,
        workspaceId: currentWorkspace,
      });

      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      let linkedDocument = null;

      // Unlink based on document type
      if (document.type === "DRHP" && document.relatedRhpId) {
        linkedDocument = await Document.findOne({
          id: document.relatedRhpId,
          domain: req.userDomain,
          workspaceId: currentWorkspace,
        });
        
        if (linkedDocument) {
          linkedDocument.relatedDrhpId = undefined;
          await linkedDocument.save();
        }
        
        document.relatedRhpId = undefined;
        await document.save();
      } else if (document.type === "RHP" && document.relatedDrhpId) {
        linkedDocument = await Document.findOne({
          id: document.relatedDrhpId,
          domain: req.userDomain,
          workspaceId: currentWorkspace,
        });
        
        if (linkedDocument) {
          linkedDocument.relatedRhpId = undefined;
          await linkedDocument.save();
        }
        
        document.relatedDrhpId = undefined;
        await document.save();
      }

      // Publish event for the unlinking
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "documents.unlinked",
        resourceType: "document",
        resourceId: document.id,
        title: `Documents unlinked: ${document.name}`,
        notifyWorkspace: true,
      });

      res.json({
        message: "Documents unlinked successfully",
        unlinkedDocument: {
          id: document.id,
          name: document.name,
          type: document.type
        }
      });
    } catch (error) {
      console.error("Error unlinking documents:", error);
      res.status(500).json({ error: "Failed to unlink documents" });
    }
  },
};
