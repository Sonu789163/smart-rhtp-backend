/// <reference path="../types/html-docx-js.d.ts" />
import { Request, Response } from "express";
import { Summary } from "../models/Summary";
import axios from "axios";
import { writeFile, unlink } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import htmlDocx from "html-docx-js";
import { io } from "../index";
import { publishEvent } from "../lib/events";

const execAsync = promisify(exec);

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

export const summaryController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const query: any = {
        domain: req.userDomain, // Filter by user's domain
        workspaceId: currentWorkspace, // Filter by user's workspace
      };

      const link = (req as any).linkAccess;
      // Admins or link access can see all summaries in domain
      if (!link && req.user && req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        }
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
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const query: any = {
        documentId,
        domain: req.userDomain, // Filter by user's domain
        workspaceId: currentWorkspace, // Filter by user's workspace
      };

      const link = (req as any).linkAccess;
      // All workspace members can see all summaries in their workspace
      // No user-based filtering needed - workspace isolation is sufficient

      const summaries = await Summary.find(query).sort({
        updatedAt: -1,
      });
      res.json(summaries);
    } catch (error) {
      console.error("Error fetching summaries:", error);
      res.status(500).json({ message: "Error fetching summaries" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const { title, content, documentId } = req.body;
      if (!title || !content || !documentId) {
        return res.status(400).json({
          message: "Missing required fields",
          required: { title, content, documentId },
        });
      }

      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const summaryData: any = {
        id: Date.now().toString(),
        title,
        content,
        documentId,
        domain: req.userDomain, // Add domain for workspace isolation
        workspaceId: currentWorkspace, // Add workspace for team isolation
        updatedAt: new Date(),
      };

      // // Add user information if available
      // if (req.user) {
      //   if (req.user.microsoftId) {
      //     summaryData.microsoftId = req.user.microsoftId;
      //   } else if (req.user._id) {
      //     summaryData.userId = req.user._id.toString();
      //   }
      // }

      const summary = new Summary(summaryData);
      await summary.save();

      // Publish event for workspace notification
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "summary.created",
        resourceType: "summary",
        resourceId: summary.id,
        title: `New summary created: ${summary.title}`,
        notifyWorkspace: true,
      });

      res.status(201).json(summary);
    } catch (error) {
      console.error("Error creating summary:", error);
      res.status(500).json({
        error: "Failed to create summary",
        details: error,
      });
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
      const query: any = {
        id,
        domain: req.userDomain, // Ensure user can only update summaries from their domain
      };

      // All workspace members can update summaries in their workspace
      // No user-based filtering needed - workspace isolation is sufficient

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
      const query: any = {
        id,
        domain: req.userDomain, // Ensure user can only delete summaries from their domain
      };

      // All workspace members can delete summaries in their workspace
      // No user-based filtering needed - workspace isolation is sufficient

      const summary = await Summary.findOneAndDelete(query).lean();
      if (summary) {
        await publishEvent({
          actorUserId: req.user?._id?.toString?.(),
          domain: req.userDomain!,
          action: "summary.deleted",
          resourceType: "summary",
          resourceId: summary.id,
          title: `Summary deleted: ${summary.title || summary.id}`,
          notifyWorkspace: true,
        });
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

  async downloadHtmlPdf(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const summary = await Summary.findOne({ id });
      if (!summary || !summary.content) {
        return res.status(404).json({ error: "Summary not found" });
      }

      // Call PDF.co API to generate PDF from HTML
      const pdfcoResponse = await axios.post(
        "https://api.pdf.co/v1/pdf/convert/from/html",
        {
          html: summary.content,
          name: `${summary.title || "summary"}.pdf`,
        },
        {
          headers: {
            "x-api-key": process.env.PDFCO_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      if (!pdfcoResponse.data || !pdfcoResponse.data.url) {
        throw new Error("PDF.co did not return a PDF URL");
      }

      // Download the generated PDF and stream to client
      const pdfStream = await axios.get(pdfcoResponse.data.url, {
        responseType: "stream",
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"${summary.title || "summary"}.pdf\"`
      );
      pdfStream.data.pipe(res);
    } catch (error) {
      console.error("Error generating PDF with PDF.co:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },

  // Admin: Get all summaries across all workspaces in domain
  async getAllAdmin(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const query: any = {
        domain: req.user?.domain || req.userDomain, // Use user's actual domain for admin
      };

      const summaries = await Summary.find(query).sort({ updatedAt: -1 });

      // Get all workspaces to map workspaceId to workspace name
      const { Workspace } = await import("../models/Workspace");
      const workspaces = await Workspace.find({
        domain: req.user?.domain || req.userDomain,
      });
      const workspaceMap = new Map(
        workspaces.map((ws) => [
          ws.workspaceId,
          { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug },
        ])
      );

      // Add workspace information to each summary
      const summariesWithWorkspace = summaries.map((summary) => ({
        ...summary.toObject(),
        workspaceId: workspaceMap.get(summary.workspaceId) || {
          workspaceId: summary.workspaceId,
          name: workspaceMap.get(summary.workspaceId)?.name
            ? workspaceMap.get(summary.workspaceId)?.name
            : "Excollo",
          slug: "unknown",
        },
      }));

      res.json(summariesWithWorkspace);
    } catch (error) {
      console.error("Error fetching admin summaries:", error);
      res.status(500).json({ error: "Failed to fetch summaries" });
    }
  },
};
