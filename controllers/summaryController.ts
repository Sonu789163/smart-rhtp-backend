/// <reference path="../types/html-docx-js.d.ts" />
import { Request, Response } from "express";
import { Summary } from "../models/Summary";
import { Document } from "../models/Document";
import { Domain } from "../models/Domain";
import { User } from "../models/User";
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

      // Resolve domainId - can come from request body, user, or document
      let domainId: string | undefined = req.body.domainId;
      let domain: string | undefined = req.body.domain || req.userDomain;

      // If domainId not in request body, try to get it
      if (!domainId) {
        // Try from domain name if we have it
        if (domain) {
          try {
            const domainRecord = await Domain.findOne({ domainName: domain, status: "active" });
            if (domainRecord) {
              domainId = domainRecord.domainId;
            }
          } catch (error) {
            console.error("Error fetching domainId from Domain:", error);
          }
        }

        // Fallback: get from document
        if (!domainId && documentId) {
          try {
            const doc = await Document.findOne({ id: documentId });
            if (doc && (doc as any).domainId) {
              domainId = (doc as any).domainId;
              if (!domain) domain = doc.domain;
            }
          } catch (error) {
            console.error("Error fetching domainId from document:", error);
          }
        }

        // Fallback: get from user if available
        if (!domainId && req.user?._id) {
          try {
            const user = await User.findById(req.user._id).select("domainId domain");
            if (user && (user as any).domainId) {
              domainId = (user as any).domainId;
              if (!domain) domain = user.domain;
            }
          } catch (error) {
            console.error("Error fetching domainId from user:", error);
          }
        }
      }

      // If still no domainId, we cannot proceed
      if (!domainId || !domain) {
        return res.status(400).json({
          error: "domainId and domain are required",
          message: "Unable to determine domainId. Please ensure domainId is provided in request body or linked to the document.",
        });
      }

      const summaryData: any = {
        id: Date.now().toString(),
        title,
        content,
        documentId,
        domain: domain, // Add domain for workspace isolation
        domainId: domainId, // Link to Domain schema - REQUIRED
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
      try {
        const pdfcoResponse = await axios.post(
          "https://api.pdf.co/v1/pdf/convert/from/html",
          {
            html: summary.content,
            name: `${summary.title || "summary"}.pdf`,
            allowAbsoluteUrls: true,
          },
          {
            headers: {
              "x-api-key": process.env.PDFCO_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        if (!pdfcoResponse.data || !pdfcoResponse.data.url) {
          // Check if PDF.co returned an error in the response
          if (pdfcoResponse.data?.error || pdfcoResponse.data?.status === 402) {
            const errorMsg = pdfcoResponse.data?.message || "PDF.co API error: Insufficient credits or service unavailable";
            console.error("PDF.co API error:", pdfcoResponse.data);
            return res.status(503).json({ 
              error: "PDF generation service temporarily unavailable", 
              message: errorMsg,
              details: "The PDF generation service is currently unavailable. Please try again later or contact support."
            });
          }
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
      } catch (pdfcoError: any) {
        // Handle PDF.co specific errors
        if (pdfcoError.response?.status === 402) {
          const errorData = pdfcoError.response?.data || {};
          console.error("PDF.co API error (402):", errorData);
          return res.status(503).json({ 
            error: "PDF generation service unavailable", 
            message: errorData.message || "Insufficient credits for PDF generation",
            details: "The PDF generation service requires additional credits. Please contact support or try again later."
          });
        }
        if (pdfcoError.response?.status) {
          const errorData = pdfcoError.response?.data || {};
          console.error(`PDF.co API error (${pdfcoError.response.status}):`, errorData);
          return res.status(503).json({ 
            error: "PDF generation service error", 
            message: errorData.message || "PDF generation failed",
            details: "The PDF generation service encountered an error. Please try again later."
          });
        }
        throw pdfcoError; // Re-throw if it's not a PDF.co response error
      }
    } catch (error: any) {
      console.error("Error generating PDF with PDF.co:", error);
      
      // Check if response was already sent
      if (res.headersSent) {
        return;
      }
      
      // Return proper error response
      res.status(500).json({ 
        error: "Failed to generate PDF", 
        message: error.message || "An unexpected error occurred",
        details: "Please try again later or contact support if the problem persists."
      });
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
