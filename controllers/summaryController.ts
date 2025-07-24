/// <reference path="../types/html-docx-js.d.ts" />
import { Request, Response } from "express";
import { Summary } from "../models/Summary";
import { Document } from "../models/Document";
import axios from "axios";
import mongoose from "mongoose";
import { r2Client, R2_BUCKET } from "../config/r2";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
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
      const response = req.body;
      if (!response) {
        throw new Error("Data is empty");
      }

      // Delete any existing summaries for this document
      await Summary.deleteMany({ documentId: response.documentId });

      let pdfFileKey = null;
      if (response.metadata && response.metadata.url) {
        try {
          const axiosResponse = await axios.get(response.metadata.url, {
            responseType: "stream",
          });
          const s3Key = `${Date.now()}-${(response.title || "summary").replace(
            /\s+/g,
            "_"
          )}.pdf`;
          await r2Client.send(
            new PutObjectCommand({
              Bucket: R2_BUCKET,
              Key: s3Key,
              Body: axiosResponse.data,
              ContentType: "application/pdf",
            })
          );
          pdfFileKey = s3Key;
        } catch (err) {
          console.error("Failed to download/upload PDF to S3:", err);
          return res
            .status(500)
            .json({ error: "Failed to upload PDF to Cloudflare R2" });
        }
      }

      // Add pdfFileKey to the summary document
      const summaryData = { ...response, pdfFileKey };
      const summary = new Summary(summaryData);
      await summary.save();

      res.status(201).json(summary);
    } catch (error) {
      console.error("Error creating summary:", error);
      res.status(500).json({
        error: "Failed to create summary",
        details: error,
      });
    }
  },

  // New endpoint: Download PDF from GridFS by summary ID
  async downloadPdf(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { documentId } = req.query; // Accept documentId as a query parameter for extra safety
      let summary: any;
      if (documentId) {
        summary = (await Summary.findOne({ id, documentId }).lean()) as any;
      } else {
        summary = (await Summary.findOne({ id }).lean()) as any;
      }
      if (!summary || !(summary as any).pdfFileKey) {
        return res
          .status(404)
          .json({ error: "PDF not found for this summary" });
      }
      res.set("Content-Type", "application/pdf");
      const getObjectCommand = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: (summary as any).pdfFileKey,
      });
      const s3Response = await r2Client.send(getObjectCommand);
      if (s3Response.Body) {
        (s3Response.Body as any).pipe(res);
      } else {
        res.status(500).json({ error: "File stream not available" });
      }
    } catch (error) {
      console.error("Error downloading PDF from S3:", error);
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
      const summary = await Summary.findOneAndDelete(query).lean();
      if (summary && summary.pdfFileKey) {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: summary.pdfFileKey,
          })
        );
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
