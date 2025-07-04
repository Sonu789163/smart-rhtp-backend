import { Request, Response } from "express";
import { Summary } from "../models/Summary";
import { Document } from "../models/Document";
import axios from "axios";
import mongoose from "mongoose";
import { getGridFSBucket } from "../config/gridfs";

interface AuthRequest extends Request {
  user?: any;
}

export const summaryController = {
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
      const summaries = await Summary.find(query).sort({ updatedAt: -1 });
      res.json(summaries);
    } catch (error) {
      console.error("Error fetching summaries:", error);
      res.status(500).json({ message: "Error fetching summaries" });
    }
  },

  async getByDocumentId(req: AuthRequest, res: Response) {
    try {
      const { documentId } = req.params;
      const query: any = { documentId };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const summaries = await Summary.find(query).sort({ updatedAt: -1 });
      res.json(summaries);
    } catch (error) {
      console.error("Error fetching summaries:", error);
      res.status(500).json({ message: "Error fetching summaries" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const { title, content, documentId, metadata } = req.body;
      if (!title || !content || !documentId) {
        return res.status(400).json({
          message: "Missing required fields",
          required: { title, content, documentId },
        });
      }
      const user = req.user;
      // Validate that the document belongs to the user
      const documentQuery: any = { id: documentId };
      if (user.microsoftId) {
        documentQuery.microsoftId = user.microsoftId;
      } else if (user._id) {
        documentQuery.userId = user._id.toString();
      } else {
        return res.status(400).json({ message: "No user identifier found" });
      }
      // Check if document exists and belongs to user
      const document = await Document.findOne(documentQuery);
      if (!document) {
        return res
          .status(404)
          .json({ error: "Document not found or access denied" });
      }
      let pdfFileId = null;
      // If metadata.url exists, download and store PDF in GridFS
      if (metadata && metadata.url) {
        try {
          const bucket = getGridFSBucket();
          const response = await axios.get(metadata.url, {
            responseType: "stream",
          });
          const uploadStream = bucket.openUploadStream(`${title}.pdf`, {
            contentType: "application/pdf",
          });
          await new Promise((resolve, reject) => {
            response.data
              .pipe(uploadStream)
              .on("error", reject)
              .on("finish", resolve);
          });
          pdfFileId = uploadStream.id;
        } catch (err) {
          console.error("Failed to download/upload PDF to GridFS:", err);
        }
      }
      const summaryData: any = {
        id: Date.now().toString(),
        title,
        content,
        documentId,
        updatedAt: new Date(),
        metadata,
        pdfFileId,
      };
      if (user.microsoftId) {
        summaryData.microsoftId = user.microsoftId;
      } else if (user._id) {
        summaryData.userId = user._id.toString();
      } else {
        return res.status(400).json({ message: "No user identifier found" });
      }
      const summary = new Summary(summaryData);
      await summary.save();
      res.status(201).json(summary);
    } catch (error) {
      console.error("Error creating summary:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        message: "Error creating summary",
        error: errorMessage,
      });
    }
  },

  // New endpoint: Download PDF from GridFS by summary ID
  async downloadPdf(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const summary = await Summary.findOne({ id });
      if (!summary || !summary.pdfFileId) {
        return res
          .status(404)
          .json({ error: "PDF not found for this summary" });
      }
      const bucket = getGridFSBucket();
      res.set("Content-Type", "application/pdf");
      bucket.openDownloadStream(summary.pdfFileId).pipe(res);
    } catch (error) {
      console.error("Error downloading PDF from GridFS:", error);
      res.status(500).json({ error: "Failed to download PDF" });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const query: any = { id };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const summary = await Summary.findOneAndUpdate(query, req.body, {
        new: true,
      });
      if (!summary) {
        return res.status(404).json({ message: "Summary not found" });
      }
      res.json(summary);
    } catch (error) {
      console.error("Error updating summary:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        message: "Error updating summary",
        error: errorMessage,
      });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const query: any = { id };
      if (req.user.microsoftId) {
        query.microsoftId = req.user.microsoftId;
      } else if (req.user._id) {
        query.userId = req.user._id.toString();
      } else {
        return res.status(400).json({ error: "No user identifier found" });
      }
      const summary = await Summary.findOneAndDelete(query);
      if (!summary) {
        return res.status(404).json({ message: "Summary not found" });
      }
      res.json({ message: "Summary deleted successfully" });
    } catch (error) {
      console.error("Error deleting summary:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      res.status(500).json({
        message: "Error deleting summary",
        error: errorMessage,
      });
    }
  },
};
