import { Request, Response } from "express";
import { Document } from "../models/Document";
import axios from "axios";
import FormData from "form-data";
import { io } from "../index";
import { r2Client, R2_BUCKET } from "../config/r2";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

interface AuthRequest extends Request {
  user?: any;
}

export const documentController = {
  async getAll(req: Request, res: Response) {
    try {
      // Admins can view all documents, regular users should only view their accessible set.
      // Current schema doesn't store uploader; until added, return all for now.
      // If a type filter is provided, use it; otherwise return all.
      const { type } = (req.query || {}) as { type?: string };
      const query: any = {};
      if (type === "DRHP" || type === "RHP") {
        query.type = type;
      }
      const documents = await Document.find(query).sort({ uploadedAt: -1 });
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const query: any = { id: req.params.id };
      const document = await Document.findOne(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const docData = { ...req.body };
      // Ensure namespace is always set
      if (!docData.namespace) {
        docData.namespace = docData.name;
      }
      const document = new Document(docData);
      await document.save();
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const query: any = { id: req.params.id };
      const document = await Document.findOneAndUpdate(query, req.body, {
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

  async delete(req: Request, res: Response) {
    try {
      const query: any = { id: req.params.id };
      const document = await Document.findOne(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Delete file from R2
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

      if (document.type === "DRHP") {
        // If deleting a DRHP, also delete its related RHP
        if (document.relatedRhpId) {
          const rhpDoc = await Document.findOne({ id: document.relatedRhpId });
          if (rhpDoc && rhpDoc.fileKey) {
            try {
              const deleteRhpCommand = new DeleteObjectCommand({
                Bucket: R2_BUCKET,
                Key: rhpDoc.fileKey,
              });
              await r2Client.send(deleteRhpCommand);
            } catch (err) {
              console.error("Failed to delete RHP file from R2:", err);
            }
            await Document.deleteOne({ id: document.relatedRhpId });
          }
        }
        // Delete DRHP document from MongoDB
        await Document.deleteOne({ id: document.id });
        res.json({ message: "DRHP and related RHP deleted successfully" });
      } else if (document.type === "RHP") {
        // If deleting an RHP, remove the reference from the DRHP
        const drhpDoc = await Document.findOne({ relatedRhpId: document.id });
        if (drhpDoc) {
          drhpDoc.relatedRhpId = undefined;
          await drhpDoc.save();
        }
        // Delete RHP document from MongoDB
        await Document.deleteOne({ id: document.id });
        res.json({ message: "RHP deleted successfully" });
      } else {
        // Generic document deletion
        await Document.deleteOne({ id: document.id });
        res.json({ message: "Document deleted successfully" });
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  },

  async uploadDocument(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const originalname = req.file.originalname;
      const fileKey = (req.file as any).key;
      const user = (req as any).user;
      // Use namespace from frontend if present, else fallback to originalname
      const docData: any = {
        id: req.body.id || fileKey, // Use provided id from frontend or fallback to fileKey
        name: originalname,
        fileKey: fileKey,
        namespace: req.body.namespace || originalname,
        type: "DRHP", // Set type for DRHP documents
      };
      if (user?.microsoftId) {
        docData.microsoftId = user.microsoftId;
      } else if (user?._id) {
        docData.userId = user._id.toString();
      }
      const document = new Document(docData);
      await document.save();

      // Notify n8n for further processing
      const n8nWebhookUrl =
        "https://n8n-excollo.azurewebsites.net/webhook/bfda1ff3-99be-4f6e-995f-7728ca5b2f6a";

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

      try {
        await axios.post(n8nWebhookUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } catch (n8nErr) {
        console.error("Failed to send file to n8n:", n8nErr);
      }

      res.status(201).json({ message: "File uploaded successfully", document });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  },

  async downloadDocument(req: Request, res: Response) {
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

      const query: any = { namespace: namespace as string };
      // if (req.user.microsoftId) {
      //   query.microsoftId = req.user.microsoftId;
      // } else if (req.user._id) {
      //   query.userId = req.user._id.toString();
      // } else {
      //   return res.status(400).json({ error: "No user identifier found" });
      // }

      const existingDocument = await Document.findOne(query);

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

  async uploadStatusUpdate(req: Request, res: Response) {
    try {
      const { jobId, status, error } = req.body;
      if (!jobId || !status) {
        return res.status(400).json({ message: "Missing jobId or status" });
      }
      // Only emit on failure
      if (status.trim().toLowerCase() === "failed") {
        io.emit("upload_status", { jobId, status, error });
      }
      res.status(200).json({
        message: "Upload status update processed",
        jobId,
        status,
        error,
      });
    } catch (err) {
      res.status(500).json({
        message: "Failed to process upload status update",
        error: err instanceof Error ? err.message : err,
      });
    }
  },

  async uploadRhp(req: Request, res: Response) {
    try {
      const { drhpId } = req.body;
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      if (!drhpId) return res.status(400).json({ error: "Missing DRHP ID" });

      const drhp = await Document.findById(drhpId);
      if (!drhp) return res.status(404).json({ error: "DRHP not found" });

      const fileKey = (req.file as any).key;
      const user = (req as any).user;

      // Create RHP namespace by appending "-rhp" to the DRHP namespace
      const rhpNamespace = req.file.originalname;

      const rhpDocData: any = {
        id: fileKey,
        fileKey: fileKey,
        name: drhp.name,
        namespace: drhp.namespace, // Keep original namespace for reference
        rhpNamespace: rhpNamespace,
        type: "RHP",
        relatedDrhpId: drhp.id,
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

      try {
        await axios.post(n8nWebhookUrl, form, {
          headers: form.getHeaders(),
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
      } catch (n8nErr) {
        console.error("Failed to send file to n8n:", n8nErr);
      }

      // Emit upload status (processing)
      const jobId = rhpDoc.id;
      io.emit("upload_status", { jobId, status: "processing" });

      res
        .status(201)
        .json({ message: "RHP uploaded and linked", document: rhpDoc });
    } catch (error) {
      console.error("Error uploading RHP:", error);
      res.status(500).json({ error: "Failed to upload RHP" });
    }
  },
};
