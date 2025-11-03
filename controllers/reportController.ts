import { Request, Response } from "express";
import { Report } from "../models/Report";
import { User } from "../models/User";
import { Document } from "../models/Document";
import axios from "axios";
import { io } from "../index";
import { publishEvent } from "../lib/events";

import { writeFile, unlink } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

interface AuthRequest extends Request {
  user?: any;
  userDomain?: string;
  currentWorkspace?: string;
}

export const reportController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      const query: any = {
        domain: req.userDomain, // Filter by user's domain
        workspaceId: currentWorkspace, // Filter by user's workspace
      };

      // Visibility: All members of the workspace can see all reports in that workspace.
      // Do not further restrict by userId/microsoftId for reads.

      const reports = await Report.find(query).sort({ updatedAt: -1 });
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Error fetching reports" });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only access reports from their domain
      };

      const report = await Report.findOne(query);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Error fetching report:", error);
      res.status(500).json({ message: "Error fetching report" });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const { title, content, drhpId, rhpId, drhpNamespace, rhpNamespace } =
        req.body;

      if (
        !title ||
        !content ||
        !drhpId ||
        !rhpId ||
        !drhpNamespace ||
        !rhpNamespace
      ) {
        return res.status(400).json({
          message: "Missing required fields",
          required: {
            title,
            content,
            drhpId,
            rhpId,
            drhpNamespace,
            rhpNamespace,
          },
        });
      }

      // Get current workspace from request
      const currentWorkspace = req.currentWorkspace || req.userDomain;

      // Get domainId - try from user first, then from document as fallback
      let domainId: string | undefined;
      
      // Try to get from user
      if (req.user?._id) {
        const userWithDomain = await User.findById(req.user._id).select("domainId");
        if (userWithDomain?.domainId) {
          domainId = userWithDomain.domainId;
        }
      }
      
      // Fallback: Get domainId from DRHP document if user domainId not available
      if (!domainId && drhpId) {
        try {
          const drhpDoc = await Document.findOne({ id: drhpId }).select("domainId");
          if (drhpDoc?.domainId) {
            domainId = drhpDoc.domainId;
            console.log(`Retrieved domainId from DRHP document: ${domainId}`);
          }
        } catch (docError) {
          console.warn("Could not fetch DRHP document to get domainId:", docError);
        }
      }
      
      // Fallback: Get domainId from RHP document if still not available
      if (!domainId && rhpId) {
        try {
          const rhpDoc = await Document.findOne({ id: rhpId }).select("domainId");
          if (rhpDoc?.domainId) {
            domainId = rhpDoc.domainId;
            console.log(`Retrieved domainId from RHP document: ${domainId}`);
          }
        } catch (docError) {
          console.warn("Could not fetch RHP document to get domainId:", docError);
        }
      }
      
      if (!domainId) {
        return res.status(400).json({ 
          error: "domainId not found. Please contact administrator.",
          message: "Failed to create report - missing domainId. Could not retrieve from user or documents."
        });
      }

      // Ensure one report per DRHP/RHP pair in the workspace: replace previous if exists
      await Report.deleteMany({
        domain: req.userDomain,
        workspaceId: currentWorkspace,
        drhpNamespace,
        rhpNamespace,
      });

      const reportData: any = {
        id: Date.now().toString(),
        title,
        content,
        drhpId,
        rhpId,
        drhpNamespace,
        rhpNamespace,
        domain: req.userDomain, // Add domain for workspace isolation - backward compatibility
        domainId: domainId, // Link to Domain schema - REQUIRED
        workspaceId: currentWorkspace, // Add workspace for team isolation
        updatedAt: new Date(),
      };


      const report = new Report(reportData);
      await report.save();

      // Publish event for workspace notification
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "report.created",
        resourceType: "report",
        resourceId: report.id,
        title: `New report created: ${report.title}`,
        notifyWorkspace: true,
      });

      res.status(201).json(report);
    } catch (error) {
      console.error("Error creating report:", error);
      res
        .status(500)
        .json({ error: "Failed to create report", details: error });
    }
  },

  async reportStatusUpdate(req: Request, res: Response) {
    try {
      const { jobId, status, error } = req.body;
      if (!jobId || !status) {
        return res.status(400).json({ message: "Missing jobId or status" });
      }
      // Emit real-time update
      io.emit("compare_status", { jobId, status, error });
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

  // Download DOCX generated from HTML content by report ID
  async downloadDocx(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const report = await Report.findOne({ id });
      if (!report || !report.content) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Write HTML to a temp file
      const tmpDir = os.tmpdir();
      const htmlPath = path.join(tmpDir, `report_${id}.html`);
      const docxPath = path.join(tmpDir, `report_${id}.docx`);
      await writeFile(htmlPath, report.content, "utf8");

      // Convert HTML to DOCX using Pandoc
      await execAsync(`pandoc "${htmlPath}" -o "${docxPath}"`);

      // Send DOCX file
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${report.title || "report"}.docx"`
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
        domain: req.userDomain, // Ensure user can only update reports from their domain
      };

      // All workspace members can update reports in their workspace
      // No user-based filtering needed - workspace isolation is sufficient

      const report = await Report.findOneAndUpdate(query, req.body, {
        new: true,
      });
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Error updating report:", error);
      res.status(500).json({ error: "Failed to update report" });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      const query: any = {
        id: req.params.id,
        domain: req.userDomain, // Ensure user can only delete reports from their domain
      };

      // Admins can delete all reports in their domain, regular users see only their own
      if (req.user.role !== "admin") {
        if (req.user.microsoftId) {
          query.microsoftId = req.user.microsoftId;
        } else if (req.user._id) {
          query.userId = req.user._id.toString();
        } else {
          return res.status(400).json({ error: "No user identifier found" });
        }
      }

      const report = await Report.findOne(query);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      await report.deleteOne();
      await publishEvent({
        actorUserId: req.user?._id?.toString?.(),
        domain: req.userDomain!,
        action: "report.deleted",
        resourceType: "report",
        resourceId: report.id,
        title: `Report deleted: ${report.title || report.id}`,
        notifyWorkspace: true,
      });
      res.json({ message: "Report deleted successfully" });
    } catch (error) {
      console.error("Error deleting report:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  },

  async downloadPdfFromHtml(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const report = await Report.findOne({ id });
      if (!report || !report.content) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Call PDF.co API to generate PDF from HTML
      try {
        const pdfcoResponse = await axios.post(
          "https://api.pdf.co/v1/pdf/convert/from/html",
          {
            html: report.content,
            name: `${report.title || "report"}.pdf`,
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
          `attachment; filename=\"${report.title || "report"}.pdf\"`
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

  // Admin: Get all reports across all workspaces in domain
  async getAllAdmin(req: AuthRequest, res: Response) {
    try {
      const user = req.user;
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const query: any = {
        domain: req.user?.domain || req.userDomain, // Use user's actual domain for admin
      };

      const reports = await Report.find(query).sort({ updatedAt: -1 });
      
      // Get all workspaces to map workspaceId to workspace name
      const { Workspace } = await import("../models/Workspace");
      const workspaces = await Workspace.find({ domain: req.user?.domain || req.userDomain });
      const workspaceMap = new Map(workspaces.map(ws => [ws.workspaceId, { workspaceId: ws.workspaceId, name: ws.name, slug: ws.slug }]));

      // Add workspace information to each report
      const reportsWithWorkspace = reports.map(report => ({
        ...report.toObject(),
        workspaceId: workspaceMap.get(report.workspaceId) || { workspaceId: report.workspaceId, name: workspaceMap.get(report.workspaceId)?.name ? workspaceMap.get(report.workspaceId)?.name : 'Excollo', slug: 'unknown' }
      }));

      res.json(reportsWithWorkspace);
    } catch (error) {
      console.error("Error fetching admin reports:", error);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  },
};
