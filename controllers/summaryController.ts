/// <reference path="../types/html-docx-js.d.ts" />
import { Request, Response } from "express";
import { Summary } from "../models/Summary";
import { Document } from "../models/Document";
import axios from "axios";
import mongoose from "mongoose";
import { getGridFSBucket } from "../config/gridfs";
import htmlDocx from "html-docx-js";
import mammoth from "mammoth";
import { writeFile, unlink } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { io } from "../index";

const execAsync = promisify(exec);

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
      // Check if any summaries exist for this document
      const existingCount = await Summary.countDocuments({
        documentId: req.body.documentId,
      });

      if (existingCount > 0) {
        // If summaries exist, delete them
        await Summary.deleteMany({ documentId: req.body.documentId });
        console.log(
          `Deleted ${existingCount} existing summaries for documentId: ${req.body.documentId}`
        );
      }

      // Create the new summary
      const summary = new Summary({ ...req.body });
      await summary.save();
      res.status(201).json(summary);
    } catch (error) {
      console.error("Error creating summary:", error);
      res.status(500).json({ error: "Failed to create summary" });
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

  // Endpoint: Download DOCX generated from HTML content by summary ID
  async downloadDocx(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const summary = await Summary.findOne({ id });
      if (!summary || !summary.content) {
        return res.status(404).json({ error: "Summary not found" });
      }

      // Write HTML to a temp file
      const tmpDir = os.tmpdir();
      const htmlPath = path.join(tmpDir, `summary_${id}.html`);
      const docxPath = path.join(tmpDir, `summary_${id}.docx`);
      await writeFile(htmlPath, summary.content, "utf8");

      // Convert HTML to DOCX using Pandoc
      await execAsync(`pandoc "${htmlPath}" -o "${docxPath}"`);

      // Send DOCX file
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${summary.title || "summary"}.docx"`
      );
      res.sendFile(docxPath, async (err) => {
        // Clean up temp files
        await unlink(htmlPath);
        await unlink(docxPath);
      });
    } catch (error) {
      console.error("Error generating DOCX with Pandoc:", error);
      res.status(500).json({ error: "Failed to generate DOCX" });
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

  async summaryStatusUpdate(req: Request, res: Response) {
    try {
      const { jobId, status, error } = req.body;
      if (!jobId || !status) {
        return res.status(400).json({ message: "Missing jobId or status" });
      }
      console.log("Emitting summary_status:", { jobId, status, error });
      // Emit real-time update
      io.emit("summary_status", { jobId, status, error });
      res
        .status(200)
        .json({ message: "Status update emitted", jobId, status, error });
    } catch (err) {
      res.status(500).json({
        message: "Failed to emit status update",
        error: err instanceof Error ? err.message : err,
      });
    }
  },
};
