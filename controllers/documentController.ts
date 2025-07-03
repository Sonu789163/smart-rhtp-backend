import { Request, Response } from "express";
import { Document } from "../models/Document";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import axios from "axios";
import FormData from "form-data";

interface AuthRequest extends Request {
  user?: any;
}

export const documentController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const query: any = {};
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const documents = await Document.find(query).sort({ uploadedAt: -1 });
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
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
      const user = req.user;
      const docData = { ...req.body };
      if (user.microsoftId) {
        docData.microsoftId = user.microsoftId;
      } else if (user._id) {
        docData.userId = user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
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

  async update(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
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

  async delete(req: AuthRequest, res: Response) {
    try {
      const query: any = { id: req.params.id };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const document = await Document.findOne(query);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      // Delete file from GridFS
      if (document.fileId) {
        const conn = mongoose.connection;
        const bucket = new GridFSBucket(conn.db, { bucketName: "uploads" });
        await bucket.delete(document.fileId);
      }
      await document.deleteOne();
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
      const fileId = (req.file as any).id;
      const user = (req as any).user;
      // Use namespace from frontend if present, else fallback to originalname
      const docData: any = {
        id: fileId.toString(),
        name: originalname,
        fileId: fileId,
        namespace: req.body.namespace || originalname,
      };
      if (user?.microsoftId) {
        docData.microsoftId = user.microsoftId;
      } else if (user?._id) {
        docData.userId = user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const document = new Document(docData);
      await document.save();

      // Notify n8n for further processing
      const n8nWebhookUrl =
        "https://n8n-excollo.azurewebsites.net/webhook/bfda1ff3-99be-4f6e-995f-7728ca5b2f6a";
      const conn = mongoose.connection;
      const bucket = new GridFSBucket(conn.db, { bucketName: "uploads" });

      const form = new FormData();
      form.append("file", bucket.openDownloadStream(document.fileId), {
        filename: document.name,
        contentType: "application/pdf",
      });
      form.append("documentId", document.id);
      form.append("namespace", document.name);
      form.append("name", document.name);
      form.append("userId", document.userId || document.microsoftId);

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
      if (!document || !document.fileId) {
        return res.status(404).json({ error: "Document not found or no file" });
      }
      const conn = mongoose.connection;
      const bucket = new GridFSBucket(conn.db, { bucketName: "uploads" });
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${document.name}\"`,
      });
      const downloadStream = bucket.openDownloadStream(document.fileId);
      downloadStream.pipe(res).on("error", () => {
        res.status(500).json({ error: "Error downloading file" });
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to download document" });
    }
  },
};
