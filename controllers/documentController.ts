import { Request, Response } from "express";
import { Document } from "../models/Document";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import axios from "axios";
import FormData from "form-data";
import { io } from "../index";
import { r2Client, R2_BUCKET } from "../config/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

interface AuthRequest extends Request {
  user?: any;
}

export const documentController = {
  async getAll(req: Request, res: Response) {
    try {
      const query: any = { type: "DRHP" };
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
      const document = await Document.findOneAndDelete(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
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
        id: fileKey,
        name: originalname,
        fileKey: fileKey,
        namespace: req.body.namespace || originalname,
        type: "DRHP", // Set type for DRHP documents
      };
      // if (user?.microsoftId) {
      //   docData.microsoftId = user.microsoftId;
      // } else if (user?._id) {
      //   docData.userId = user._id.toString();
      // } else {
      //   return res.status(400).json({ error: "No user identifier found" });
      // }
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
      console.log("fromData", form);

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
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${document.name}\"`,
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
        console.log("Emitting upload_status:", { jobId, status, error });
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
      // const user = (req as any).user;

      // Create RHP namespace by appending "-rhp" to the DRHP namespace
      const rhpNamespace = req.file.originalname;

      const rhpDoc = new Document({
        id: fileKey,
        fileKey: fileKey,
        name: drhp.name,
        namespace: drhp.namespace, // Keep original namespace for reference
        rhpNamespace: rhpNamespace,
        type: "RHP",
        relatedDrhpId: drhp.id,
      });
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
